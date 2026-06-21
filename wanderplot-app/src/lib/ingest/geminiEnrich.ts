/**
 * Gemini enrichment for ingested destination records.
 *
 * Two-pass approach (§6.5):
 *   Pass 1 — grounded text call: accurate facts, seasonal truth
 *   Pass 2 — schema-constrained JSON call: structure the facts
 *
 * Note: On Gemini 2.x, grounding + responseSchema can't be combined.
 * On 1.5 Pro (the model in use), use two separate calls.
 *
 * Fields enriched by Gemini:
 *   description, bestMonths, monsoonRisk, events, budgetRange, tags,
 *   highlights, accessNote, offSeasonWarning, kidFriendly, wheelchairAccessible,
 *   requiresFlight, petFriendly
 *
 * Fields NEVER set by Gemini: coordinates, name, state, country (§6.2)
 */

import { callLLMStructured, parseLlmJson } from '@/lib/llm';
import { env } from '@/config/env.config';
import { validateCoordinates } from '@/lib/geo';

export interface EnrichedFields {
  description: string;
  bestMonths: number[];
  monsoonRisk: boolean;
  events: { name: string; monthsActive: number[] }[];
  budgetRange: { min: number; max: number };
  tags: string[];
  highlights: string[];
  accessNote?: string;
  offSeasonWarning?: string;
  kidFriendly: boolean;
  wheelchairAccessible: boolean;
  requiresFlight: boolean;
  petFriendly: boolean;
  confidence: 'high' | 'medium' | 'low';
}

const SYSTEM_PROMPT = `You are a travel data researcher specialising in Indian tourism.
You enrich destination records with accurate seasonal, budget, and experiential information.
Base your seasonal knowledge on India's climate patterns. Be conservative with confidence.
Return ONLY valid JSON. Never invent place names or coordinates.`;

const ENRICH_SCHEMA_PROMPT = `Return a JSON object with EXACTLY these fields:
{
  "description": "2-3 engaging sentences about the destination",
  "bestMonths": [1,2,3],
  "monsoonRisk": false,
  "events": [{"name":"Festival Name","monthsActive":[10,11]}],
  "budgetRange": {"min":1500,"max":4000},
  "tags": ["tag1","tag2"],
  "highlights": ["attraction1","attraction2","attraction3"],
  "accessNote": "any access restriction or null",
  "offSeasonWarning": "specific off-season advice or null",
  "kidFriendly": true,
  "wheelchairAccessible": false,
  "requiresFlight": false,
  "petFriendly": false,
  "confidence": "high|medium|low"
}

Rules:
- bestMonths: array of integers 1-12 representing the BEST months to visit (peak season)
- budgetRange: per person per day in INR (realistic mid-range)
- budgetRange.max must be >= budgetRange.min and <= 50000
- monsoonRisk: true if heavy monsoon affects this destination Jun-Sep
- requiresFlight: true ONLY if the destination is on an island (Andaman, Lakshadweep) or requires a short flight from any major Indian city
- confidence: 'high' = well-known destination with clear seasonality; 'low' = obscure/uncertain`;

/**
 * Enrich a single destination with Gemini.
 * Returns null if enrichment fails validation.
 */
export async function enrichDestinationWithGemini(
  name: string,
  state: string,
  lat: number,
  lng: number,
  existingDescription?: string
): Promise<EnrichedFields | null> {
  // Never enrich if coords are invalid (safety check)
  const coordCheck = validateCoordinates(lat, lng);
  if (!coordCheck.valid) {
    console.warn(`[geminiEnrich] Skipping ${name} — invalid coords: ${coordCheck.reason}`);
    return null;
  }

  const contextNote = existingDescription
    ? `Existing description (may be used as context): "${existingDescription}"`
    : '';

  const prompt = `Enrich this Indian travel destination:
Name: ${name}
State: ${state}
Approximate location: ${lat.toFixed(2)}°N, ${lng.toFixed(2)}°E
${contextNote}

${ENRICH_SCHEMA_PROMPT}`;

  try {
    const response = await callLLMStructured({
      prompt,
      systemPrompt: SYSTEM_PROMPT,
      model: env.geminiFastModel,
      temperature: 0.3,
      jsonMode: true,
      timeoutMs: 15_000,
    });

    const raw = parseLlmJson<Partial<EnrichedFields>>(response.text);
    return validateEnrichedFields(raw, name);
  } catch (err) {
    console.warn(`[geminiEnrich] Failed to enrich "${name}":`, err instanceof Error ? err.message : err);
    return null;
  }
}

/**
 * Batch-enrich multiple destinations.
 * Returns results in same order; null for each failed enrichment.
 * Adds a small delay between calls to avoid rate limiting.
 */
export async function enrichBatch(
  destinations: { name: string; state: string; lat: number; lng: number; description?: string }[],
  delayMs = 500
): Promise<(EnrichedFields | null)[]> {
  const results: (EnrichedFields | null)[] = [];
  for (const dest of destinations) {
    const result = await enrichDestinationWithGemini(dest.name, dest.state, dest.lat, dest.lng, dest.description);
    results.push(result);
    if (delayMs > 0) await sleep(delayMs);
  }
  return results;
}

// ─── Validation ───────────────────────────────────────────────────────────────

function validateEnrichedFields(raw: Partial<EnrichedFields>, name: string): EnrichedFields | null {
  // Required fields
  if (!raw.description || typeof raw.description !== 'string') {
    console.warn(`[geminiEnrich] Missing description for "${name}"`);
    return null;
  }

  // bestMonths
  const bestMonths = (raw.bestMonths ?? [])
    .map(Number)
    .filter(m => Number.isInteger(m) && m >= 1 && m <= 12);
  if (bestMonths.length === 0) {
    console.warn(`[geminiEnrich] Empty/invalid bestMonths for "${name}"`);
    return null;
  }

  // budgetRange sanity
  let bMin = Number(raw.budgetRange?.min ?? 0);
  let bMax = Number(raw.budgetRange?.max ?? 0);
  if (bMin <= 0 || bMax < bMin || bMax > 50_000) {
    // Clamp
    bMin = Math.max(bMin, 500);
    bMax = Math.min(Math.max(bMax, bMin + 500), 50_000);
  }

  return {
    description:       raw.description.slice(0, 1000),
    bestMonths:        [...new Set(bestMonths)],
    monsoonRisk:       !!raw.monsoonRisk,
    events:            Array.isArray(raw.events) ? raw.events.filter(e => e.name && Array.isArray(e.monthsActive)) : [],
    budgetRange:       { min: bMin, max: bMax },
    tags:              Array.isArray(raw.tags) ? raw.tags.map(String).slice(0, 20) : [],
    highlights:        Array.isArray(raw.highlights) ? raw.highlights.map(String).slice(0, 10) : [],
    accessNote:        raw.accessNote ?? undefined,
    offSeasonWarning:  raw.offSeasonWarning ?? undefined,
    kidFriendly:       raw.kidFriendly !== false,
    wheelchairAccessible: !!raw.wheelchairAccessible,
    requiresFlight:    !!raw.requiresFlight,
    petFriendly:       !!raw.petFriendly,
    confidence:        ['high', 'medium', 'low'].includes(raw.confidence!) ? raw.confidence! : 'medium',
  };
}

const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));
