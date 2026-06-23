/**
 * Shared itinerary generation + caching core.
 * Used by both the live route (/api/itinerary/generate) and the background
 * warm job (/api/admin/warm) so the prompt, cache key, and persistence logic
 * live in exactly one place.
 */
import { createHash } from 'crypto';
import { callLLMStructured, parseLlmJson, activeLlmLabel } from '@/lib/llm';
import { isDbConfigured } from '@/config/env.config';
import { Vehicle } from '@/lib/transport';

/**
 * Cache-key version. BUMP THIS whenever the prompt, output schema, or model
 * materially changes — old cache entries stop matching automatically, so a
 * deploy can never serve a stale-schema itinerary. No manual flush needed.
 */
export const ITINERARY_CACHE_VERSION = 'v3-2026-06';

/** The generated itinerary JSON shape is dynamic (LLM output) — typed loosely on purpose. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type Itinerary = any;

const SYSTEM_PROMPT = `You are WanderPlot's expert travel itinerary writer for India.
You write detailed, practical, and inspiring day-by-day travel plans.
Always ground your suggestions in real places, realistic timings, and honest costs.
Return ONLY valid JSON matching the schema provided — no extra text, no markdown prose outside the JSON.`;

const MONTH_NAMES = [
  '', 'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

export interface ItineraryDestination {
  name: string;
  state: string;
  description: string;
  highlights?: string[];
  coordinates: { lat: number; lng: number };
  events?: { name: string; monthsActive: number[] }[];
  accessibilityNote?: string | null;
  requiresFlight?: boolean;
  estTransportFromOrigin?: { mode: string; approxCostInr: number };
  monsoonRisk?: boolean;
}

export interface ItineraryInputs {
  origin: string;
  budget: number;
  month: number;
  days: number;
  groupType: string;
  pace: string;
  scenery: string[];
  experience: string[];
  dealbreakers: string[];
  partySize?: number;
  vehicle?: Vehicle;
  maxDistanceKm?: number;
}

// ─── Cache key (versioned + banded) ───────────────────────────────────────────

export function buildItineraryCacheKey(destination: ItineraryDestination, inputs: ItineraryInputs): string {
  const partySize = Math.max(inputs.partySize ?? 1, 1);
  const budgetBand = Math.round(inputs.budget / 5000) * 5000; // band so ₹58k and ₹61k share an entry
  return createHash('sha256').update(JSON.stringify({
    v: ITINERARY_CACHE_VERSION,
    dest: (destination.name + destination.state).toLowerCase().trim(),
    budget: budgetBand,
    month: inputs.month,
    days: inputs.days,
    groupType: inputs.groupType,
    pace: inputs.pace,
    partySize,
    experience: [...(inputs.experience ?? [])].sort(),
    dealbreakers: [...(inputs.dealbreakers ?? [])].sort(),
    vehicle: inputs.vehicle ?? 'flexible',
    maxDistanceKm: inputs.maxDistanceKm ?? 0,
  })).digest('hex');
}

// ─── Prompt builder ────────────────────────────────────────────────────────────

function transportGuidance(v: Vehicle): string {
  switch (v) {
    case 'bike': return `TRANSPORT = MOTORCYCLE ROAD TRIP. Structure each travel day as ride legs with approx km and riding hours (target ~300 km/day on highways, ~200 km/day in hills). Start at dawn, finish before dusk (no night riding). Call out fuel stops (flag stretches where pumps are 150+ km apart) and tea/rest breaks. Add a riding-gear & spares packing list (layered gear, gloves, rain cover, spare tube/levers, offline maps). For hill/high-altitude routes include acclimatization rest day(s) and a road-condition/weather caveat.`;
    case 'car': return `TRANSPORT = SELF-DRIVE CAR ROAD TRIP. Structure travel days as driving legs with approx km and time (cap ~400 km/day; assume ~45–55 km/h effective on Indian highways). Add scenic stops, food halts, parking and toll notes, and recommend early starts.`;
    case 'bus': return `TRANSPORT = INTERCITY BUS. Use intercity legs, prefer one overnight sleeper/Volvo leg to save a hotel night; note boarding and drop-off points; arrange in-destination local transport. No self-driving.`;
    case 'train': return `TRANSPORT = TRAIN. Use rail legs with station transfers; recommend class (3A/2A AC for overnight) and use overnight trains to save a hotel night; mention nearest railhead + last-mile to the destination and the IRCTC 120-day/Tatkal booking tip. No inter-city driving.`;
    case 'flight': return `TRANSPORT = FLIGHT. Include airport transfers at both ends and a ~2 hr check-in/security buffer and baggage note; then make the rest of the plan purely local/in-city — NO inter-city driving days. Maximise time at the destination.`;
    default: return `TRANSPORT = FLEXIBLE. Suggest the most sensible mix of transport for the route.`;
  }
}

export function buildItineraryPrompt(destination: ItineraryDestination, inputs: ItineraryInputs): string {
  const partySize = Math.max(inputs.partySize ?? 1, 1);
  const totalBudget = inputs.budget;
  const perPersonPerDay = Math.round(totalBudget / partySize / Math.max(inputs.days, 1));
  const monthName = MONTH_NAMES[inputs.month] ?? 'Unknown';
  const activeEvents = (destination.events ?? [])
    .filter((e) => e.monthsActive.includes(inputs.month))
    .map((e) => e.name);

  return `Create a ${inputs.days}-day travel itinerary for a ${inputs.groupType} (${partySize} person${partySize > 1 ? 's' : ''}) travelling to ${destination.name}, ${destination.state}.

Traveller details:
- Origin: ${inputs.origin}${destination.estTransportFromOrigin ? ` (${destination.estTransportFromOrigin.mode} ~₹${destination.estTransportFromOrigin.approxCostInr.toLocaleString('en-IN')} from origin)` : ''}
- Total budget for the party: ₹${totalBudget.toLocaleString('en-IN')} (≈ ₹${perPersonPerDay.toLocaleString('en-IN')}/person/day)
- Travel month: ${monthName}
- Group type: ${inputs.groupType}
- Pace: ${inputs.pace}
- Interests: ${inputs.experience.join(', ') || 'general'}
- Constraints: ${inputs.dealbreakers.join(', ') || 'none'}
- ${transportGuidance(inputs.vehicle ?? 'flexible')}
${destination.accessibilityNote ? `- Accessibility: ${destination.accessibilityNote}` : ''}
${destination.monsoonRisk ? `- Note: Monsoon risk this month — include weather-contingency suggestions` : ''}
${activeEvents.length > 0 ? `- Active festivals/events: ${activeEvents.join(', ')} — include these in the plan where relevant` : ''}

Destination highlights to include: ${destination.highlights?.join(', ') || 'none'}

Return a JSON object with this exact structure:
{
  "days": [
    {
      "day": 1,
      "title": "Day title (catchy, location-specific)",
      "morning": "Detailed morning activity with specific places and timings",
      "afternoon": "Detailed afternoon plan",
      "evening": "Evening activities and dinner recommendation",
      "accommodation": "Recommended accommodation type and area",
      "estimatedCost": 2500,
      "tips": "One insider tip for the day",
      "locations": ["Place 1", "Place 2"]
    }
  ],
  "budgetBreakdown": {
    "transport": 8000,
    "accommodation": 12000,
    "food": 6000,
    "activities": 4000,
    "misc": 2000
  },
  "packingList": ["item1", "item2"],
  "summary": "A warm 2-3 sentence summary of this trip"
}

Rules:
- estimatedCost per day is for the WHOLE PARTY (${partySize} person${partySize > 1 ? 's' : ''}) in INR
- budgetBreakdown values are for the WHOLE PARTY; total must not exceed ₹${totalBudget.toLocaleString('en-IN')}
- The budgetBreakdown 'transport' figure must reflect the chosen mode (fuel/tolls for bike/car, tickets for bus/train/flight).
- packingList specific to destination, season (${monthName}), and activities
- For ${inputs.pace} pace: ${inputs.pace === 'packed' ? '4-5 activities per day' : inputs.pace === 'moderate' ? '2-3 activities per day with rest time' : '1-2 activities with lots of leisure'}
${inputs.dealbreakers.includes('vegetarian') ? '- All food recommendations must be vegetarian' : ''}`;
}

// ─── Cache read / write ──────────────────────────────────────────────────────

export async function getCachedItinerary(cacheKey: string): Promise<Itinerary | null> {
  if (!isDbConfigured()) return null;
  try {
    const { connectDB } = await import('@/lib/db');
    const { ItineraryCache } = await import('@/models/ItineraryCache');
    await connectDB();
    const hit = await ItineraryCache.findOne({ cacheKey }).lean();
    return hit?.itinerary ?? null;
  } catch (e) {
    console.warn('[itinerary] cache read failed:', e instanceof Error ? e.message : e);
    return null;
  }
}

export async function saveItinerary(
  cacheKey: string,
  destination: ItineraryDestination,
  inputs: ItineraryInputs,
  itinerary: Itinerary,
  provider: string,
): Promise<void> {
  if (!isDbConfigured()) return;
  try {
    const { connectDB } = await import('@/lib/db');
    const { ItineraryCache } = await import('@/models/ItineraryCache');
    await connectDB();
    await ItineraryCache.findOneAndUpdate(
      { cacheKey },
      { cacheKey, destinationName: destination.name, itinerary, inputsSnapshot: inputs, llmProvider: provider, createdAt: new Date() },
      { upsert: true },
    );
  } catch (e) {
    console.warn('[itinerary] cache write failed:', e instanceof Error ? e.message : e);
  }
}

// ─── Generation ──────────────────────────────────────────────────────────────

/**
 * Generate an itinerary via the LLM (no caching). Uses a small thinking budget
 * (512) so the model sanity-checks constraints while staying ~10-14s.
 * For the OFFLINE warm job you may pass a higher budget for max quality.
 */
export async function generateItinerary(
  destination: ItineraryDestination,
  inputs: ItineraryInputs,
  thinkingBudget = 512,
): Promise<{ itinerary: Itinerary; provider: string }> {
  const prompt = buildItineraryPrompt(destination, inputs);
  const response = await callLLMStructured({
    prompt,
    systemPrompt: SYSTEM_PROMPT,
    temperature: 0.7,
    jsonMode: true,
    thinkingBudget,
    timeoutMs: 60_000,
  });
  const itinerary = parseLlmJson(response.text);
  return { itinerary, provider: activeLlmLabel };
}
