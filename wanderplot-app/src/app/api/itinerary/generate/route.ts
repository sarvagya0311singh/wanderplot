import { NextRequest, NextResponse } from 'next/server';
import { LlmError } from '@/lib/llm';
import { isLlmConfigured, isDbConfigured } from '@/config/env.config';
import {
  buildItineraryCacheKey,
  getCachedItinerary,
  saveItinerary,
  generateItinerary,
  ItineraryDestination,
  ItineraryInputs,
} from '@/lib/itinerary';
import { runSingleFlight } from '@/lib/singleFlight';

interface GenerateRequest {
  destination: ItineraryDestination;
  inputs: ItineraryInputs;
}

// Fire-and-forget: record scenario popularity so the warm job can pre-generate hot trips.
async function bumpPopularity(cacheKey: string, destination: ItineraryDestination, inputs: ItineraryInputs) {
  if (!isDbConfigured()) return;
  try {
    const { connectDB } = await import('@/lib/db');
    const { ScenarioPopularity } = await import('@/models/ScenarioPopularity');
    await connectDB();
    await ScenarioPopularity.findOneAndUpdate(
      { cacheKey },
      {
        $inc: { count: 1 },
        $set: { lastSeen: new Date(), destinationName: destination.name, destinationSnapshot: destination, inputsSnapshot: inputs },
      },
      { upsert: true },
    );
  } catch (e) {
    console.warn('[itinerary] popularity bump failed:', e instanceof Error ? e.message : e);
  }
}

export async function POST(req: NextRequest) {
  let cacheKey = '';
  try {
    if (!isLlmConfigured()) {
      return NextResponse.json(
        { error: 'LLM not configured. Set GEMINI_API_KEY or OPENAI_API_KEY in .env.local' },
        { status: 503 },
      );
    }

    const { destination, inputs } = (await req.json()) as GenerateRequest;
    cacheKey = buildItineraryCacheKey(destination, inputs);

    // Record demand (don't block on it)
    bumpPopularity(cacheKey, destination, inputs);

    // ── Step 1: cache hit → instant, zero Gemini calls ──
    const cached = await getCachedItinerary(cacheKey);
    if (cached) {
      return NextResponse.json({ itinerary: cached, llmProvider: 'cache', cached: true });
    }

    // ── Step 2: single-flight — concurrent identical requests share ONE generation ──
    const { result, coalesced } = await runSingleFlight({
      lockKey: `lock:itin:${cacheKey}`,
      readResult: () => getCachedItinerary(cacheKey),
      produce: async () => {
        const { itinerary, provider } = await generateItinerary(destination, inputs);
        await saveItinerary(cacheKey, destination, inputs, itinerary, provider);
        return { itinerary, provider };
      },
    });

    return NextResponse.json({
      itinerary: result.itinerary,
      llmProvider: result.provider,
      cached: coalesced, // true if we waited on another in-flight generation
    });
  } catch (err) {
    console.error('Itinerary generate error:', err);

    // Accurate, honest error classification (no misleading "invalid key" messages)
    const kind = err instanceof LlmError ? err.kind : 'unknown';
    const messageByKind: Record<string, string> = {
      quota:       'All configured Gemini API keys have hit their rate/quota limit. Wait a minute and try again, or add another key.',
      timeout:     'The AI took too long to respond. Please try again — it usually succeeds on retry.',
      invalid_key: 'The Gemini API key was rejected. Check GEMINI_API_KEY in .env.local.',
      unavailable: 'Gemini is temporarily overloaded (high demand). Please try again in a few seconds.',
      bad_request: 'The Gemini model name or request is invalid. Check GEMINI_MODEL in .env.local.',
      empty:       'The AI returned an empty response (possibly a safety block). Try again or tweak inputs.',
      unknown:     'Failed to generate itinerary. Please try again.',
    };

    return NextResponse.json(
      { error: messageByKind[kind] ?? messageByKind.unknown, errorKind: kind },
      { status: 503 },
    );
  }
}
