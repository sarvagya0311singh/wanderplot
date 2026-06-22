/**
 * GET|POST /api/admin/warm
 *
 * Background warm job: pre-generates itineraries for the most popular scenarios so
 * even the FIRST user hit on a popular trip is an instant cache read (no Gemini wait).
 *
 * Scenario selection:
 *   1. If we have demand data (ScenarioPopularity), warm the top-N by request count.
 *   2. Otherwise, fall back to a seed list built from the top-rated static destinations.
 *
 * - Idempotent: scenarios already cached are skipped.
 * - Rate-limited: sequential with a short delay so we never trip Gemini 429s.
 * - Auth: Authorization: Bearer <ADMIN_SECRET> (Vercel Cron sets this when CRON_SECRET=ADMIN_SECRET).
 *   Dev with no ADMIN_SECRET → open (warned). Configure a nightly run via vercel.json crons.
 */
import { NextRequest, NextResponse } from 'next/server';
import { isDbConfigured, isLlmConfigured, env } from '@/config/env.config';
import { destinations as staticCatalog } from '@/data/destinations';
import {
  buildItineraryCacheKey,
  getCachedItinerary,
  saveItinerary,
  generateItinerary,
  ItineraryDestination,
  ItineraryInputs,
} from '@/lib/itinerary';

const DEFAULT_LIMIT = 12;            // scenarios warmed per run (keeps under free-tier quota)
const DELAY_MS = 1_500;              // gap between generations to avoid 429s
const OFFLINE_THINKING_BUDGET = 1024; // higher than live (512) — quality matters, latency doesn't

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

function requireAdmin(req: NextRequest): boolean {
  if (!env.adminSecret) {
    console.warn('[warm] ADMIN_SECRET not set — allowing unauthenticated access (dev mode)');
    return true;
  }
  return req.headers.get('authorization') === `Bearer ${env.adminSecret}`;
}

interface WarmScenario {
  destination: ItineraryDestination;
  inputs: ItineraryInputs;
}

/** Seed scenarios: top-rated static destinations at a sensible default profile. */
function seedScenarios(limit: number): WarmScenario[] {
  const top = [...staticCatalog]
    .sort((a, b) => (b.reviewCount ?? 0) - (a.reviewCount ?? 0))
    .slice(0, limit);

  return top.map((d) => {
    const month = Array.isArray(d.bestMonths) && d.bestMonths.length ? d.bestMonths[0] : 11;
    const partySize = 2;
    const days = 4;
    // Budget at the destination's comfortable rate, banded
    const perDay = d.budgetRange?.max ?? 3500;
    const budget = Math.round((perDay * days * partySize) / 5000) * 5000;
    return {
      destination: {
        name: d.name,
        state: d.state,
        description: d.description,
        highlights: d.highlights ?? [],
        coordinates: d.coordinates,
      },
      inputs: {
        origin: 'Delhi',
        budget,
        month,
        days,
        groupType: 'couple',
        pace: 'moderate',
        scenery: [],
        experience: [],
        dealbreakers: [],
        partySize,
      },
    };
  });
}

/** Popularity-driven scenarios (preferred once we have real demand data). */
async function popularScenarios(limit: number): Promise<WarmScenario[]> {
  try {
    const { connectDB } = await import('@/lib/db');
    const { ScenarioPopularity } = await import('@/models/ScenarioPopularity');
    await connectDB();
    const docs = await ScenarioPopularity.find({ count: { $gte: 2 } })
      .sort({ count: -1 })
      .limit(limit)
      .lean();
    return docs
      .filter((d) => d.destinationSnapshot && d.inputsSnapshot)
      .map((d) => ({
        destination: d.destinationSnapshot as ItineraryDestination,
        inputs: d.inputsSnapshot as ItineraryInputs,
      }));
  } catch (e) {
    console.warn('[warm] popularity lookup failed:', e instanceof Error ? e.message : e);
    return [];
  }
}

async function runWarm(limit: number) {
  // Prefer real demand; fall back to seeds if we don't have enough yet.
  const popular = await popularScenarios(limit);
  const scenarios = popular.length >= Math.min(limit, 5) ? popular : seedScenarios(limit);

  let warmed = 0, skipped = 0, failed = 0;
  const details: { destination: string; status: string }[] = [];

  for (const { destination, inputs } of scenarios) {
    const cacheKey = buildItineraryCacheKey(destination, inputs);
    try {
      if (await getCachedItinerary(cacheKey)) {
        skipped++;
        details.push({ destination: destination.name, status: 'already-cached' });
        continue;
      }
      const { itinerary, provider } = await generateItinerary(destination, inputs, OFFLINE_THINKING_BUDGET);
      await saveItinerary(cacheKey, destination, inputs, itinerary, provider);
      warmed++;
      details.push({ destination: destination.name, status: 'warmed' });
      await sleep(DELAY_MS);
    } catch (e) {
      failed++;
      details.push({ destination: destination.name, status: `failed: ${e instanceof Error ? e.message : e}` });
    }
  }

  return { source: popular.length >= 5 ? 'popularity' : 'seed', total: scenarios.length, warmed, skipped, failed, details };
}

async function handle(req: NextRequest) {
  if (!requireAdmin(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (!isDbConfigured()) return NextResponse.json({ error: 'MONGODB_URI not configured — caching/warming needs a DB' }, { status: 503 });
  if (!isLlmConfigured()) return NextResponse.json({ error: 'LLM not configured' }, { status: 503 });

  const limit = Math.min(Number(new URL(req.url).searchParams.get('limit')) || DEFAULT_LIMIT, 30);
  const summary = await runWarm(limit);
  return NextResponse.json(summary);
}

export async function GET(req: NextRequest) { return handle(req); }   // Vercel Cron uses GET
export async function POST(req: NextRequest) { return handle(req); }  // manual trigger

// Warming a batch can take a while (sequential generations) — allow up to 5 min on Pro.
export const maxDuration = 300;
