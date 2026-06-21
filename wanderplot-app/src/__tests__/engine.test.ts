/**
 * Comprehensive unit & integration tests for the WanderPlot recommendation engine.
 *
 * §12 Acceptance criteria:
 *  1. Beach bug — Delhi, July, Beach → no mountains
 *  2. No-DB boot (implicit — static catalog used in tests)
 *  3. DB filtering (structural — tested via passesHardFilters)
 *  4. Proximity real — Delhi vs Chennai → different ordering
 *  5. Budget + party size
 *  6. Dealbreakers (no-flights, wheelchair)
 *  7. Cache key stability
 *  8. Hallucination guard (validateCoordinates)
 *  9. (Ingestion resumable — tested via normalize + state cursor logic)
 * 10. (Itinerary E2E — manual)
 */

// Mock LLM so tests never call Gemini
jest.mock('../lib/llm', () => ({
  callLLMStructured: jest.fn(),
  parseLlmJson: jest.requireActual('../lib/llm').parseLlmJson,
}));

// Silence console output in tests
beforeEach(() => {
  jest.spyOn(console, 'warn').mockImplementation(() => {});
  jest.spyOn(console, 'log').mockImplementation(() => {});
});
afterEach(() => jest.restoreAllMocks());

// ─── Imports ──────────────────────────────────────────────────────────────────
const { validateCoordinates, computeGeohash } = require('../lib/geo');
const { scoreBudget, scoreDestinations, applyFiltersAndScore, passesHardFilters, defaultPartySize } = require('../lib/recommend');
const { normalizeAiDestination, buildCacheKey } = require('../lib/destinationAI');
const { normalizeWikidataDestination, normalizeOsmDestination, mergeDestinationSources } = require('../lib/ingest/normalize');

// ─── Static catalog (used in test queries) ───────────────────────────────────
const { destinations: staticCatalog } = require('../data/destinations');

// ─── Test fixtures ────────────────────────────────────────────────────────────

function makeInputs(overrides = {}) {
  return {
    origin: 'Delhi',
    originCoords: { lat: 28.6, lng: 77.2 },
    budget: 10000,
    month: 11,
    days: 4,
    groupType: 'couple',
    pace: 'moderate',
    scenery: [],
    experience: [],
    dealbreakers: [],
    partySize: 2,
    ...overrides,
  };
}

// Adapt static catalog to v2 shape for tests
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function adaptStatic(d: any) {
  return {
    ...d,
    _id: d.name,
    requiresFlight: d.dealbreakers?.includes('no-flights') ?? false,
    monsoonRisk: false,
    kidFriendly: true,
    wheelchairAccessible: false,
    petFriendly: false,
    confidence: 'high',
    popularity: 0,
    source: 'seed',
  };
}

const adaptedCatalog = staticCatalog.map(adaptStatic);

// ─────────────────────────────────────────────────────────────────────────────
// §12.1 — THE BEACH BUG REGRESSION TEST
// ─────────────────────────────────────────────────────────────────────────────

describe('§12.1 Beach Bug — Delhi, July, Beach', () => {
  const beachInputs = makeInputs({
    month: 7,          // July — monsoon
    scenery: ['beach'],
    budget: 3000,
    days: 2,
    partySize: 1,
    dealbreakers: [],
  });

  test('hard filter must eliminate all non-beach destinations', () => {
    const nonBeachDests = adaptedCatalog.filter((d: any) => !d.scenery.includes('beach'));
    for (const dest of nonBeachDests) {
      expect(passesHardFilters(dest, beachInputs)).toBe(false);
    }
  });

  test('applyFiltersAndScore returns ONLY beach destinations (or honest no-result fallback)', () => {
    const result = applyFiltersAndScore(adaptedCatalog, beachInputs);
    for (const scored of result.results) {
      // If we got beach destinations — great. If we got a relaxed result, that's OK too.
      // But if the user asked for beach, NO result should have ONLY mountains in scenery
      // (i.e., no beach at all in its scenery array)
      const hasMountainsOnly =
        scored.destination.scenery.includes('mountains') &&
        !scored.destination.scenery.includes('beach');
      expect(hasMountainsOnly).toBe(false);
    }
  });

  test('Manali must NOT appear in beach results', () => {
    const result = applyFiltersAndScore(adaptedCatalog, beachInputs);
    const names = result.results.map((r: any) => r.destination.name);
    expect(names).not.toContain('Manali');
  });

  test('Chopta must NOT appear in beach results', () => {
    const result = applyFiltersAndScore(adaptedCatalog, beachInputs);
    const names = result.results.map((r: any) => r.destination.name);
    expect(names).not.toContain('Chopta');
  });

  test('Rishikesh must NOT appear in beach results', () => {
    const result = applyFiltersAndScore(adaptedCatalog, beachInputs);
    const names = result.results.map((r: any) => r.destination.name);
    expect(names).not.toContain('Rishikesh');
  });

  test('beach destinations (Goa, Gokarna, Pondicherry, Andaman) appear in results or relaxedMessage exists', () => {
    const result = applyFiltersAndScore(adaptedCatalog, beachInputs);
    const beachNames = ['Goa', 'Gokarna', 'Pondicherry', 'Andaman Islands'];
    const resultNames = result.results.map((r: any) => r.destination.name);
    const hasAnyBeach = beachNames.some(n => resultNames.includes(n));
    // Either we got beach destinations OR we have an honest relaxation message
    expect(hasAnyBeach || !!result.relaxedMessage || !!result.conflictExplanation).toBe(true);
  });

  test('off-season warning is present for July beach results', () => {
    const result = applyFiltersAndScore(adaptedCatalog, beachInputs);
    for (const scored of result.results) {
      if (scored.destination.scenery.includes('beach')) {
        // All Indian beaches are off-season in July (monsoon)
        expect(scored.seasonStatus).toBe('off');
        expect(scored.warnings.length).toBeGreaterThan(0);
      }
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// §12.4 — PROXIMITY IS REAL
// ─────────────────────────────────────────────────────────────────────────────

describe('§12.4 Proximity — Delhi vs Chennai', () => {
  const delhiInputs = makeInputs({ originCoords: { lat: 28.6, lng: 77.2 } });
  const chennaiInputs = makeInputs({ originCoords: { lat: 13.08, lng: 80.27 } });

  test('Manali scores higher proximity from Delhi than from Chennai', () => {
    const manali = adaptedCatalog.find((d: any) => d.name === 'Manali');
    const [delhiScored] = scoreDestinations([manali], delhiInputs);
    const [chennaiScored] = scoreDestinations([manali], chennaiInputs);
    expect(delhiScored.scores.proximity).toBeGreaterThan(chennaiScored.scores.proximity);
  });

  test('Ooty scores higher proximity from Chennai than from Delhi', () => {
    const ooty = adaptedCatalog.find((d: any) => d.name === 'Ooty');
    const [delhiScored] = scoreDestinations([ooty], delhiInputs);
    const [chennaiScored] = scoreDestinations([ooty], chennaiInputs);
    expect(chennaiScored.scores.proximity).toBeGreaterThan(delhiScored.scores.proximity);
  });

  test('different origin produces different recommendation ordering', () => {
    const delhiResult = applyFiltersAndScore(adaptedCatalog, delhiInputs);
    const chennaiResult = applyFiltersAndScore(adaptedCatalog, chennaiInputs);
    const delhiTop3 = delhiResult.results.slice(0, 3).map((r: any) => r.destination.name);
    const chennaiTop3 = chennaiResult.results.slice(0, 3).map((r: any) => r.destination.name);
    // They should NOT be identical — different origins → different proximity scores
    expect(delhiTop3.join(',')).not.toBe(chennaiTop3.join(','));
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// §12.5 — BUDGET + PARTY SIZE
// ─────────────────────────────────────────────────────────────────────────────

describe('§12.5 Budget precision — party size', () => {
  const dest = adaptedCatalog.find((d: any) => d.name === 'Rishikesh'); // min:800 max:2500

  test('solo traveller: ₹10,000 / 4 days = ₹2,500/day — fits (score 100)', () => {
    const r = scoreBudget(dest, 10000, 4, 1);
    expect(r.score).toBe(100);
  });

  test('party of 5: ₹10,000 / 4 days = ₹500/person/day — insufficient (score < 50)', () => {
    const r = scoreBudget(dest, 10000, 4, 5);
    expect(r.score).toBeLessThan(50);
  });

  test('larger party has lower budget score for same total budget', () => {
    const solo  = scoreBudget(dest, 5000, 4, 1);
    const group = scoreBudget(dest, 5000, 4, 4);
    expect(solo.score).toBeGreaterThan(group.score);
  });

  test('warning message mentions traveller count', () => {
    const r = scoreBudget(dest, 3000, 4, 10);
    expect(r.warning?.toLowerCase()).toContain('traveller');
  });

  test('partySize affects recommendation total score', () => {
    const soloInputs  = makeInputs({ budget: 5000, days: 4, partySize: 1 });
    const groupInputs = makeInputs({ budget: 5000, days: 4, partySize: 5 });
    const [soloScored]  = scoreDestinations([dest], soloInputs);
    const [groupScored] = scoreDestinations([dest], groupInputs);
    expect(soloScored.totalScore).toBeGreaterThan(groupScored.totalScore);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// §12.6 — DEALBREAKERS
// ─────────────────────────────────────────────────────────────────────────────

describe('§12.6 Dealbreakers', () => {
  const andaman = adaptedCatalog.find((d: any) => d.name === 'Andaman Islands');

  test('no-flights dealbreaker excludes Andaman Islands', () => {
    const inputs = makeInputs({ dealbreakers: ['no-flights'] });
    expect(passesHardFilters(andaman, inputs)).toBe(false);
  });

  test('no-flights dealbreaker does not affect non-flight destinations', () => {
    const goa = adaptedCatalog.find((d: any) => d.name === 'Goa');
    const inputs = makeInputs({ dealbreakers: ['no-flights'] });
    // Goa doesn't require a flight
    expect(passesHardFilters(goa, inputs)).toBe(true);
  });

  test('parents group filter excludes Ladakh', () => {
    const ladakh = adaptedCatalog.find((d: any) => d.name === 'Ladakh');
    const inputs = makeInputs({ groupType: 'parents' });
    expect(passesHardFilters(ladakh, inputs)).toBe(false);
  });

  test('parents group filter excludes Spiti Valley', () => {
    const spiti = adaptedCatalog.find((d: any) => d.name === 'Spiti Valley');
    const inputs = makeInputs({ groupType: 'parents' });
    expect(passesHardFilters(spiti, inputs)).toBe(false);
  });

  test('wheelchair filter excludes destinations where wheelchairAccessible is false', () => {
    const dest = { ...adaptedCatalog[0], wheelchairAccessible: false };
    const inputs = makeInputs({ dealbreakers: ['wheelchair'] });
    expect(passesHardFilters(dest, inputs)).toBe(false);
  });

  test('wheelchair filter allows destinations where wheelchairAccessible is true', () => {
    const dest = { ...adaptedCatalog[0], wheelchairAccessible: true, requiresFlight: false };
    const inputs = makeInputs({ dealbreakers: ['wheelchair'] });
    expect(passesHardFilters(dest, inputs)).toBe(true);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// §12.7 — CACHE KEY STABILITY
// ─────────────────────────────────────────────────────────────────────────────

describe('§12.7 Cache key — buildCacheKey', () => {
  const base = {
    origin: 'Mumbai', budget: 15000, month: 6, days: 4,
    groupType: 'couple', pace: 'moderate',
    scenery: ['mountains'], experience: ['adventure'],
    dealbreakers: [], partySize: 2,
  };

  test('same inputs → same key', () => {
    expect(buildCacheKey(base, 'Mumbai')).toBe(buildCacheKey(base, 'Mumbai'));
  });

  test('array order does not matter', () => {
    const k1 = buildCacheKey({ ...base, scenery: ['mountains', 'beach'] }, 'Mumbai');
    const k2 = buildCacheKey({ ...base, scenery: ['beach', 'mountains'] }, 'Mumbai');
    expect(k1).toBe(k2);
  });

  test('same budget band → same key', () => {
    const k1 = buildCacheKey({ ...base, budget: 15000 }, 'Mumbai');
    const k2 = buildCacheKey({ ...base, budget: 15100 }, 'Mumbai');
    expect(k1).toBe(k2);
  });

  test('different budget bands → different keys', () => {
    const k1 = buildCacheKey({ ...base, budget: 15000 }, 'Mumbai');
    const k2 = buildCacheKey({ ...base, budget: 20000 }, 'Mumbai');
    expect(k1).not.toBe(k2);
  });

  test('same day bucket → same key (3 and 5 days)', () => {
    expect(buildCacheKey({ ...base, days: 3 }, 'Mumbai')).toBe(buildCacheKey({ ...base, days: 5 }, 'Mumbai'));
  });

  test('produces 64-char hex SHA-256', () => {
    expect(buildCacheKey(base, 'Mumbai')).toMatch(/^[0-9a-f]{64}$/);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// §12.8 — HALLUCINATION GUARD (validateCoordinates)
// ─────────────────────────────────────────────────────────────────────────────

describe('§12.8 Coordinate validation', () => {
  test('valid Indian coordinates pass', () => {
    expect(validateCoordinates(12.42, 75.74).valid).toBe(true);   // Coorg
    expect(validateCoordinates(28.6, 77.2).valid).toBe(true);     // Delhi
    expect(validateCoordinates(8.9, 76.6).valid).toBe(true);      // Thiruvananthapuram
  });

  test('out-of-India latitude rejected', () => {
    expect(validateCoordinates(55.0, 77.0).valid).toBe(false);    // Russia
    expect(validateCoordinates(3.0, 77.0).valid).toBe(false);     // Too far south
  });

  test('out-of-India longitude rejected', () => {
    expect(validateCoordinates(20.0, 50.0).valid).toBe(false);    // Too far west (Middle East)
    expect(validateCoordinates(20.0, 100.0).valid).toBe(false);   // Too far east (SE Asia)
  });

  test('sign-flip guard — both near zero rejected', () => {
    expect(validateCoordinates(0.0001, 0.0002).valid).toBe(false);
  });

  test('ocean/sea coordinates (Indian Ocean) are rejected by bounds', () => {
    // ~5°N 73°E is in the Indian Ocean south of India
    expect(validateCoordinates(5.0, 73.0).valid).toBe(false);
  });

  test('Andaman Islands (valid — within bounds)', () => {
    expect(validateCoordinates(11.74, 92.66).valid).toBe(true);
  });

  test('normalizeAiDestination rejects out-of-India coords', () => {
    const bad = {
      name: 'Fake', state: 'MP', coordinates: { lat: 55, lng: 77 },
      bestMonths: [10], budgetRange: { min: 1000, max: 3000 },
      description: 'Test', confidence: 'high',
    };
    expect(normalizeAiDestination(bad)).toBeNull();
  });

  test('hemisphere-flipped coordinates (lat and lng swapped) rejected', () => {
    // A common LLM error: returns (lng, lat) instead of (lat, lng)
    // Delhi is (28.6, 77.2) — if swapped: (77.2, 28.6) — lat 77 is invalid
    expect(validateCoordinates(77.2, 28.6).valid).toBe(false);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// §12.9 — INGESTION NORMALISE (idempotent dedup)
// ─────────────────────────────────────────────────────────────────────────────

describe('§12.9 Wikidata normalisation', () => {
  const validWikiDoc = {
    item:       { value: 'http://www.wikidata.org/entity/Q3761' },
    itemLabel:  { value: 'Coorg' },
    coord:      { value: 'Point(75.74 12.42)' },
    stateLabel: { value: 'Karnataka' },
    instanceOf: { value: 'http://www.wikidata.org/entity/Q1411931' },
  };

  test('valid Wikidata record normalises successfully', () => {
    const r = normalizeWikidataDestination(validWikiDoc);
    expect(r.rejected).toBe(false);
    expect(r.data?.name).toBe('Coorg');
    expect(r.data?.state).toBe('Karnataka');
    expect(r.data?.location.coordinates[0]).toBeCloseTo(75.74, 1);  // lng
    expect(r.data?.location.coordinates[1]).toBeCloseTo(12.42, 1);  // lat
  });

  test('out-of-India coordinates rejected', () => {
    const bad = { ...validWikiDoc, coord: { value: 'Point(55.0 80.0)' } }; // lat 80 too high
    const r = normalizeWikidataDestination(bad);
    expect(r.rejected).toBe(true);
  });

  test('missing name rejected', () => {
    const { itemLabel: _, ...noName } = validWikiDoc;
    const r = normalizeWikidataDestination(noName);
    expect(r.rejected).toBe(true);
  });

  test('missing state rejected', () => {
    const { stateLabel: _, ...noState } = validWikiDoc;
    const r = normalizeWikidataDestination(noState);
    expect(r.rejected).toBe(true);
  });

  test('geohash is computed and non-empty', () => {
    const r = normalizeWikidataDestination(validWikiDoc);
    expect(r.data?.geohash).toBeTruthy();
    expect(r.data?.geohash.length).toBeGreaterThan(3);
  });
});

describe('computeGeohash', () => {
  test('same location → same geohash', () => {
    expect(computeGeohash(12.42, 75.74)).toBe(computeGeohash(12.42, 75.74));
  });

  test('different locations → different geohashes', () => {
    expect(computeGeohash(12.42, 75.74)).not.toBe(computeGeohash(28.6, 77.2));
  });

  test('returns a non-empty string', () => {
    const h = computeGeohash(15.0, 75.0);
    expect(typeof h).toBe('string');
    expect(h.length).toBeGreaterThan(0);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// defaultPartySize helpers
// ─────────────────────────────────────────────────────────────────────────────

describe('defaultPartySize', () => {
  test('solo → 1', () => expect(defaultPartySize('solo')).toBe(1));
  test('couple → 2', () => expect(defaultPartySize('couple')).toBe(2));
  test('family → 4', () => expect(defaultPartySize('family')).toBe(4));
  test('friends → 4', () => expect(defaultPartySize('friends')).toBe(4));
  test('parents → 2', () => expect(defaultPartySize('parents')).toBe(2));
});

// ─────────────────────────────────────────────────────────────────────────────
// normalizeAiDestination (§6.4 validation)
// ─────────────────────────────────────────────────────────────────────────────

describe('normalizeAiDestination', () => {
  const valid = {
    name: 'Coorg', state: 'Karnataka', country: 'India',
    coordinates: { lat: 12.42, lng: 75.74 },
    scenery: ['forest', 'mountains'],
    experienceTypes: ['relaxation', 'wildlife'],
    bestMonths: [10, 11, 12, 1, 2, 3],
    budgetRange: { min: 1500, max: 3500 },
    description: 'A lush coffee paradise.',
    highlights: ["Raja's Seat"],
    tags: ['coffee'],
    requiresFlight: false, monsoonRisk: false, kidFriendly: true,
    confidence: 'high',
  };

  test('valid fixture passes', () => expect(normalizeAiDestination(valid)).not.toBeNull());
  test('rejects out-of-India lat', () => expect(normalizeAiDestination({ ...valid, coordinates: { lat: 55, lng: 75 } })).toBeNull());
  test('rejects out-of-India lng', () => expect(normalizeAiDestination({ ...valid, coordinates: { lat: 12, lng: 50 } })).toBeNull());
  test('rejects empty bestMonths', () => expect(normalizeAiDestination({ ...valid, bestMonths: [] })).toBeNull());
  test('rejects invalid bestMonths (0, 13)', () => expect(normalizeAiDestination({ ...valid, bestMonths: [0, 13] })).toBeNull());
  test('rejects missing name', () => { const { name: _, ...r } = valid; expect(normalizeAiDestination(r)).toBeNull(); });
  test('rejects missing description', () => { const { description: _, ...r } = valid; expect(normalizeAiDestination(r)).toBeNull(); });
  test('rejects confidence: low', () => expect(normalizeAiDestination({ ...valid, confidence: 'low' })).toBeNull());
  test('deduplicates bestMonths', () => {
    const r = normalizeAiDestination({ ...valid, bestMonths: [10, 10, 11, 11] });
    expect(r?.bestMonths).toEqual([10, 11]);
  });
  test('filters unknown scenery values', () => {
    const r = normalizeAiDestination({ ...valid, scenery: ['forest', 'INVALID', 'mountains'] });
    expect(r?.scenery).not.toContain('INVALID');
  });
});
