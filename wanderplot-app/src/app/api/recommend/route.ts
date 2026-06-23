/**
 * POST /api/recommend
 *
 * §3 / §10 hybrid recommendation flow with full fallback matrix:
 *
 *   1. Normalise + band inputs → cacheKey (SHA-256)
 *   2. Redis (Upstash) cache-aside — hit → return immediately
 *   3. Geocode origin → originCoords (Nominatim → Gemini → null)
 *   4a. IF MongoDB configured:
 *       • $geoNear aggregate with HARD-FILTER query (scenery, experience, dealbreakers)
 *       • Returns ≤100 candidates; NEVER scans the whole collection
 *       • If zero candidates, relax soft constraints per §5.5
 *   4b. IF MongoDB NOT configured (or fails):
 *       • Apply in-memory hard filters to static 30
 *       • Optionally enrich with ephemeral Gemini candidates
 *   5. Score candidates with tuned weighted scorer (§5.2)
 *   6. Honest poor-fit handling (§5.5)
 *   7. Write Redis + Mongo cache; return top 8
 *
 * Never 500 due to a dependency being down — every external call is try/caught.
 *
 * Fallback matrix (§10):
 *   Gemini ✅ MongoDB ✅ Redis ✅ → full hybrid + Redis cache
 *   Gemini ✅ MongoDB ✅ Redis ❌ → full hybrid, Mongo cache only
 *   Gemini ✅ MongoDB ❌ Redis — → static 30 + ephemeral Gemini, no persistence
 *   Gemini ❌ MongoDB ✅ Redis — → DB $geoNear, no AI enrichment
 *   Gemini ❌ MongoDB ❌ Redis — → static 30, exactly today's behaviour
 */

import { NextRequest, NextResponse } from 'next/server';
import { createHash } from 'crypto';
import { applyFiltersAndScore, diversifyByScenery, defaultPartySize, scoreDestinations, TripInputs } from '@/lib/recommend';
import { geocodeOrigin, maxDistanceMeters, validateCoordinates, regionFromState } from '@/lib/geo';
import { effectiveMaxDistanceMeters, isRoadMode } from '@/lib/transport';
import { generateCandidates, TripInputsForAI } from '@/lib/destinationAI';
import { indianCities } from '@/data/indianCities';
import { isDbConfigured, isRedisConfigured, isAiGenerationEnabled, env } from '@/config/env.config';
import { destinations as staticCatalog } from '@/data/destinations';

const TOP_N = 8;
const CANDIDATE_LIMIT = 100; // $geoNear result cap before scoring

// ─── Cache key builder (§8.1) ─────────────────────────────────────────────────

function buildCacheKey(inputs: TripInputs, originCity: string): string {
  const daysBucket = inputs.days <= 2 ? '1-2' : inputs.days <= 5 ? '3-5' : inputs.days <= 9 ? '6-9' : '10-14';
  const budgetBand = Math.round(inputs.budget / 2500) * 2500;
  const canonical = JSON.stringify({
    origin:       originCity.trim().toLowerCase(),
    month:        inputs.month,
    days:         daysBucket,
    budget:       budgetBand,
    partySize:    inputs.partySize,
    groupType:    inputs.groupType,
    pace:         inputs.pace,
    scenery:      [...inputs.scenery].sort(),
    experience:   [...inputs.experience].sort(),
    dealbreakers: [...inputs.dealbreakers].sort(),
    vehicle:      inputs.vehicle ?? 'flexible',
    maxDistanceKm:inputs.maxDistanceKm ?? 0,
  });
  return createHash('sha256').update(canonical).digest('hex');
}

// ─── Redis helpers ────────────────────────────────────────────────────────────

async function getRedisCache(key: string): Promise<unknown | null> {
  if (!isRedisConfigured()) return null;
  try {
    const { Redis } = await import('@upstash/redis');
    const redis = new Redis({ url: env.upstashRedisRestUrl!, token: env.upstashRedisRestToken! });
    return await redis.get(key);
  } catch (err) {
    console.warn('[recommend] Redis GET error:', err instanceof Error ? err.message : err);
    return null;
  }
}

async function setRedisCache(key: string, value: unknown, ttlHours: number): Promise<void> {
  if (!isRedisConfigured()) return;
  try {
    const { Redis } = await import('@upstash/redis');
    const redis = new Redis({ url: env.upstashRedisRestUrl!, token: env.upstashRedisRestToken! });
    await redis.setex(key, ttlHours * 3600, JSON.stringify(value));
  } catch (err) {
    console.warn('[recommend] Redis SET error:', err instanceof Error ? err.message : err);
  }
}

// ─── MongoDB $geoNear query (§4.5) ───────────────────────────────────────────

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function queryDbCandidates(inputs: TripInputs, originCoords: { lat: number; lng: number } | null): Promise<any[]> {
  const { connectDB } = await import('@/lib/db');
  const { Destination } = await import('@/models/Destination');
  await connectDB();

  // Hard-filter query object — only applied when user explicitly selected
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const hardQuery: Record<string, any> = { country: 'India', confidence: { $ne: 'low' } };
  if (inputs.scenery.length > 0)     hardQuery.scenery         = { $in: inputs.scenery };
  if (inputs.experience.length > 0)  hardQuery.experienceTypes = { $in: inputs.experience };
  if (inputs.dealbreakers.includes('no-flights'))   hardQuery.requiresFlight       = false;
  if (inputs.dealbreakers.includes('wheelchair'))   hardQuery.wheelchairAccessible  = true;
  if (inputs.dealbreakers.includes('pet-friendly')) hardQuery.petFriendly           = true;

  // Parents group → exclude high-altitude destinations
  if (inputs.groupType === 'parents') {
    hardQuery.name = { $not: /^(ladakh|spiti|valley of flowers)/i };
  }

  const v = inputs.vehicle ?? 'flexible';
  if (isRoadMode(v)) {
    hardQuery.requiresFlight = false;
    hardQuery.name = { ...(hardQuery.name ?? {}), $not: /andaman|nicobar|lakshadweep/i };
  }
  if (v === 'train') {
    hardQuery.name = { ...(hardQuery.name ?? {}), $not: /andaman|nicobar|lakshadweep/i };
  }

  if (originCoords) {
    // $geoNear path — geo + filters in one index sweep (§4.5)
    const tripLenDefault = maxDistanceMeters(inputs.days);
    const distanceM = effectiveMaxDistanceMeters(v, inputs.days, inputs.maxDistanceKm, tripLenDefault);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const pipeline: any[] = [
      {
        $geoNear: {
          near:          { type: 'Point', coordinates: [originCoords.lng, originCoords.lat] },
          distanceField: 'distanceMeters',
          maxDistance:   distanceM,
          spherical:     true,
          query:         hardQuery,
        },
      },
      { $limit: CANDIDATE_LIMIT },
    ];
    return await Destination.aggregate(pipeline).exec();
  }

  // No origin coords — standard find with filters (no geo sort)
  return await Destination.find(hardQuery).limit(CANDIDATE_LIMIT).lean().exec();
}

// ─── Static catalog adapter ───────────────────────────────────────────────────

// Adapt static catalog entries to the v2 shape (add missing fields for scorer)
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function adaptStaticEntry(d: any): any {
  return {
    ...d,
    _id: d._id || d.name,
    requiresFlight:      d.dealbreakers?.includes('no-flights') ?? false,
    monsoonRisk:         false,
    kidFriendly:         true,
    wheelchairAccessible:false,
    petFriendly:         false,
    location: d.coordinates
      ? { type: 'Point', coordinates: [d.coordinates.lng, d.coordinates.lat] }
      : undefined,
    confidence: 'high',
    popularity: 0,
    source: 'seed',
    region: 'Central', // will be overridden if we know it
  };
}

// ─── Main Route ───────────────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();

    if (!body.month || !body.budget || !body.days) {
      return NextResponse.json(
        { error: 'Missing required fields: month, budget, days' },
        { status: 400 }
      );
    }

    if (body.knownDestination) {
      const partySize = Number(body.partySize) || defaultPartySize(body.groupType ?? 'solo');
      const inputs: TripInputs = {
        origin: body.origin ?? '', budget: Number(body.budget), month: Number(body.month),
        days: Number(body.days), groupType: body.groupType ?? 'solo', pace: body.pace ?? 'moderate',
        scenery: [], experience: [], dealbreakers: body.dealbreakers ?? [], partySize,
        originCoords: body.originCoords || undefined,
        vehicle: body.vehicle, maxDistanceKm: body.maxDistanceKm ? Number(body.maxDistanceKm) : undefined,
      };
      const name = String(body.knownDestination).trim();

      // 1) catalog match (full rich doc) → 2) indianCities (coords+state) → 3) geocode → 4) fallback
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      let destDoc: any = null;
      const cat = staticCatalog.find(d => d.name.toLowerCase() === name.toLowerCase());
      if (cat) {
        destDoc = adaptStaticEntry(cat);
      } else {
        const city = indianCities.find(c => c.name.toLowerCase() === name.toLowerCase());
        let coords = city ? { lat: city.lat, lng: city.lng } : null;
        const state = city?.state ?? 'India';
        if (!coords) {
          const geo = await geocodeOrigin(name);           // Nominatim → Gemini, cached, fail-open
          if (geo && validateCoordinates(geo.lat, geo.lng).valid) { coords = { lat: geo.lat, lng: geo.lng }; }
        }
        destDoc = {
          _id: name.toLowerCase().replace(/\s+/g, '-'),
          name, state, country: 'India',
          coordinates: coords ?? undefined,
          location: coords ? { type: 'Point', coordinates: [coords.lng, coords.lat] } : undefined,
          scenery: [], experienceTypes: [],
          bestMonths: [1,2,3,4,5,6,7,8,9,10,11,12],         // unknown → treat as in-season (no false "off")
          budgetRange: { min: 1000, max: 6000 },             // generic; itinerary gen does the real costing
          description: `Your chosen destination: ${name}.`,
          highlights: [], tags: [], images: [], dealbreakers: [],
          confidence: 'high', source: 'ai', popularity: 0,
          region: regionFromState(state),
        };
      }

      // Score the single destination through the EXISTING scorer → proper {totalScore, scores, reasons, seasonStatus}
      const [scored] = scoreDestinations([destDoc], inputs);
      scored.reasons = ['You specifically requested this destination.', ...scored.reasons];
      return NextResponse.json({ results: [scored], source: 'known' });
    }

    const partySize = Number(body.partySize) || defaultPartySize(body.groupType ?? 'couple');
    const inputs: TripInputs = {
      origin:      body.origin ?? '',
      budget:      Number(body.budget),
      month:       Number(body.month),
      days:        Number(body.days),
      groupType:   body.groupType ?? 'couple',
      pace:        body.pace ?? 'moderate',
      scenery:     body.scenery ?? [],
      experience:  body.experience ?? [],
      dealbreakers:body.dealbreakers ?? [],
      partySize,
      surprise:    body.surprise,
      vehicle:     body.vehicle,
      maxDistanceKm: body.maxDistanceKm ? Number(body.maxDistanceKm) : undefined,
    };

    // ── Step 1: Cache key ────────────────────────────────────────────────────
    const originCityRaw = inputs.origin;
    const cacheKey   = buildCacheKey(inputs, originCityRaw);
    const redisKey   = `reco:v2:${cacheKey}`;

    // ── Step 2: Redis cache-aside ─────────────────────────────────────────────
    let redisCached = null;
    if (!body.surprise) {
      redisCached = await getRedisCache(redisKey);
    }
    if (redisCached) {
      console.log(`[recommend] Redis HIT for ${redisKey.slice(0, 16)}…`);
      return NextResponse.json({ ...(redisCached as object), cacheHit: true, cacheTier: 'redis' });
    }

    // ── Step 3: Geocode origin ────────────────────────────────────────────────
    let originCoords: { lat: number; lng: number } | null = body.originCoords || null;
    let originCity = originCityRaw;
    if (!originCoords && inputs.origin) {
      const geo = await geocodeOrigin(inputs.origin);
      if (geo && validateCoordinates(geo.lat, geo.lng).valid) {
        originCoords = { lat: geo.lat, lng: geo.lng };
        originCity   = geo.city;
        inputs.originCoords = originCoords;
      }
    } else if (originCoords) {
      inputs.originCoords = originCoords;
    }

    // ── Step 4: Candidate pool ───────────────────────────────────────────────
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let candidates: any[] = [];
    let sourceFlag = 'local';
    let cacheHit   = false;

    if (isDbConfigured()) {
      // 4a. Check Mongo recommendation cache first
      try {
        const { connectDB } = await import('@/lib/db');
        const { RecommendationCache } = await import('@/models/RecommendationCache');
        const { Destination } = await import('@/models/Destination');
        await connectDB();
        let mongoCached = null;
        if (!body.surprise) {
          mongoCached = await RecommendationCache.findOne({ cacheKey });
        }
        if (mongoCached && mongoCached.destinationIds.length > 0) {
          const dbDocs = await Destination.find({ _id: { $in: mongoCached.destinationIds } }).lean();
          if (dbDocs.length > 0) {
            candidates = dbDocs;
            sourceFlag = 'db';
            cacheHit   = true;
            console.log(`[recommend] Mongo cache HIT ${cacheKey.slice(0, 8)}…`);
          }
        }
      } catch (dbErr) {
        console.warn('[recommend] Mongo cache lookup failed:', dbErr instanceof Error ? dbErr.message : dbErr);
      }

      // 4b. DB $geoNear query (the real engine)
      if (!cacheHit) {
        try {
          candidates = await queryDbCandidates(inputs, originCoords);
          sourceFlag = 'db';
          console.log(`[recommend] DB returned ${candidates.length} candidates`);

          // If DB returned too few, pad with static catalog (hard-filtered in-memory)
          if (candidates.length < 5) {
            const staticFiltered = staticCatalog
              .map(adaptStaticEntry)
              .filter(d => {
                if (inputs.scenery.length > 0 && !inputs.scenery.some(s => d.scenery.includes(s))) return false;
                if (inputs.experience.length > 0 && !inputs.experience.some(e => d.experienceTypes.includes(e))) return false;
                return true;
              });
            candidates = dedupeByName([...candidates, ...staticFiltered]);
            sourceFlag = 'db+static';
          }
        } catch (dbErr) {
          console.warn('[recommend] DB query failed, falling back to static:', dbErr instanceof Error ? dbErr.message : dbErr);
          candidates = staticCatalog.map(adaptStaticEntry);
          sourceFlag = 'local';
        }
      }
    } else {
      // 4c. No DB — static catalog + optional ephemeral Gemini
      candidates = staticCatalog.map(adaptStaticEntry);
      sourceFlag = 'local';
    }

    // 4d. Gemini ephemeral enrichment if pool is thin AND AI is enabled
    if (isAiGenerationEnabled() && !cacheHit && candidates.length < 10) {
      try {
        const aiInputs: TripInputsForAI = { ...inputs, partySize };
        const aiCandidates = await generateCandidates(aiInputs, originCoords, env.aiCandidateCount);
        if (aiCandidates.length > 0) {
          candidates = dedupeByName([...candidates, ...aiCandidates]);
          sourceFlag = isDbConfigured() ? 'ai+db' : 'ai-ephemeral';
          console.log(`[recommend] Gemini added ${aiCandidates.length} candidates; pool now ${candidates.length}`);

          // Persist AI candidates to DB for future cache hits
          if (isDbConfigured()) {
            await persistAiCandidates(aiCandidates).catch(e =>
              console.warn('[recommend] Failed to persist AI candidates:', e instanceof Error ? e.message : e)
            );
          }
        }
      } catch (aiErr) {
        console.warn('[recommend] Gemini generation failed:', aiErr instanceof Error ? aiErr.message : aiErr);
      }
    }

    // ── Step 5: Score + honest fallback ──────────────────────────────────────
    let filtered;
    let results;
    if (body.surprise) {
      const surprisePicks = diversifyByScenery(candidates, inputs, TOP_N);
      filtered = { results: surprisePicks };
      results = surprisePicks;
    } else {
      filtered = applyFiltersAndScore(candidates, inputs);
      results  = filtered.results.slice(0, TOP_N);
    }

    // allOffSeason banner — shown when all results are off-season
    const allOffSeason = results.length > 0 && results.every(r => r.seasonStatus === 'off');

    // ── Step 6: Write caches ──────────────────────────────────────────────────
    if (!cacheHit && results.length > 0 && !body.surprise) {
      const payload = {
        results,
        total: filtered.results.length,
        source: sourceFlag,
        cacheHit: false,
        allOffSeason,
        relaxedConstraint: filtered.relaxedConstraint,
        relaxedMessage:    filtered.relaxedMessage,
        conflictExplanation: filtered.conflictExplanation,
      };

      // Redis (fire-and-forget)
      setRedisCache(redisKey, payload, env.recoCacheTtlHours).catch(() => {});

      // Mongo RecommendationCache (fire-and-forget)
      if (isDbConfigured()) {
        persistRecoCache(cacheKey, redisKey, results, filtered.results.length, sourceFlag, inputs).catch(() => {});
      }
    }

    return NextResponse.json({
      results,
      total: filtered.results.length,
      source: sourceFlag,
      cacheHit,
      allOffSeason,
      relaxedConstraint:   filtered.relaxedConstraint,
      relaxedMessage:      filtered.relaxedMessage,
      conflictExplanation: filtered.conflictExplanation,
    });
  } catch (err) {
    console.error('[recommend] Unexpected error:', err);
    return NextResponse.json(
      { error: 'Failed to get recommendations', detail: err instanceof Error ? err.message : String(err) },
      { status: 500 }
    );
  }
}

// ─── Persistence helpers ──────────────────────────────────────────────────────

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function persistAiCandidates(candidates: any[]): Promise<void> {
  const { connectDB } = await import('@/lib/db');
  const { Destination } = await import('@/models/Destination');
  await connectDB();
  for (const c of candidates) {
    try {
      await Destination.findOneAndUpdate(
        { name: { $regex: new RegExp(`^${escapeRegex(c.name)}$`, 'i') }, state: { $regex: new RegExp(`^${escapeRegex(c.state)}$`, 'i') } },
        { $setOnInsert: c },
        { upsert: true, new: true }
      );
    } catch { /* duplicate — skip */ }
  }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function persistRecoCache(cacheKey: string, redisKey: string, results: any[], total: number, source: string, inputs: TripInputs): Promise<void> {
  const { connectDB } = await import('@/lib/db');
  const { RecommendationCache } = await import('@/models/RecommendationCache');
  await connectDB();
  const ids = results.map(r => r.destination._id?.toString() ?? '').filter(Boolean);
  await RecommendationCache.findOneAndUpdate(
    { cacheKey },
    { cacheKey, redisKey, destinationIds: ids, totalCandidates: total, source, inputsSnapshot: inputs, createdAt: new Date() },
    { upsert: true }
  );
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function dedupeByName(docs: any[]): any[] {
  const seen = new Set<string>();
  return docs.filter(d => {
    const k = `${d.name?.toLowerCase().trim()}-${d.state?.toLowerCase().trim()}`;
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
}

function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
