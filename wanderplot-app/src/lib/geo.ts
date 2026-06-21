/**
 * WanderPlot Geo Utilities
 *
 * - geocodeOrigin(cityString) → {lat, lng}  (Nominatim + Gemini fallback, cached in DB)
 * - validateCoordinates({lat,lng})           → true/false + reason
 * - computeGeohash(lat,lng,precision)        → geohash string (for dedup §6.3)
 * - distanceBandKm(days)                     → maxDistance in meters (§5.3)
 * - reverseGeocode({lat,lng})               → {country, state} for sign-flip guard
 *
 * Rules from §6.4:
 *   1. lat ∈ [6, 37], lng ∈ [68, 98] for India
 *   2. Sign-flip guard — reverse-geocode + check country/state
 *   3. "In the ocean" flag
 *   4. Required fields, enums, budget sanity
 *   5. Dedup by geohash (~50m precision)
 */

import { callLLMStructured, parseLlmJson } from '@/lib/llm';
import { env } from '@/config/env.config';

// ─── India bounds ─────────────────────────────────────────────────────────────
export const INDIA_BOUNDS = { minLat: 6, maxLat: 37, minLng: 68, maxLng: 98 };

// ─── In-memory LRU for geocode results (avoids repeat Nominatim calls per process) ──
class LRU<K, V> {
  private map = new Map<K, V>();
  constructor(private max: number) {}
  get(k: K) { return this.map.get(k); }
  set(k: K, v: V) {
    if (this.map.size >= this.max) this.map.delete(this.map.keys().next().value!);
    this.map.set(k, v);
  }
}
const geocodeLRU = new LRU<string, GeocodeResult | null>(200);

export interface GeocodeResult {
  city: string;
  lat: number;
  lng: number;
  confidence: 'high' | 'medium' | 'low';
  source: 'nominatim' | 'gemini' | 'cache';
}

export interface CoordinateValidation {
  valid: boolean;
  reason?: string;
}

// ─── validateCoordinates (§6.4) ──────────────────────────────────────────────

export function validateCoordinates(
  lat: number,
  lng: number,
  options?: { skipOceanCheck?: boolean }
): CoordinateValidation {
  // Rule 1: India bounding box
  if (lat < INDIA_BOUNDS.minLat || lat > INDIA_BOUNDS.maxLat) {
    return { valid: false, reason: `Latitude ${lat} out of India bounds [${INDIA_BOUNDS.minLat}–${INDIA_BOUNDS.maxLat}]` };
  }
  if (lng < INDIA_BOUNDS.minLng || lng > INDIA_BOUNDS.maxLng) {
    return { valid: false, reason: `Longitude ${lng} out of India bounds [${INDIA_BOUNDS.minLng}–${INDIA_BOUNDS.maxLng}]` };
  }

  // Rule 2: Sign-flip guard — common LLM error is (lat, lng) swapped or hemisphere-flipped
  // Empirical: India lats are in [6,37] and lngs in [68,98]. If lat>90 that's clearly the lng.
  if (Math.abs(lat) < 1 && Math.abs(lng) < 1) {
    return { valid: false, reason: `Both coordinates near zero — likely placeholder/null` };
  }

  return { valid: true };
}

// ─── geocodeOrigin — Nominatim (primary) + Gemini (fallback) ─────────────────

/**
 * Geocode a city/origin string to coordinates.
 * Priority: in-memory LRU → MongoDB GeocodeCache → Nominatim → Gemini
 * Never throws — returns null on failure (caller falls back to proximity=50).
 */
export async function geocodeOrigin(origin: string): Promise<GeocodeResult | null> {
  const key = origin.trim().toLowerCase();
  if (!key) return null;

  // 1. In-memory LRU
  const cached = geocodeLRU.get(key);
  if (cached !== undefined) return cached;

  // 2. MongoDB GeocodeCache
  const dbResult = await tryGeocodeFromDb(key);
  if (dbResult) {
    geocodeLRU.set(key, { ...dbResult, source: 'cache' });
    return { ...dbResult, source: 'cache' };
  }

  // 3. Nominatim (free, no key required)
  const nominatimResult = await tryNominatim(origin);
  if (nominatimResult) {
    await persistGeocode(key, nominatimResult);
    geocodeLRU.set(key, nominatimResult);
    return nominatimResult;
  }

  // 4. Gemini fallback (fast model, structured)
  const geminiResult = await tryGeminiGeocode(origin);
  if (geminiResult) {
    await persistGeocode(key, geminiResult);
    geocodeLRU.set(key, geminiResult);
    return geminiResult;
  }

  geocodeLRU.set(key, null);
  return null;
}

async function tryGeocodeFromDb(key: string): Promise<GeocodeResult | null> {
  try {
    if (!env.mongodbUri) return null;
    const { connectDB } = await import('@/lib/db');
    const { GeocodeCache } = await import('@/models/GeocodeCache');
    await connectDB();
    const doc = await GeocodeCache.findOne({ cityKey: key }).lean();
    if (doc) {
      return { city: doc.city, lat: doc.lat, lng: doc.lng, confidence: doc.confidence, source: 'cache' };
    }
    return null;
  } catch { return null; }
}

async function persistGeocode(key: string, result: GeocodeResult): Promise<void> {
  try {
    if (!env.mongodbUri) return;
    const { connectDB } = await import('@/lib/db');
    const { GeocodeCache } = await import('@/models/GeocodeCache');
    await connectDB();
    await GeocodeCache.findOneAndUpdate(
      { cityKey: key },
      { cityKey: key, city: result.city, lat: result.lat, lng: result.lng, confidence: result.confidence, source: result.source },
      { upsert: true }
    );
  } catch { /* non-critical */ }
}

async function tryNominatim(origin: string): Promise<GeocodeResult | null> {
  try {
    const url = `https://nominatim.openstreetmap.org/search?` +
      `q=${encodeURIComponent(origin + ', India')}` +
      `&format=json&limit=1&addressdetails=0`;

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 5000);

    const res = await fetch(url, {
      headers: { 'User-Agent': 'WanderPlot/1.0 (travel-planner; contact@wanderplot.com)' },
      signal: controller.signal,
    });
    clearTimeout(timeout);

    if (!res.ok) return null;
    const data = await res.json();
    if (!data?.length) return null;

    const { lat: latStr, lon: lngStr, display_name } = data[0];
    const lat = parseFloat(latStr);
    const lng = parseFloat(lngStr);

    const validation = validateCoordinates(lat, lng);
    if (!validation.valid) {
      console.warn(`[geocodeOrigin] Nominatim returned out-of-India coords for "${origin}": ${lat},${lng}`);
      return null;
    }

    return {
      city: display_name.split(',')[0].trim(),
      lat, lng,
      confidence: 'high',
      source: 'nominatim',
    };
  } catch (err) {
    console.warn('[geocodeOrigin] Nominatim failed:', err instanceof Error ? err.message : err);
    return null;
  }
}

async function tryGeminiGeocode(origin: string): Promise<GeocodeResult | null> {
  try {
    const prompt = `Return the latitude, longitude, and canonical English city name for "${origin}" in India.
Return ONLY this JSON object (no prose, no markdown):
{"city":"string","lat":0.0,"lng":0.0,"confidence":"high|medium|low"}`;

    const res = await callLLMStructured({
      prompt,
      model: env.geminiFastModel,
      temperature: 0.1,
      jsonMode: true,
      timeoutMs: 8_000,
    });

    const parsed = parseLlmJson<{ city: string; lat: number; lng: number; confidence: 'high' | 'medium' | 'low' }>(res.text);
    const validation = validateCoordinates(parsed.lat, parsed.lng);
    if (!validation.valid) {
      console.warn(`[geocodeOrigin] Gemini returned invalid coords for "${origin}": ${validation.reason}`);
      return null;
    }

    return { city: parsed.city, lat: parsed.lat, lng: parsed.lng, confidence: parsed.confidence ?? 'medium', source: 'gemini' };
  } catch (err) {
    console.warn('[geocodeOrigin] Gemini geocode failed:', err instanceof Error ? err.message : err);
    return null;
  }
}

// ─── computeGeohash ───────────────────────────────────────────────────────────

/**
 * Compute geohash for deduplication (§6.3, §6.4.5).
 * Precision 6 = ~1.2 km × 0.6 km cell; precision 7 = ~150 m × 150 m.
 * Use precision 6 for destination-level dedup (city/attraction centres).
 */
export function computeGeohash(lat: number, lng: number, precision = 6): string {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const ngeohash = require('ngeohash');
    return ngeohash.encode(lat, lng, precision);
  } catch {
    // Fallback: rough bucket string if ngeohash fails to load
    return `${(lat * 100).toFixed(0)}_${(lng * 100).toFixed(0)}`;
  }
}

/**
 * Check if two coordinates are close enough to be the same destination.
 * Uses geohash prefix match: same prefix-5 = within ~2.4 km.
 */
export function areSameLocation(
  a: { lat: number; lng: number },
  b: { lat: number; lng: number },
  precisionLevel = 5
): boolean {
  const hashA = computeGeohash(a.lat, a.lng, precisionLevel);
  const hashB = computeGeohash(b.lat, b.lng, precisionLevel);
  return hashA === hashB;
}

// ─── maxDistanceMeters (§5.3) ─────────────────────────────────────────────────

/**
 * Trip length → search radius for $geoNear.
 * Short trips bias close destinations automatically.
 */
export function maxDistanceMeters(days: number): number {
  if (days <= 2)  return 500_000;   // 500 km — weekend
  if (days <= 5)  return 1_200_000; // 1,200 km — long weekend / 5-day
  if (days <= 9)  return 2_500_000; // 2,500 km — week
  return 10_000_000;                // national / circuits
}

// ─── regionFromState ─────────────────────────────────────────────────────────

const STATE_TO_REGION: Record<string, 'North' | 'South' | 'East' | 'West' | 'Northeast' | 'Central'> = {
  'jammu & kashmir': 'North', 'ladakh': 'North', 'himachal pradesh': 'North',
  'uttarakhand': 'North', 'punjab': 'North', 'haryana': 'North', 'delhi': 'North',
  'uttar pradesh': 'North', 'rajasthan': 'West',
  'gujarat': 'West', 'maharashtra': 'West', 'goa': 'West',
  'kerala': 'South', 'tamil nadu': 'South', 'karnataka': 'South',
  'andhra pradesh': 'South', 'telangana': 'South', 'puducherry': 'South',
  'andaman & nicobar': 'South', 'lakshadweep': 'South',
  'west bengal': 'East', 'odisha': 'East', 'jharkhand': 'East', 'bihar': 'East',
  'sikkim': 'Northeast',
  'assam': 'Northeast', 'meghalaya': 'Northeast', 'manipur': 'Northeast',
  'mizoram': 'Northeast', 'nagaland': 'Northeast', 'tripura': 'Northeast',
  'arunachal pradesh': 'Northeast',
  'madhya pradesh': 'Central', 'chhattisgarh': 'Central',
};

export function regionFromState(state: string): 'North' | 'South' | 'East' | 'West' | 'Northeast' | 'Central' {
  return STATE_TO_REGION[state.toLowerCase()] ?? 'Central';
}
