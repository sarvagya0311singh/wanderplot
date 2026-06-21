/**
 * POST /api/admin/ingest/wikidata
 *
 * Phase B: Ingest Indian tourism destinations from Wikidata SPARQL.
 * Runs in batches (INGEST_BATCH_SIZE) with cursor checkpointing in IngestionState.
 *
 * Flow per batch:
 *   1. Query Wikidata SPARQL (India tourism places, offset by cursor)
 *   2. Validate + normalise each result (§6.4 bounds + required fields)
 *   3. Enrich with Gemini (Phase B) — bestMonths, description, events, budget
 *   4. Upsert to Destinations collection on {name, state} key
 *   5. Checkpoint cursor in IngestionState
 *
 * Idempotent: re-running with same cursor → same upsert (no duplicates).
 * Protected by Authorization: Bearer <ADMIN_SECRET>.
 */

import { NextRequest, NextResponse } from 'next/server';
import { isDbConfigured, env } from '@/config/env.config';
import { normalizeWikidataDestination } from '@/lib/ingest/normalize';
import { enrichDestinationWithGemini } from '@/lib/ingest/geminiEnrich';

const WIKIDATA_SPARQL = 'https://query.wikidata.org/sparql';

function buildSparqlQuery(offset: number, limit: number): string {
  return `
SELECT DISTINCT ?item ?itemLabel ?coord ?stateLabel ?instanceOf ?image WHERE {
  ?item wdt:P17 wd:Q668 .                         # country = India
  ?item wdt:P31 ?instanceOf .                      # instance of something
  VALUES ?instanceOf {
    wd:Q515     # city
    wd:Q3957    # town
    wd:Q532     # village
    wd:Q1549591 # big city
    wd:Q39816   # beach
    wd:Q8502    # mountain
    wd:Q22698   # national park
    wd:Q35509   # fort
    wd:Q839954  # Hindu temple
    wd:Q44539   # mosque
    wd:Q48349   # gurdwara
    wd:Q16970   # church
    wd:Q4022    # river
    wd:Q23397   # lake
    wd:Q1411931 # hill station
    wd:Q570116  # desert
    wd:Q179049  # backwater
    wd:Q182918  # waterfall
    wd:Q207694  # art museum
  }
  ?sitelink schema:about ?item ; schema:isPartOf <https://en.wikipedia.org/> . # Must have Wikipedia page (notable)
  ?item wdt:P625 ?coord .                          # has coordinates
  OPTIONAL { ?item wdt:P131 ?state . ?state wdt:P31/wdt:P279* wd:Q13220204 . }  # administrative state
  OPTIONAL { ?item wdt:P18 ?image . }              # image (CC-licensed on Commons)
  SERVICE wikibase:label { bd:serviceParam wikibase:language "en" . }
  FILTER(BOUND(?coord))
}
ORDER BY ?item
LIMIT ${limit}
OFFSET ${offset}
`.trim();
}

function requireAdmin(req: NextRequest): boolean {
  if (!env.adminSecret) {
    console.warn('[wikidata-ingest] ADMIN_SECRET not set — dev mode');
    return true;
  }
  return req.headers.get('authorization') === `Bearer ${env.adminSecret}`;
}

export async function POST(req: NextRequest) {
  if (!requireAdmin(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  if (!isDbConfigured()) {
    return NextResponse.json({ error: 'MONGODB_URI not configured' }, { status: 503 });
  }

  const body = await req.json().catch(() => ({}));
  const dryRun = body.dryRun === true;
  const batchSize = body.batchSize ?? env.ingestBatchSize;
  const skipEnrich = body.skipEnrich === true; // skip Gemini enrichment (faster, for testing)

  const { connectDB } = await import('@/lib/db');
  const { Destination } = await import('@/models/Destination');
  const { IngestionState } = await import('@/models/IngestionState');
  await connectDB();

  // Load / init ingestion state
  const state = await IngestionState.findOneAndUpdate(
    { jobId: 'wikidata-ingest' },
    { $setOnInsert: { jobId: 'wikidata-ingest', phase: 'wikidata', status: 'idle', cursor: '0', totalProcessed: 0, totalInserted: 0, totalMerged: 0, totalRejected: 0 } },
    { upsert: true, new: true }
  );

  const offset = parseInt(state.cursor || '0', 10);
  await IngestionState.updateOne({ jobId: 'wikidata-ingest' }, { status: 'running', lastRunAt: new Date() });

  const results = {
    processed: 0, inserted: 0, merged: 0, rejected: 0,
    errors: [] as string[],
  };

  // ── Step 1: Query Wikidata ────────────────────────────────────────────────
  let rawResults: Record<string, { value: string }>[] = [];
  try {
    const sparql = buildSparqlQuery(offset, batchSize);
    const res = await fetch(
      `${WIKIDATA_SPARQL}?query=${encodeURIComponent(sparql)}&format=json`,
      {
        headers: {
          'Accept': 'application/sparql-results+json',
          'User-Agent': 'WanderPlot/1.0 (travel-planner; contact@wanderplot.com)',
        },
        signal: AbortSignal.timeout(30_000),
      }
    );
    if (!res.ok) throw new Error(`Wikidata HTTP ${res.status}`);
    const json = await res.json();
    rawResults = json.results?.bindings ?? [];
  } catch (err) {
    await IngestionState.updateOne({ jobId: 'wikidata-ingest' }, { status: 'failed', lastError: String(err) });
    return NextResponse.json({ error: 'Wikidata query failed', detail: String(err) }, { status: 502 });
  }

  if (rawResults.length === 0) {
    await IngestionState.updateOne({ jobId: 'wikidata-ingest' }, { status: 'completed', cursor: '0' });
    return NextResponse.json({ ...results, done: true, message: '✅ Wikidata ingestion complete — no more results.' });
  }

  // ── Step 2–4: Normalise → Enrich → Upsert ────────────────────────────────
  for (const raw of rawResults) {
    // Adapt Wikidata binding to expected shape
    const wikiDoc = {
      item:          raw.item,
      itemLabel:     raw.itemLabel,
      coord:         raw.coord,
      stateLabel:    raw.stateLabel,
      instanceOf:    raw.instanceOf,
      image:         raw.image,
    };

    const normalised = normalizeWikidataDestination(wikiDoc);
    if (normalised.rejected || !normalised.data) {
      results.rejected++;
      if (normalised.errors.length > 0) {
        results.errors.push(`${wikiDoc.itemLabel?.value || 'unknown'}: ${normalised.errors.map(e => e.reason).join('; ')}`);
      }
      continue;
    }

    const d = normalised.data;
    const [lng, lat] = d.location.coordinates;

    // Phase B: Gemini enrichment (optional — skip for fast test runs)
    let enriched = null;
    if (!skipEnrich) {
      try {
        enriched = await enrichDestinationWithGemini(d.name, d.state, lat, lng);
        if (!enriched) {
          results.rejected++;
          results.errors.push(`${d.name}: Gemini enrichment failed`);
          continue; // Don't persist unenriched records from Wikidata
        }
      } catch (err) {
        results.errors.push(`${d.name}: ${err instanceof Error ? err.message : err}`);
        results.rejected++;
        continue;
      }
    }

    results.processed++;

    const doc = {
      name:             d.name,
      state:            d.state,
      region:           d.region,
      country:          'India',
      location:         d.location,
      coordinates:      { lat, lng },
      scenery:          d.scenery,
      experienceTypes:  d.experienceTypes,
      bestMonths:       enriched?.bestMonths ?? [],
      budgetRange:      enriched?.budgetRange ?? { min: 1000, max: 3000 },
      description:      enriched?.description ?? '',
      highlights:       enriched?.highlights ?? [],
      tags:             enriched?.tags ?? d.tags ?? [],
      images:           d.images ?? [],
      events:           enriched?.events ?? [],
      accessNote:       enriched?.accessNote,
      offSeasonWarning: enriched?.offSeasonWarning,
      dealbreakers:     [],
      requiresFlight:   enriched?.requiresFlight ?? false,
      monsoonRisk:      enriched?.monsoonRisk ?? false,
      kidFriendly:      enriched?.kidFriendly ?? true,
      wheelchairAccessible: enriched?.wheelchairAccessible ?? false,
      petFriendly:      enriched?.petFriendly ?? false,
      geohash:          d.geohash,
      source:           'wikidata' as const,
      wikidataId:       d.wikidataId,
      confidence:       enriched?.confidence ?? 'medium',
      popularity:       0,
    };

    if (!dryRun && enriched) {
      try {
        const existing = await Destination.findOne({ name: d.name, state: d.state });
        if (existing) {
          // Only upgrade fields that Wikidata adds (don't clobber better data)
          await Destination.updateOne({ _id: existing._id }, {
            $set: {
              wikidataId: doc.wikidataId,
              ...(doc.images.length > 0 ? { images: [...new Set([...existing.images, ...doc.images])] } : {}),
            },
          });
          results.merged++;
        } else {
          await Destination.create(doc);
          results.inserted++;
        }
      } catch (err) {
        results.errors.push(`${d.name}: DB error — ${err instanceof Error ? err.message : err}`);
        results.rejected++;
      }
    } else if (!dryRun && skipEnrich) {
      // Insert without enrichment (for testing the normalise pipeline)
      try {
        await Destination.findOneAndUpdate(
          { name: d.name, state: d.state },
          { $setOnInsert: { ...doc, description: 'Placeholder — run without skipEnrich to enrich' } },
          { upsert: true }
        );
        results.inserted++;
      } catch { results.merged++; }
    } else {
      results.inserted++; // dry run
    }
  }

  // ── Step 5: Checkpoint ────────────────────────────────────────────────────
  const newOffset = offset + rawResults.length;
  const isDone = rawResults.length < batchSize;

  if (!dryRun) {
    await IngestionState.updateOne(
      { jobId: 'wikidata-ingest' },
      {
        cursor:         isDone ? '0' : String(newOffset),
        status:         isDone ? 'completed' : 'running',
        totalProcessed: state.totalProcessed + results.processed,
        totalInserted:  state.totalInserted + results.inserted,
        totalMerged:    state.totalMerged + results.merged,
        totalRejected:  state.totalRejected + results.rejected,
      }
    );
  }

  return NextResponse.json({
    ...results,
    dryRun,
    offset,
    newOffset,
    batchSize,
    done: isDone,
    message: isDone
      ? `✅ Wikidata ingestion complete. Total processed this session: ${state.totalProcessed + results.processed}.`
      : `Batch done. POST again to continue from offset ${newOffset}.`,
  });
}
