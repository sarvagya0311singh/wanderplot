/**
 * Deterministic scoring engine for WanderPlot destination recommendations.
 * No LLM required — pure rules + weights over the destination dataset.
 * LLM is layered on top for prose, not for the core ranking.
 */

export interface TripInputs {
  origin: string;
  originCoords?: { lat: number; lng: number };
  budget: number; // total budget in INR
  month: number; // 1–12
  groupType: 'solo' | 'couple' | 'family' | 'friends' | 'parents';
  pace: 'packed' | 'moderate' | 'relaxed';
  scenery: string[]; // e.g. ['mountains', 'beach']
  experience: string[]; // e.g. ['adventure', 'cultural']
  dealbreakers: string[]; // e.g. ['no-flights', 'vegetarian']
  days: number;
}

export interface DestinationDoc {
  _id: string;
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
  images: string[];
  tags: string[];
  dealbreakers?: string[]; // things that disqualify it
}

export interface ScoredDestination {
  destination: DestinationDoc;
  totalScore: number; // 0–100
  scores: {
    season: number;
    budget: number;
    scenery: number;
    experience: number;
    proximity: number;
  };
  reasons: string[]; // human-readable explanations
  warnings: string[]; // flags like "shoulder season", "budget tight"
}

// ─── Scoring weights ──────────────────────────────────────────────────────────

const WEIGHTS = {
  season: 0.30,
  budget: 0.25,
  scenery: 0.20,
  experience: 0.15,
  proximity: 0.10,
};

// ─── Haversine distance ───────────────────────────────────────────────────────

function haversineKm(
  a: { lat: number; lng: number },
  b: { lat: number; lng: number }
): number {
  const R = 6371;
  const dLat = ((b.lat - a.lat) * Math.PI) / 180;
  const dLng = ((b.lng - a.lng) * Math.PI) / 180;
  const sinDLat = Math.sin(dLat / 2);
  const sinDLng = Math.sin(dLng / 2);
  const c =
    sinDLat * sinDLat +
    Math.cos((a.lat * Math.PI) / 180) *
      Math.cos((b.lat * Math.PI) / 180) *
      sinDLng * sinDLng;
  return R * 2 * Math.atan2(Math.sqrt(c), Math.sqrt(1 - c));
}

// ─── Individual scorers ───────────────────────────────────────────────────────

function scoreSeason(dest: DestinationDoc, month: number): { score: number; reason: string; warning?: string } {
  if (dest.bestMonths.includes(month)) {
    return { score: 100, reason: `Peak season in ${monthName(month)}` };
  }
  // Adjacent months get partial credit
  const adjacent = dest.bestMonths.some(
    (m) => Math.abs(m - month) === 1 || Math.abs(m - month) === 11
  );
  if (adjacent) {
    return {
      score: 60,
      reason: `Shoulder season — good but not peak`,
      warning: 'Shoulder season',
    };
  }
  return {
    score: 15,
    reason: `Off-season in ${monthName(month)}`,
    warning: 'Off-season — weather may be unfavourable',
  };
}

function scoreBudget(
  dest: DestinationDoc,
  budget: number,
  days: number
): { score: number; reason: string; warning?: string } {
  const perDay = budget / Math.max(days, 1);
  const { min, max } = dest.budgetRange;

  if (perDay >= min && perDay <= max) {
    return { score: 100, reason: `Budget fits comfortably (₹${min}–₹${max}/day)` };
  }
  if (perDay > max) {
    return { score: 80, reason: `Budget more than enough — room for upgrades` };
  }
  if (perDay >= min * 0.8) {
    return {
      score: 50,
      reason: `Budget slightly tight (need ~₹${min}/day)`,
      warning: 'Budget a bit tight',
    };
  }
  return {
    score: 10,
    reason: `Budget too low — minimum ₹${min}/day needed`,
    warning: 'Budget insufficient',
  };
}

function scoreScenery(dest: DestinationDoc, scenery: string[]): { score: number; reason: string } {
  if (!scenery.length) return { score: 70, reason: 'No scenery preference set' };
  const overlap = dest.scenery.filter((s) => scenery.includes(s));
  const ratio = overlap.length / scenery.length;
  const score = Math.round(ratio * 100);
  const reason =
    overlap.length > 0
      ? `Matches: ${overlap.join(', ')}`
      : `Scenery doesn't match your preference`;
  return { score, reason };
}

function scoreExperience(dest: DestinationDoc, experience: string[]): { score: number; reason: string } {
  if (!experience.length) return { score: 70, reason: 'No experience preference set' };
  const overlap = dest.experienceTypes.filter((e) => experience.includes(e));
  const ratio = overlap.length / experience.length;
  const score = Math.round(ratio * 100);
  const reason =
    overlap.length > 0
      ? `Offers: ${overlap.join(', ')}`
      : `Experience type doesn't match`;
  return { score, reason };
}

function scoreProximity(
  dest: DestinationDoc,
  originCoords?: { lat: number; lng: number }
): { score: number; reason: string } {
  if (!originCoords) return { score: 50, reason: 'Distance unknown' };
  const km = haversineKm(originCoords, dest.coordinates);
  if (km < 300) return { score: 100, reason: `Very close — ~${Math.round(km)}km away` };
  if (km < 700) return { score: 75, reason: `Reachable — ~${Math.round(km)}km away` };
  if (km < 1500) return { score: 50, reason: `Medium distance — ~${Math.round(km)}km away` };
  return { score: 20, reason: `Far — ~${Math.round(km)}km away` };
}

// ─── Dealbreaker filter ───────────────────────────────────────────────────────

function passesDealbreakers(dest: DestinationDoc, dealbreakers: string[]): boolean {
  if (!dealbreakers.length) return true;
  return !dealbreakers.some((d) => dest.dealbreakers?.includes(d));
}

// ─── Main scorer ──────────────────────────────────────────────────────────────

export function scoreDestinations(
  destinations: DestinationDoc[],
  inputs: TripInputs
): ScoredDestination[] {
  const results: ScoredDestination[] = [];

  for (const dest of destinations) {
    // Hard filter: dealbreakers
    if (!passesDealbreakers(dest, inputs.dealbreakers)) continue;

    const seasonResult = scoreSeason(dest, inputs.month);
    const budgetResult = scoreBudget(dest, inputs.budget, inputs.days);
    const sceneryResult = scoreScenery(dest, inputs.scenery);
    const experienceResult = scoreExperience(dest, inputs.experience);
    const proximityResult = scoreProximity(dest, inputs.originCoords);

    const rawTotal =
      seasonResult.score * WEIGHTS.season +
      budgetResult.score * WEIGHTS.budget +
      sceneryResult.score * WEIGHTS.scenery +
      experienceResult.score * WEIGHTS.experience +
      proximityResult.score * WEIGHTS.proximity;

    const totalScore = Math.round(rawTotal);

    const reasons: string[] = [
      seasonResult.reason,
      budgetResult.reason,
      sceneryResult.reason,
      experienceResult.reason,
      proximityResult.reason,
    ];

    const warnings: string[] = [
      seasonResult.warning,
      budgetResult.warning,
    ].filter(Boolean) as string[];

    results.push({
      destination: dest,
      totalScore,
      scores: {
        season: seasonResult.score,
        budget: budgetResult.score,
        scenery: sceneryResult.score,
        experience: experienceResult.score,
        proximity: proximityResult.score,
      },
      reasons,
      warnings,
    });
  }

  // Sort descending by total score
  return results.sort((a, b) => b.totalScore - a.totalScore);
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function monthName(m: number): string {
  return [
    '', 'January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December',
  ][m];
}
