/**
 * Ingest normalisation helpers.
 *
 * Takes raw records from various sources (OSM, Wikidata, Foursquare/Overture)
 * and normalises them into IDestination-compatible shape.
 *
 * Rules:
 * - Coordinates NEVER come from Gemini (§6.2) — only from geo sources
 * - All coordinates validated via §6.4 before any persistence
 * - Enum values filtered to known vocab before upsert
 * - Geohash always computed for dedup
 */

import { validateCoordinates, computeGeohash, regionFromState } from '@/lib/geo';

// ─── Vocab sets ───────────────────────────────────────────────────────────────
const KNOWN_SCENERY = new Set(['mountains', 'beach', 'forest', 'desert', 'lake', 'river', 'plains', 'backwaters']);
const KNOWN_EXPERIENCE = new Set(['adventure', 'cultural', 'spiritual', 'wildlife', 'relaxation', 'offbeat', 'romantic', 'family']);

// ─── OSM tag → scenery vocab ──────────────────────────────────────────────────
const OSM_TAG_TO_SCENERY: Record<string, string> = {
  'natural=beach':        'beach',
  'natural=peak':         'mountains',
  'natural=mountain_range': 'mountains',
  'natural=wood':         'forest',
  'natural=forest':       'forest',
  'natural=scrub':        'forest',
  'natural=sand':         'desert',
  'natural=dune':         'desert',
  'natural=water':        'lake',
  'natural=lake':         'lake',
  'waterway=river':       'river',
  'landuse=forest':       'forest',
  'tourism=beach_resort': 'beach',
  'leisure=nature_reserve': 'forest',
};

// ─── OSM tag → experience vocab ───────────────────────────────────────────────
const OSM_TAG_TO_EXPERIENCE: Record<string, string[]> = {
  'tourism=attraction':   ['cultural'],
  'tourism=museum':       ['cultural'],
  'historic=monument':    ['cultural'],
  'historic=fort':        ['cultural'],
  'historic=temple':      ['spiritual', 'cultural'],
  'amenity=place_of_worship': ['spiritual'],
  'leisure=nature_reserve': ['wildlife'],
  'boundary=national_park': ['wildlife', 'adventure'],
  'sport=climbing':       ['adventure'],
  'sport=surfing':        ['adventure'],
  'sport=skiing':         ['adventure'],
  'natural=beach':        ['relaxation'],
};

// ─── Wikidata P31 (instance of) → scenery + experience ───────────────────────
const WD_P31_MAP: Record<string, { scenery?: string[]; experience?: string[] }> = {
  'Q39816':   { scenery: ['beach'] },              // beach
  'Q8502':    { scenery: ['mountains'] },           // mountain
  'Q4022':    { scenery: ['river'] },               // river
  'Q23397':   { scenery: ['lake'] },                // lake
  'Q132576':  { scenery: ['forest'] },              // forest
  'Q179049':  { scenery: ['backwaters'] },          // backwater (rough)
  'Q570116':  { scenery: ['desert'] },              // desert
  'Q35509':   { experience: ['cultural'] },          // fort
  'Q839954':  { experience: ['spiritual'] },         // Hindu temple
  'Q48349':   { experience: ['spiritual', 'cultural'] }, // gurdwara
  'Q16970':   { experience: ['spiritual'] },         // church
  'Q44539':   { experience: ['spiritual'] },         // mosque
  'Q22698':   { experience: ['wildlife', 'adventure'] }, // national park
};

// ─── Normalised partial type ──────────────────────────────────────────────────
export interface NormalizedDestinationPartial {
  name: string;
  state: string;
  region: 'North' | 'South' | 'East' | 'West' | 'Northeast' | 'Central';
  country: string;
  location: { type: 'Point'; coordinates: [number, number] };
  coordinates: { lat: number; lng: number };   // back-compat
  scenery: string[];
  experienceTypes: string[];
  geohash: string;
  source: 'osm' | 'wikidata' | 'foursquare' | 'overture' | 'seed';
  osmId?: string;
  wikidataId?: string;
  // Fields below enriched by Gemini in Phase B
  bestMonths?: number[];
  budgetRange?: { min: number; max: number };
  description?: string;
  highlights?: string[];
  tags?: string[];
  events?: { name: string; monthsActive: number[] }[];
  requiresFlight?: boolean;
  monsoonRisk?: boolean;
  kidFriendly?: boolean;
  wheelchairAccessible?: boolean;
  petFriendly?: boolean;
  dealbreakers?: string[];
  confidence?: 'high' | 'medium' | 'low';
  images?: string[];
  rating?: number;
  reviewCount?: number;
  wikimediaImage?: string;
}

export interface ValidationError {
  field: string;
  reason: string;
}

export interface NormalizeResult {
  data?: NormalizedDestinationPartial;
  errors: ValidationError[];
  rejected: boolean;
}

// ─── normalizeOsmDestination ──────────────────────────────────────────────────
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function normalizeOsmDestination(osmDoc: Record<string, any>): NormalizeResult {
  const errors: ValidationError[] = [];

  const name = osmDoc.tags?.name || osmDoc.tags?.['name:en'] || osmDoc.name;
  if (!name) return { errors: [{ field: 'name', reason: 'Missing name' }], rejected: true };

  const state = osmDoc.tags?.['addr:state'] || osmDoc.state;
  if (!state) return { errors: [{ field: 'state', reason: 'Missing state' }], rejected: true };

  const lat = parseFloat(osmDoc.lat ?? osmDoc.center?.lat);
  const lng = parseFloat(osmDoc.lon ?? osmDoc.center?.lon);
  const coordCheck = validateCoordinates(lat, lng);
  if (!coordCheck.valid) {
    return { errors: [{ field: 'coordinates', reason: coordCheck.reason! }], rejected: true };
  }

  // Map OSM tags to scenery/experience
  const tags = osmDoc.tags ?? {};
  const scenery: string[] = [];
  const experienceTypes: string[] = [];

  for (const [key, val] of Object.entries(tags)) {
    const tagKey = `${key}=${val}`;
    if (OSM_TAG_TO_SCENERY[tagKey]) scenery.push(OSM_TAG_TO_SCENERY[tagKey]);
    if (OSM_TAG_TO_EXPERIENCE[tagKey]) experienceTypes.push(...OSM_TAG_TO_EXPERIENCE[tagKey]);
  }

  const data: NormalizedDestinationPartial = {
    name:            name.trim(),
    state:           state.trim(),
    region:          regionFromState(state),
    country:         'India',
    location:        { type: 'Point', coordinates: [lng, lat] },
    coordinates:     { lat, lng },
    scenery:         [...new Set(scenery.filter(s => KNOWN_SCENERY.has(s)))],
    experienceTypes: [...new Set(experienceTypes.filter(e => KNOWN_EXPERIENCE.has(e)))],
    geohash:         computeGeohash(lat, lng),
    source:          'osm',
    osmId:           osmDoc.id?.toString(),
    confidence:      'medium',
    dealbreakers:    [],
    images:          [],
  };

  return { data, errors, rejected: false };
}

// ─── normalizeWikidataDestination ─────────────────────────────────────────────
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function normalizeWikidataDestination(wikiDoc: Record<string, any>): NormalizeResult {
  const errors: ValidationError[] = [];

  const name = wikiDoc.itemLabel?.value || wikiDoc.name;
  if (!name) return { errors: [{ field: 'name', reason: 'Missing name' }], rejected: true };

  const state = wikiDoc.stateLabel?.value || wikiDoc.state;
  if (!state) return { errors: [{ field: 'state', reason: 'Missing state/region' }], rejected: true };

  const coordStr: string = wikiDoc.coord?.value || '';
  let lat: number, lng: number;
  const m = coordStr.match(/Point\(([-\d.]+)\s+([-\d.]+)\)/i);
  if (m) {
    lng = parseFloat(m[1]);
    lat = parseFloat(m[2]);
  } else if (wikiDoc.lat && wikiDoc.lng) {
    lat = parseFloat(wikiDoc.lat);
    lng = parseFloat(wikiDoc.lng);
  } else {
    return { errors: [{ field: 'coordinates', reason: 'No coordinates in record' }], rejected: true };
  }

  const coordCheck = validateCoordinates(lat, lng);
  if (!coordCheck.valid) {
    return { errors: [{ field: 'coordinates', reason: coordCheck.reason! }], rejected: true };
  }

  // Map Wikidata P31 (instance of) → scenery/experience
  const p31 = wikiDoc.instanceOf?.value || wikiDoc.p31 || '';
  const qid = p31.split('/').pop();
  const mapping = WD_P31_MAP[qid] ?? {};
  const scenery         = [...new Set((mapping.scenery ?? []).filter(s => KNOWN_SCENERY.has(s)))];
  const experienceTypes = [...new Set((mapping.experience ?? []).filter(e => KNOWN_EXPERIENCE.has(e)))];

  // Wikimedia Commons image (P18) — CC-licensed, can be stored
  const wikimediaImage = wikiDoc.image?.value;

  const data: NormalizedDestinationPartial = {
    name:            name.trim(),
    state:           state.trim(),
    region:          regionFromState(state),
    country:         'India',
    location:        { type: 'Point', coordinates: [lng, lat] },
    coordinates:     { lat, lng },
    scenery,
    experienceTypes,
    geohash:         computeGeohash(lat, lng),
    source:          'wikidata',
    wikidataId:      wikiDoc.item?.value?.split('/').pop(),
    confidence:      'medium',
    dealbreakers:    [],
    images:          wikimediaImage ? [wikimediaImage] : [],
    wikimediaImage,
  };

  return { data, errors, rejected: false };
}

// ─── mergeDestinationSources ──────────────────────────────────────────────────
/**
 * Merge multiple source partials into a single destination record.
 * Priority: wikidata > osm > foursquare > overture (higher quality wins).
 * Wikidata has canonical name + validated coords + CC0 images.
 */
export function mergeDestinationSources(
  ...partials: NormalizedDestinationPartial[]
): NormalizedDestinationPartial {
  const base = partials[0];
  for (const p of partials.slice(1)) {
    // Prefer Wikidata canonical name
    if (p.source === 'wikidata' && p.name) base.name = p.name;
    // Prefer Wikidata coords (validated against OSM)
    if (p.source === 'wikidata' && p.location) {
      base.location    = p.location;
      base.coordinates = p.coordinates;
      base.geohash     = p.geohash;
    }
    // Merge enums (union)
    if (p.scenery?.length)         base.scenery         = [...new Set([...(base.scenery ?? []), ...p.scenery])];
    if (p.experienceTypes?.length) base.experienceTypes = [...new Set([...(base.experienceTypes ?? []), ...p.experienceTypes])];
    // Take richer IDs
    if (p.osmId && !base.osmId)         base.osmId         = p.osmId;
    if (p.wikidataId && !base.wikidataId) base.wikidataId = p.wikidataId;
    // Add new images
    if (p.images?.length) base.images = [...new Set([...(base.images ?? []), ...p.images])];
    // Upgrade confidence
    if (p.confidence === 'high' && base.confidence !== 'high') base.confidence = 'high';
  }
  return base;
}

// ─── Validation helpers re-exported for tests ─────────────────────────────────
export { validateCoordinates, computeGeohash };
