/**
 * POST /api/admin/ingest/seed-enrich
 *
 * Phase A: Bootstrap the MongoDB Destinations collection from the static seed catalog.
 *
 * Takes the 30 hardcoded destinations in src/data/destinations.ts, enriches each with
 * Gemini (bestMonths, description, budgetRange, events, etc.), and upserts them into Atlas.
 *
 * This is idempotent — re-running just re-enriches existing records.
 * Protected by Authorization: Bearer <ADMIN_SECRET> header.
 *
 * Body (optional):
 *   { "dryRun": true }  — validate + enrich without writing to DB
 *   { "batchSize": 5 }  — override ingest batch size
 */

import { NextRequest, NextResponse } from 'next/server';
import { isDbConfigured, env } from '@/config/env.config';
import { destinations as staticCatalog } from '@/data/destinations';
import { enrichDestinationWithGemini } from '@/lib/ingest/geminiEnrich';
import { computeGeohash, regionFromState, validateCoordinates } from '@/lib/geo';

function requireAdmin(req: NextRequest): boolean {
  if (!env.adminSecret) {
    // In dev without ADMIN_SECRET, allow — just log a warning
    console.warn('[seed-enrich] ADMIN_SECRET not set — allowing unauthenticated access (dev mode)');
    return true;
  }
  const auth = req.headers.get('authorization');
  return auth === `Bearer ${env.adminSecret}`;
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

  const { connectDB } = await import('@/lib/db');
  const { Destination } = await import('@/models/Destination');
  const { IngestionState } = await import('@/models/IngestionState');
  await connectDB();

  // Track state
  const state = await IngestionState.findOneAndUpdate(
    { jobId: 'seed-enrich' },
    { $setOnInsert: { jobId: 'seed-enrich', phase: 'seed-enrich', status: 'idle', cursor: '0', totalProcessed: 0, totalInserted: 0, totalMerged: 0, totalRejected: 0 } },
    { upsert: true, new: true }
  );
  const startIdx = parseInt(state.cursor || '0', 10);
  await IngestionState.updateOne({ jobId: 'seed-enrich' }, { status: 'running', lastRunAt: new Date() });

  const results = {
    processed: 0, inserted: 0, merged: 0, rejected: 0,
    errors: [] as string[],
  };

  const batch = staticCatalog.slice(startIdx, startIdx + batchSize);

  for (let i = 0; i < batch.length; i++) {
    const dest = batch[i];
    const { lat, lng } = dest.coordinates;

    // Validate coords
    const coordCheck = validateCoordinates(lat, lng);
    if (!coordCheck.valid) {
      results.rejected++;
      results.errors.push(`${dest.name}: ${coordCheck.reason}`);
      continue;
    }

    // Gemini enrichment
    const enriched = await enrichDestinationWithGemini(dest.name, dest.state, lat, lng, dest.description);
    results.processed++;

    const doc = {
      name:             dest.name,
      state:            dest.state,
      region:           regionFromState(dest.state),
      country:          dest.country ?? 'India',
      location:         { type: 'Point' as const, coordinates: [lng, lat] as [number, number] },
      coordinates:      { lat, lng },
      scenery:          dest.scenery,
      experienceTypes:  dest.experienceTypes,
      bestMonths:       enriched?.bestMonths ?? dest.bestMonths,
      budgetRange:      enriched?.budgetRange ?? dest.budgetRange,
      description:      enriched?.description ?? dest.description,
      highlights:       enriched?.highlights ?? dest.highlights,
      tags:             enriched?.tags ?? dest.tags,
      images:           dest.images ?? [],
      events:           enriched?.events ?? [],
      accessNote:       enriched?.accessNote,
      offSeasonWarning: enriched?.offSeasonWarning,
      dealbreakers:     dest.dealbreakers ?? [],
      requiresFlight:   enriched?.requiresFlight ?? (dest.dealbreakers?.includes('no-flights') ?? false),
      monsoonRisk:      enriched?.monsoonRisk ?? false,
      kidFriendly:      enriched?.kidFriendly ?? true,
      wheelchairAccessible: enriched?.wheelchairAccessible ?? false,
      petFriendly:      enriched?.petFriendly ?? false,
      geohash:          computeGeohash(lat, lng),
      source:           'seed' as const,
      confidence:       enriched?.confidence ?? 'high',
      popularity:       0,
      rating:           dest.rating,
      reviewCount:      dest.reviewCount,
    };

    if (!dryRun) {
      try {
        const existing = await Destination.findOne({ name: dest.name, state: dest.state });
        if (existing) {
          await Destination.updateOne({ _id: existing._id }, { $set: doc });
          results.merged++;
        } else {
          await Destination.create(doc);
          results.inserted++;
        }
      } catch (err) {
        results.errors.push(`${dest.name}: ${err instanceof Error ? err.message : String(err)}`);
        results.rejected++;
      }
    } else {
      results.inserted++; // dry run — count as "would insert"
    }

    // Checkpoint cursor
    if (!dryRun) {
      const nextCursor = String(startIdx + i + 1);
      const done = (startIdx + i + 1) >= staticCatalog.length;
      await IngestionState.updateOne(
        { jobId: 'seed-enrich' },
        {
          cursor:         done ? '0' : nextCursor,
          status:         done ? 'completed' : 'running',
          totalProcessed: state.totalProcessed + results.processed,
          totalInserted:  state.totalInserted + results.inserted,
          totalMerged:    state.totalMerged + results.merged,
          totalRejected:  state.totalRejected + results.rejected,
        }
      );
    }
  }

  const totalInCatalog = staticCatalog.length;
  const isDone = (startIdx + batch.length) >= totalInCatalog;

  return NextResponse.json({
    ...results,
    dryRun,
    startIdx,
    endIdx: startIdx + batch.length,
    totalInCatalog,
    done: isDone,
    message: isDone
      ? `✅ All ${totalInCatalog} seed destinations processed.`
      : `Processed ${startIdx + batch.length}/${totalInCatalog}. POST again to continue.`,
  });
}
