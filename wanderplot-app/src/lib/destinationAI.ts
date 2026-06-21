/**
 * AI-powered destination discovery helpers for WanderPlot.
 *
 * Pure, unit-testable module — no direct Next.js / HTTP dependencies.
 *
 * Exports:
 *   geocodeOrigin(origin)               → {lat, lng} | null   (cached, fail-open)
 *   generateCandidates(inputs, coords)  → AiDestination[]     (validated, normalised)
 *   normalizeAiDestination(raw)         → AiDestination | null (rejects hallucinations)
 *   buildCacheKey(inputs, originCity)   → string              (SHA-256 of banded inputs)
 */

import { createHash } from 'crypto';
import { callLLMStructured, parseLlmJson } from '@/lib/llm';
import { env } from '@/config/env.config';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface AiDestination {
  // Core (required)
  _id: string;           // stable slug or Mongo id
  name: string;
  state: string;
  country: string;
  coordinates: { lat: number; lng: number };
  scenery: string[];
  experienceTypes: string[];
  bestMonths: number[];
  budgetRange: { min: number; max: number };
  description: string;
  highlights: string[];
  tags: string[];
  images: string[];
  dealbreakers: string[];

  // AI-enriched (optional)
  source: 'ai' | 'seed';
  requiresFlight?: boolean;
  monsoonRisk?: boolean;
  kidFriendly?: boolean;
  accessibilityNote?: string | null;
  offSeasonWarning?: string | null;
  events?: { name: string; monthsActive: number[] }[];
  estTransportFromOrigin?: { mode: string; approxCostInr: number };
  whyItFits?: string;
  confidence?: 'high' | 'medium' | 'low';
  generatedAt?: Date;
  popularity?: number;
}

export interface GeocodeResult {
  city: string;
  lat: number;
  lng: number;
  confidence: 'high' | 'medium' | 'low';
}

export interface TripInputsForAI {
  origin: string;
  budget: number;
  month: number;
  days: number;
  groupType: string;
  pace: string;
  scenery: string[];
  experience: string[];
  dealbreakers: string[];
  partySize: number;
}

// ─── Constants ────────────────────────────────────────────────────────────────

const INDIA_LAT_MIN = 6;
const INDIA_LAT_MAX = 37;
const INDIA_LNG_MIN = 68;
const INDIA_LNG_MAX = 98;
const BUDGET_MAX_PER_PERSON_DAY = 50_000;

const KNOWN_SCENERY = ['mountains', 'beach', 'forest', 'desert', 'lake', 'river', 'plains', 'backwaters'];
const KNOWN_EXPERIENCE = ['adventure', 'cultural', 'spiritual', 'wildlife', 'relaxation', 'offbeat', 'romantic', 'family'];

const MONTH_NAMES = [
  '', 'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

// ─── In-memory LRU geocode cache (50 entries) ────────────────────────────────

class LRUCache<K, V> {
  private map = new Map<K, V>();
  constructor(private maxSize: number) {}
  get(key: K): V | undefined { return this.map.get(key); }
  set(key: K, value: V) {
    if (this.map.size >= this.maxSize) {
      const oldest = this.map.keys().next().value;
      if (oldest !== undefined) this.map.delete(oldest);
    }
    this.map.set(key, value);
  }
}

const geocodeCache = new LRUCache<string, GeocodeResult | null>(50);

// ─── geocodeOrigin ────────────────────────────────────────────────────────────

/**
 * Geocode an origin city string to lat/lng using a fast Gemini call.
 * Cached in-memory. Returns null on failure (caller falls back to score-50).
 */
export async function geocodeOrigin(origin: string): Promise<GeocodeResult | null> {
  const normalised = origin.trim().toLowerCase();
  if (!normalised) return null;

  const cached = geocodeCache.get(normalised);
  if (cached !== undefined) return cached;

  try {
    const prompt = `Return the latitude, longitude, and canonical city name for "${origin}" in India.
Return ONLY this JSON (no prose): {"city":"string","lat":0.0,"lng":0.0,"confidence":"high|medium|low"}`;

    const response = await callLLMStructured({
      prompt,
      model: env.geminiFastModel,
      temperature: 0.1,
      jsonMode: true,
      timeoutMs: 8_000,
    });

    const parsed = parseLlmJson<GeocodeResult>(response.text);

    // Validate it's in India
    if (
      typeof parsed.lat === 'number' &&
      typeof parsed.lng === 'number' &&
      parsed.lat >= INDIA_LAT_MIN && parsed.lat <= INDIA_LAT_MAX &&
      parsed.lng >= INDIA_LNG_MIN && parsed.lng <= INDIA_LNG_MAX
    ) {
      geocodeCache.set(normalised, parsed);
      return parsed;
    }

    console.warn(`[geocodeOrigin] Out-of-India coords for "${origin}":`, parsed);
    geocodeCache.set(normalised, null);
    return null;
  } catch (err) {
    console.warn(`[geocodeOrigin] Failed to geocode "${origin}":`, err instanceof Error ? err.message : err);
    geocodeCache.set(normalised, null);
    return null;
  }
}

// ─── normalizeAiDestination ───────────────────────────────────────────────────

/**
 * Validate and normalise a raw AI-generated destination object.
 * Returns null if the candidate fails any hard rule (hallucination guard).
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function normalizeAiDestination(raw: any): AiDestination | null {
  // 1. Required fields
  if (!raw?.name || !raw?.state || !raw?.coordinates || !raw?.description) {
    return null;
  }

  // 2. India coordinate bounds
  const { lat, lng } = raw.coordinates;
  if (
    typeof lat !== 'number' || typeof lng !== 'number' ||
    lat < INDIA_LAT_MIN || lat > INDIA_LAT_MAX ||
    lng < INDIA_LNG_MIN || lng > INDIA_LNG_MAX
  ) {
    console.warn(`[normalizeAiDestination] Rejected "${raw.name}" — out-of-India coords: (${lat}, ${lng})`);
    return null;
  }

  // 3. bestMonths — must be non-empty array of valid 1-12 ints
  const bestMonths: number[] = (raw.bestMonths ?? [])
    .map(Number)
    .filter((m: number) => Number.isInteger(m) && m >= 1 && m <= 12);
  // Unique
  const uniqueMonths = [...new Set(bestMonths)];
  if (uniqueMonths.length === 0) {
    console.warn(`[normalizeAiDestination] Rejected "${raw.name}" — empty/invalid bestMonths`);
    return null;
  }

  // 4. budgetRange sanity
  const bMin = Number(raw.budgetRange?.min ?? 0);
  const bMax = Number(raw.budgetRange?.max ?? 0);
  if (bMin <= 0 || bMax < bMin || bMax > BUDGET_MAX_PER_PERSON_DAY) {
    // Clamp rather than drop
    const clampedMin = Math.max(bMin, 200);
    const clampedMax = Math.min(Math.max(bMax, clampedMin + 200), BUDGET_MAX_PER_PERSON_DAY);
    raw.budgetRange = { min: clampedMin, max: clampedMax };
  }

  // 5. Enum hygiene
  const scenery: string[] = (raw.scenery ?? []).filter((s: string) => KNOWN_SCENERY.includes(s));
  const experienceTypes: string[] = (raw.experienceTypes ?? []).filter((e: string) => KNOWN_EXPERIENCE.includes(e));

  // 6. confidence: 'low' → reject from auto-recommendations (used only in §5.J confirm flow)
  if (raw.confidence === 'low') {
    return null;
  }

  // 7. Stable _id: kebab slug from name+state
  const slug = `${raw.name}-${raw.state}`
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');

  return {
    _id: slug,
    name: String(raw.name),
    state: String(raw.state),
    country: raw.country ?? 'India',
    coordinates: { lat, lng },
    scenery,
    experienceTypes,
    bestMonths: uniqueMonths,
    budgetRange: raw.budgetRange,
    description: String(raw.description),
    highlights: Array.isArray(raw.highlights) ? raw.highlights.map(String) : [],
    tags: Array.isArray(raw.tags) ? raw.tags.map(String) : [],
    images: [],
    dealbreakers: raw.requiresFlight ? ['no-flights'] : [],
    source: 'ai',
    requiresFlight: !!raw.requiresFlight,
    monsoonRisk: !!raw.monsoonRisk,
    kidFriendly: raw.kidFriendly !== false,
    accessibilityNote: raw.accessibilityNote ?? null,
    offSeasonWarning: raw.offSeasonWarning ?? null,
    events: Array.isArray(raw.events) ? raw.events : [],
    estTransportFromOrigin: raw.estTransportFromOrigin ?? undefined,
    whyItFits: raw.whyItFits ?? undefined,
    confidence: raw.confidence ?? 'medium',
    generatedAt: new Date(),
    popularity: 0,
  };
}

// ─── generateCandidates ───────────────────────────────────────────────────────

const SYSTEM_PROMPT = `You are WanderPlot's destination researcher for travel within India.
Given a traveller's constraints, propose real, currently-operating destinations that genuinely fit.
Use realistic coordinates, seasonality, and mid-range per-person-per-day costs in INR.
Never invent places. Return ONLY valid JSON matching the provided schema.`;

/**
 * Ask Gemini to generate AI destination candidates for the given inputs.
 * Returns validated, normalised candidates. Fails open — returns [] on error.
 */
export async function generateCandidates(
  inputs: TripInputsForAI,
  originCoords: { lat: number; lng: number } | null,
  count: number = 8
): Promise<AiDestination[]> {
  const monthName = MONTH_NAMES[inputs.month] ?? 'Unknown';
  const perPersonPerDay = Math.round(inputs.budget / inputs.partySize / inputs.days);
  const latStr = originCoords ? originCoords.lat.toFixed(2) : 'unknown';
  const lngStr = originCoords ? originCoords.lng.toFixed(2) : 'unknown';
  const noFlights = inputs.dealbreakers.includes('no-flights');

  const prompt = `Propose ${count} distinct Indian destinations for this trip. Diversity matters — vary region and scenery unless the traveller's preferences are narrow.

Traveller constraints:
- Origin: ${inputs.origin} (approx lat ${latStr}, lng ${lngStr})
- Travel month: ${monthName}
- Total budget: ₹${inputs.budget.toLocaleString('en-IN')} for ${inputs.partySize} person(s) over ${inputs.days} days (≈ ₹${perPersonPerDay}/person/day)
- Group type: ${inputs.groupType}
- Pace: ${inputs.pace}
- Scenery wanted: ${inputs.scenery.length ? inputs.scenery.join(', ') : 'no preference'}
- Experiences wanted: ${inputs.experience.length ? inputs.experience.join(', ') : 'no preference'}
- Hard constraints: ${inputs.dealbreakers.length ? inputs.dealbreakers.join(', ') : 'none'}

Rules:
- Only include destinations whose best season includes or is adjacent to ${monthName}, unless nothing else fits — if you include an off-season pick, set offSeasonWarning.
- ${noFlights ? 'CRITICAL: no-flights constraint active — only include destinations reachable by road/rail from the origin. Set requiresFlight: false on all candidates.' : 'Set requiresFlight: true for any destination realistically requiring a flight.'}
- Costs must be realistic for ${monthName} and this group.
- Prefer closer destinations for short trips (${inputs.days} days).
- For group type "${inputs.groupType}": ${groupGuidance(inputs.groupType)}

Return JSON with this schema:
{
  "destinations": [
    {
      "name": "string",
      "state": "string",
      "country": "India",
      "coordinates": { "lat": 0.0, "lng": 0.0 },
      "scenery": ["mountains|beach|forest|desert|lake|river|plains|backwaters"],
      "experienceTypes": ["adventure|cultural|spiritual|wildlife|relaxation|offbeat|romantic|family"],
      "bestMonths": [1,2,3],
      "budgetRange": { "min": 0, "max": 0 },
      "description": "string (1-2 sentences)",
      "highlights": ["string"],
      "tags": ["string"],
      "requiresFlight": false,
      "monsoonRisk": false,
      "kidFriendly": true,
      "accessibilityNote": "string or null",
      "offSeasonWarning": "string or null",
      "events": [{ "name": "string", "monthsActive": [11, 12] }],
      "estTransportFromOrigin": { "mode": "road|rail|flight", "approxCostInr": 0 },
      "whyItFits": "string (why this matches THIS traveller)",
      "confidence": "high|medium|low"
    }
  ]
}`;

  try {
    const response = await callLLMStructured({
      prompt,
      systemPrompt: SYSTEM_PROMPT,
      model: env.geminiFastModel,
      temperature: 0.4,
      jsonMode: true,
      timeoutMs: 20_000,
    });

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const parsed = parseLlmJson<{ destinations: any[] }>(response.text);
    const raw = Array.isArray(parsed?.destinations) ? parsed.destinations : [];

    const valid: AiDestination[] = [];
    for (const item of raw) {
      const normalised = normalizeAiDestination(item);
      if (normalised) valid.push(normalised);
    }

    console.log(`[generateCandidates] Gemini returned ${raw.length} candidates, ${valid.length} passed validation`);
    return valid;
  } catch (err) {
    console.warn('[generateCandidates] Failed — falling back to static catalog:', err instanceof Error ? err.message : err);
    return [];
  }
}

// ─── buildCacheKey ────────────────────────────────────────────────────────────

/**
 * Build a stable SHA-256 cache key from normalised, banded trip inputs.
 * Trivially-different queries (e.g. ₹15,000 vs ₹15,100) share a cache entry.
 */
export function buildCacheKey(inputs: TripInputsForAI, originCity: string): string {
  const daysBucket = inputs.days <= 2 ? '1-2' : inputs.days <= 5 ? '3-5' : inputs.days <= 9 ? '6-9' : '10-14';
  const budgetBand = Math.round(inputs.budget / 2500) * 2500;

  const canonical = JSON.stringify({
    origin: originCity.trim().toLowerCase(),
    month: inputs.month,
    days: daysBucket,
    budget: budgetBand,
    partySize: inputs.partySize,
    groupType: inputs.groupType,
    pace: inputs.pace,
    scenery: [...inputs.scenery].sort(),
    experience: [...inputs.experience].sort(),
    dealbreakers: [...inputs.dealbreakers].sort(),
  });

  return createHash('sha256').update(canonical).digest('hex');
}

// ─── Internal helpers ─────────────────────────────────────────────────────────

function groupGuidance(groupType: string): string {
  switch (groupType) {
    case 'solo':    return 'favour safe, well-connected, backpacker-friendly places with good social scenes and hostels.';
    case 'couple':  return 'favour romantic, scenic, and private destinations with honeymoon-style stays and sunset spots.';
    case 'family':  return 'favour kid-friendly, gentle-logistics destinations. Avoid high-altitude and extreme-adventure-only picks.';
    case 'friends': return 'lean into adventure, group activities, and nightlife where appropriate.';
    case 'parents': return 'CRITICAL: comfort and accessibility first. Avoid high-altitude destinations (Ladakh >3500m, Spiti, Valley of Flowers). Prefer easy terrain, good roads, and medical access.';
    default:        return 'no special guidance.';
  }
}
