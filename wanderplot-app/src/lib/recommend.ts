/**
 * WanderPlot Recommendation Engine v2
 *
 * Two-tier matching per §5 of WANDERPLOT_IMPLEMENTATION_PLAN.md:
 *
 *   Tier 1 — HARD FILTERS (applied in Mongo $geoNear query, or in-memory on static set)
 *     • Explicit scenery  → $in filter (fixes beach→Manali bug §1)
 *     • Explicit experience → $in filter
 *     • Dealbreakers (no-flights, wheelchair, pet-friendly, etc.)
 *     • Season stays SOFT — so July beaches surface with warnings rather than being replaced
 *
 *   Tier 2 — SOFT SCORER (on the ≤100 pre-filtered candidate set)
 *     • season 0.35 · budget 0.30 · proximity 0.20 · experience richness 0.10 · rating 0.05
 *     • Scenery is no longer a scoring term (it's a filter now)
 *
 *   Fallback — honest poor-fit handling (§5.5)
 *     • Hard filters pass but all scores low → show anyway with banners
 *     • Zero results → relax SOFT constraints (radius, budget) with explanation
 *     • Impossible combo → return closest match + conflict explanation
 */

import { Vehicle, isRoadMode, destFeasibility, comfortableKmPerDay, effectiveMaxDistanceMeters } from '@/lib/transport';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface TripInputs {
  origin: string;
  originCoords?: { lat: number; lng: number };
  budget: number;     // total trip budget INR (whole party)
  month: number;      // 1–12
  days: number;
  groupType: 'solo' | 'couple' | 'family' | 'friends' | 'parents';
  pace: 'packed' | 'moderate' | 'relaxed';
  scenery: string[];         // user-selected — hard filter when non-empty
  experience: string[];      // user-selected — hard filter when non-empty
  dealbreakers: string[];
  partySize: number;
  surprise?: boolean;
  vehicle?: Vehicle;
  maxDistanceKm?: number;
}

export interface DestinationDoc {
  _id: string | { toString(): string };
  name: string;
  state: string;
  region?: string;
  country: string;
  // GeoJSON (v2 schema) — prefer this
  location?: { type: 'Point'; coordinates: [number, number] };
  // Legacy flat coords — kept for static-catalog fallback
  coordinates?: { lat: number; lng: number };
  scenery: string[];
  experienceTypes: string[];
  bestMonths: number[];
  budgetRange: { min: number; max: number };   // per person/day INR
  description: string;
  highlights: string[];
  images: string[];
  tags: string[];
  dealbreakers?: string[];
  rating?: number;
  reviewCount?: number;

  // AI / ingestion fields
  source?: 'seed' | 'ai' | 'osm' | 'wikidata' | 'foursquare' | 'overture';
  requiresFlight?: boolean;
  monsoonRisk?: boolean;
  kidFriendly?: boolean;
  wheelchairAccessible?: boolean;
  petFriendly?: boolean;
  isIsland?: boolean;
  highAltitude?: boolean;
  hasRailhead?: boolean;
  accessibilityNote?: string | null;
  offSeasonWarning?: string | null;
  events?: { name: string; monthsActive: number[] }[];
  whyItFits?: string;
  estTransportFromOrigin?: { mode: string; approxCostInr: number };
  confidence?: 'high' | 'medium' | 'low';
  popularity?: number;

  // Injected by $geoNear
  distanceMeters?: number;
}

export interface ScoredDestination {
  destination: DestinationDoc;
  totalScore: number;      // 0–100
  scores: {
    season: number;
    budget: number;
    proximity: number;
    experience: number;
    rating: number;
  };
  reasons: string[];
  warnings: string[];
  seasonStatus: 'peak' | 'shoulder' | 'off' | 'closed';
  whyItFits?: string;
}

export interface RecommendationResult {
  results: ScoredDestination[];
  total: number;
  relaxedConstraint?: string;
  relaxedMessage?: string;
  conflictExplanation?: string;
  allOffSeason?: boolean;
  source: 'db' | 'static' | 'ai' | 'ai+db' | 'ai-ephemeral' | 'local' | 'db+ai';
  cacheHit?: boolean;
}

// ─── Weights (§5.2) — MUST sum to 1.0 ────────────────────────────────────────
const W = {
  season:     0.35,
  budget:     0.30,
  proximity:  0.20,
  experience: 0.10,
  rating:     0.05,
};

// ─── Month metadata ───────────────────────────────────────────────────────────
const MONTH_NAMES = [
  '', 'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

// Months with broad monsoon risk in India (both coasts affected)
const MONSOON_MONTHS = [6, 7, 8, 9]; // Jun–Sep

// ─── TIER 1 — Hard filter (in-memory, applied when DB not available) ──────────

/**
 * Applies §5.1 hard filters to a destination.
 * When the user EXPLICITLY chose scenery/experience, only matching destinations pass.
 * "Surprise Me" (empty arrays) → no hard filter.
 */
export function passesHardFilters(dest: DestinationDoc, inputs: TripInputs): boolean {
  // 1. Scenery — at least one overlap required if user chose scenery
  if (inputs.scenery.length > 0) {
    const hasScenery = inputs.scenery.some(s => dest.scenery.includes(s));
    if (!hasScenery) return false;
  }

  // 2. Experience — at least one overlap required if user chose experience
  if (inputs.experience.length > 0) {
    const hasExperience = inputs.experience.some(e => dest.experienceTypes.includes(e));
    if (!hasExperience) return false;
  }

  // 3. Dealbreakers
  if (inputs.dealbreakers.includes('no-flights') && dest.requiresFlight) return false;
  if (inputs.dealbreakers.includes('wheelchair') && dest.wheelchairAccessible === false) return false;
  if (inputs.dealbreakers.includes('pet-friendly') && dest.petFriendly === false) return false;

  // 4. Destination's own dealbreaker list vs user's dealbreakers
  if (dest.dealbreakers && dest.dealbreakers.length > 0) {
    const conflicts = inputs.dealbreakers.filter(d => dest.dealbreakers!.includes(d));
    if (conflicts.length > 0) return false;
  }

  // 5. Parents / elderly: block high-altitude extreme destinations
  if (inputs.groupType === 'parents') {
    const highAltitude = ['ladakh', 'spiti', 'valley of flowers', 'rohtang'];
    if (highAltitude.some(p => dest.name.toLowerCase().includes(p))) return false;
  }

  // 6. Confidence filter — low-confidence destinations only surface in explicit lookup
  if (dest.confidence === 'low') return false;

  // 7. Vehicle / Transport Feasibility Gate
  const v = inputs.vehicle ?? 'flexible';
  const feats = destFeasibility(dest);

  if (isRoadMode(v)) {
    if (feats.isIsland) return false;
    const tripLenDefaultM = maxDistanceMeters(inputs.days);
    const effMaxKm = effectiveMaxDistanceMeters(v, inputs.days, inputs.maxDistanceKm, tripLenDefaultM) / 1000;
    
    const km = dest.distanceMeters != null 
      ? dest.distanceMeters / 1000 
      : inputs.originCoords 
        ? haversineKm(inputs.originCoords, destCoords(dest)) 
        : null;
    if (km != null && km > effMaxKm) return false;
  }
  
  if (v === 'train' && feats.isIsland) return false;

  return true;
}

// ─── TIER 2 — Soft scoring ────────────────────────────────────────────────────

function scoreSeason(
  dest: DestinationDoc,
  month: number
): { score: number; status: 'peak' | 'shoulder' | 'off' | 'closed'; reason: string; warning?: string } {
  if (dest.bestMonths.includes(month)) {
    // Check for events this month — bonus
    const activeEvents = (dest.events ?? []).filter(e => e.monthsActive.includes(month));
    const eventNote = activeEvents.length > 0 ? ` (${activeEvents.map(e => e.name).join(', ')})` : '';
    return {
      score: 100,
      status: 'peak',
      reason: `Peak season in ${MONTH_NAMES[month]}${eventNote}`,
    };
  }

  // Adjacent month = shoulder
  const adjacent = dest.bestMonths.some(
    m => Math.abs(m - month) === 1 || Math.abs(m - month) === 11
  );
  if (adjacent) {
    return {
      score: 60,
      status: 'shoulder',
      reason: `Shoulder season in ${MONTH_NAMES[month]} — good but not peak`,
      warning: 'Shoulder season',
    };
  }

  // Off-season — but SHOW the destination, not hide it (§5.5)
  const baseWarning = dest.offSeasonWarning ??
    (MONSOON_MONTHS.includes(month) && dest.scenery.includes('beach')
      ? `July–Sept is monsoon season on most Indian coasts — heavy rain and rough seas. East-coast beaches (Puri, Visakhapatnam) are drier than Goa.`
      : `Off-season in ${MONTH_NAMES[month]} — weather may be unfavourable`);

  const monsoonNote = dest.monsoonRisk ? ' High monsoon risk this month.' : '';

  return {
    score: 15,
    status: 'off',
    reason: `Off-season in ${MONTH_NAMES[month]}`,
    warning: baseWarning + monsoonNote,
  };
}

export function scoreBudget(
  dest: DestinationDoc,
  budget: number,
  days: number,
  partySize: number
): { score: number; reason: string; warning?: string } {
  const ps = Math.max(partySize, 1);
  const d = Math.max(days, 1);
  const perPersonPerDay = budget / ps / d;
  const { min, max } = dest.budgetRange;

  if (perPersonPerDay >= min && perPersonPerDay <= max) {
    return { score: 100, reason: `Budget fits (₹${min}–₹${max}/person/day)` };
  }
  if (perPersonPerDay > max) {
    return { score: 80, reason: `Budget generous — ₹${Math.round(perPersonPerDay).toLocaleString('en-IN')}/person/day (max ₹${max})` };
  }
  if (perPersonPerDay >= min * 0.8) {
    return {
      score: 45,
      reason: `Budget a little tight — need ~₹${min}/person/day`,
      warning: `Budget slightly tight for ${ps} traveller${ps > 1 ? 's' : ''}`,
    };
  }
  return {
    score: 5,
    reason: `Budget too low — min ₹${min}/person/day needed, you have ₹${Math.round(perPersonPerDay).toLocaleString('en-IN')}`,
    warning: `Budget insufficient for ${ps} traveller${ps > 1 ? 's' : ''}`,
  };
}

function scoreProximity(
  dest: DestinationDoc,
  originCoords?: { lat: number; lng: number },
  distanceMeters?: number
): { score: number; reason: string } {
  // If $geoNear already computed the distance, use it directly
  const km = distanceMeters != null
    ? distanceMeters / 1000
    : originCoords
      ? haversineKm(originCoords, destCoords(dest))
      : null;

  if (km == null) return { score: 50, reason: 'Distance unknown' };
  if (km < 300)  return { score: 100, reason: `Very close — ~${Math.round(km)} km` };
  if (km < 700)  return { score: 80,  reason: `Reachable — ~${Math.round(km)} km` };
  if (km < 1500) return { score: 55,  reason: `Medium distance — ~${Math.round(km)} km` };
  if (km < 2500) return { score: 30,  reason: `Far — ~${Math.round(km)} km` };
  return             { score: 10,  reason: `Very far — ~${Math.round(km)} km` };
}

function scoreExperience(
  dest: DestinationDoc,
  experience: string[]
): { score: number; reason: string } {
  if (!experience.length) return { score: 70, reason: 'No experience preference' };
  // Overlap ratio within the already-filtered set
  const overlap = dest.experienceTypes.filter(e => experience.includes(e));
  const score = Math.round((overlap.length / experience.length) * 100);
  const reason = overlap.length > 0
    ? `Strong on: ${overlap.join(', ')}`
    : 'Indirect experience match';
  return { score, reason };
}

function scoreRating(dest: DestinationDoc): { score: number; reason: string } {
  const pop = dest.popularity ?? 0;
  if (dest.rating && dest.rating >= 4.5) return { score: Math.min(100, 60 + pop * 2), reason: `Highly rated: ${dest.rating}⭐` };
  if (dest.rating && dest.rating >= 4.0) return { score: Math.min(80, 40 + pop * 2), reason: `Well rated: ${dest.rating}⭐` };
  if (dest.rating) return { score: 30, reason: `Rating: ${dest.rating}⭐` };
  return { score: 40, reason: 'Unrated — emerging destination' };
}

// ─── Main scoring pass ────────────────────────────────────────────────────────

export function scoreDestinations(
  candidates: DestinationDoc[],
  inputs: TripInputs
): ScoredDestination[] {
  const partySize = Math.max(inputs.partySize ?? 1, 1);
  const results: ScoredDestination[] = [];

  for (const dest of candidates) {
    const seasonR   = scoreSeason(dest, inputs.month);
    const budgetR   = scoreBudget(dest, inputs.budget, inputs.days, partySize);
    const proximityR = scoreProximity(dest, inputs.originCoords, dest.distanceMeters);
    const expR      = scoreExperience(dest, inputs.experience);
    const ratingR   = scoreRating(dest);

    let total = Math.round(
      seasonR.score   * W.season   +
      budgetR.score   * W.budget   +
      proximityR.score * W.proximity +
      expR.score      * W.experience +
      ratingR.score   * W.rating
    );

    const reasons = [
      seasonR.reason,
      budgetR.reason,
      proximityR.reason,
      expR.reason,
      ratingR.reason,
    ];

    const warnings: string[] = [
      seasonR.warning,
      budgetR.warning,
      dest.monsoonRisk ? 'Monsoon risk in this season' : undefined,
      dest.requiresFlight ? 'Requires a flight from origin' : undefined,
      dest.accessibilityNote ?? undefined,
    ].filter(Boolean) as string[];

    // --- Vehicle soft demotions ---
    const v = inputs.vehicle ?? 'flexible';
    const feats = destFeasibility(dest);

    if (v === 'train' && feats.hasRailhead === false) {
      warnings.push("No direct railhead; requires road transfer from nearest major station.");
    }

    if (isRoadMode(v)) {
      if (feats.highAltitude && ![6, 7, 8, 9].includes(inputs.month)) {
        total -= 20; // soft demotion
        warnings.push("High-altitude roads (e.g. Ladakh/Spiti) are typically open only Jun–Sep; consider flying in or travelling in season.");
      }
      
      const km = dest.distanceMeters != null 
        ? dest.distanceMeters / 1000 
        : inputs.originCoords 
          ? haversineKm(inputs.originCoords, destCoords(dest)) 
          : null;
      
      if (km != null) {
        const comfDays = comfortableKmPerDay(v) * Math.max(inputs.days, 1);
        if (km > comfDays) {
          const splitDays = Math.ceil(km / comfortableKmPerDay(v));
          warnings.push(`~${Math.round(km)} km is a long haul by ${v} — plan it over ${splitDays} days or consider train/flight.`);
        }
      }
    }

    // Active events this month
    const activeEvents = (dest.events ?? []).filter(e => e.monthsActive.includes(inputs.month));
    if (activeEvents.length > 0 && seasonR.status === 'peak') {
      reasons.push(`🎉 Festival: ${activeEvents.map(e => e.name).join(', ')}`);
    }

    results.push({
      destination: dest,
      totalScore: total,
      scores: {
        season:     seasonR.score,
        budget:     budgetR.score,
        proximity:  proximityR.score,
        experience: expR.score,
        rating:     ratingR.score,
      },
      reasons,
      warnings,
      seasonStatus: seasonR.status,
      whyItFits: dest.whyItFits,
    });
  }

  return results.sort((a, b) => b.totalScore - a.totalScore);
}

// ─── Honest poor-fit handling (§5.5) ─────────────────────────────────────────

export function diversifyByScenery(
  candidates: DestinationDoc[], inputs: TripInputs, limit = 8,
): ScoredDestination[] {
  const scored = scoreDestinations(candidates, inputs);
  const buckets = new Map<string, ScoredDestination[]>();
  for (const s of scored) {
    const key = s.destination.scenery?.[0] ?? 'other';
    (buckets.get(key) ?? buckets.set(key, []).get(key)!).push(s);
  }
  const order = shuffle([...buckets.keys()]);
  const picks: ScoredDestination[] = [];
  let i = 0;
  while (picks.length < limit && order.some(k => (buckets.get(k)?.length ?? 0) > 0)) {
    const k = order[i % order.length];
    const arr = buckets.get(k);
    if (arr?.length) {
      const top = arr.splice(0, Math.min(3, arr.length));
      const chosen = top.splice(Math.floor(Math.random() * top.length), 1)[0];
      picks.push(chosen);
      arr.unshift(...top);
    }
    i++;
  }
  return picks;
}

function shuffle<T>(a: T[]): T[] {
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

export interface RelaxResult {
  results: ScoredDestination[];
  relaxedConstraint?: string;
  relaxedMessage?: string;
  conflictExplanation?: string;
  allOffSeason?: boolean;
}

/**
 * Applies hard filters, scores, then relaxes soft constraints if zero results.
 * Never relaxes explicit scenery — that's the user's core intent.
 */
export function applyFiltersAndScore(
  allDocs: DestinationDoc[],
  inputs: TripInputs
): RelaxResult {
  // Tier 1 hard filter
  const filtered = allDocs.filter(d => passesHardFilters(d, inputs));

  // Score the filtered set
  let scored = scoreDestinations(filtered, inputs);

  // Check if all are off-season
  const allOffSeason = scored.length > 0 && scored.every(s => s.seasonStatus === 'off');

  if (scored.length > 0) {
    return { results: scored, allOffSeason };
  }

  // Zero results — try relaxing SOFT constraints only (never relax scenery)
  // Try 1: widen budget tolerance (don't use budget score as filter)
  const withoutBudgetFilter = allDocs.filter(d => {
    if (inputs.scenery.length > 0 && !inputs.scenery.some(s => d.scenery.includes(s))) return false;
    if (inputs.experience.length > 0 && !inputs.experience.some(e => d.experienceTypes.includes(e))) return false;
    // Relax dealbreakers except no-flights (that's hard)
    if (inputs.dealbreakers.includes('no-flights') && d.requiresFlight) return false;
    if (d.confidence === 'low') return false;
    return true;
  });

  if (withoutBudgetFilter.length > 0) {
    scored = scoreDestinations(withoutBudgetFilter, inputs);
    if (scored.length > 0) {
      const minBudgetNeeded = Math.min(...withoutBudgetFilter.map(d => d.budgetRange.min)) * inputs.partySize * inputs.days;
      return {
        results: scored,
        relaxedConstraint: 'budget',
        relaxedMessage: `We widened your budget range to find ${inputs.scenery[0] || 'matching'} destinations. The options below need approx ₹${Math.round(minBudgetNeeded).toLocaleString('en-IN')} total.`,
        allOffSeason: scored.every(s => s.seasonStatus === 'off'),
      };
    }
  }

  // Try 2: no results at all even without budget — explain the conflict
  const conflictDestinations = allDocs.filter(d =>
    inputs.scenery.some(s => d.scenery.includes(s))
  );

  if (conflictDestinations.length > 0) {
    // There are matching scenery destinations — but something else conflicts
    const requireFlight = conflictDestinations.filter(d => d.requiresFlight).length;
    const affordable = conflictDestinations.filter(d => {
      const ppd = inputs.budget / inputs.partySize / inputs.days;
      return ppd >= d.budgetRange.min * 0.8;
    }).length;

    const fixes: string[] = [];
    if (requireFlight > 0 && inputs.dealbreakers.includes('no-flights')) {
      fixes.push(`allow a flight (${requireFlight} ${inputs.scenery[0]} destinations require one)`);
    }
    if (affordable === 0) {
      const minNeeded = Math.min(...conflictDestinations.map(d => d.budgetRange.min));
      fixes.push(`raise your budget to ~₹${(minNeeded * inputs.partySize * inputs.days).toLocaleString('en-IN')} total`);
    }
    if (allOffSeason || conflictDestinations.every(d => !d.bestMonths.includes(inputs.month))) {
      const peak = conflictDestinations.flatMap(d => d.bestMonths);
      const bestMonths = [...new Set(peak)].sort((a, b) => a - b).map(m => MONTH_NAMES[m]).join(', ');
      fixes.push(`travel in ${bestMonths || 'Oct–Feb'} for peak season`);
    }

    // Return all matching-scenery destinations anyway (honest fallback)
    scored = scoreDestinations(conflictDestinations, { ...inputs, dealbreakers: [] });
    return {
      results: scored,
      conflictExplanation: `We couldn't find a perfect match. To fix: ${fixes.join(' OR ')}. Showing closest-available ${inputs.scenery[0]} destinations below.`,
    };
  }

  // Absolute last resort — return everything scored
  scored = scoreDestinations(allDocs, { ...inputs, scenery: [], experience: [], dealbreakers: [] });
  return {
    results: scored,
    relaxedConstraint: 'all',
    relaxedMessage: `No exact matches found. Showing our best recommendations instead.`,
  };
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function destCoords(dest: DestinationDoc): { lat: number; lng: number } {
  if (dest.location?.coordinates) {
    const [lng, lat] = dest.location.coordinates;
    return { lat, lng };
  }
  return dest.coordinates ?? { lat: 20.5, lng: 78.9 }; // India centroid fallback
}

function haversineKm(a: { lat: number; lng: number }, b: { lat: number; lng: number }): number {
  const R = 6371;
  const dLat = ((b.lat - a.lat) * Math.PI) / 180;
  const dLng = ((b.lng - a.lng) * Math.PI) / 180;
  const sinDLat = Math.sin(dLat / 2);
  const sinDLng = Math.sin(dLng / 2);
  const c = sinDLat * sinDLat +
    Math.cos((a.lat * Math.PI) / 180) *
    Math.cos((b.lat * Math.PI) / 180) *
    sinDLng * sinDLng;
  return R * 2 * Math.atan2(Math.sqrt(c), Math.sqrt(1 - c));
}

/** Default party size by group type */
export function defaultPartySize(groupType: string): number {
  switch (groupType) {
    case 'solo':    return 1;
    case 'couple':  return 2;
    case 'family':  return 4;
    case 'friends': return 4;
    case 'parents': return 2;
    default:        return 2;
  }
}

/** Trip length → max search radius in meters (§5.3) */
export function maxDistanceMeters(days: number): number {
  if (days <= 2)  return 500_000;   // 500 km — weekend bias near
  if (days <= 5)  return 1_200_000; // 1,200 km
  if (days <= 9)  return 2_500_000; // 2,500 km
  return 10_000_000;                // national — circuits, long trips
}
