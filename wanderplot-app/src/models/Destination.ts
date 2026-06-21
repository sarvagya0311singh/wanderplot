/**
 * Destination v2 — WanderPlot's all-India catalog.
 *
 * Critical changes from v1:
 *  • `location` — GeoJSON Point ([lng, lat]) enables $geoNear + 2dsphere index
 *  • `region` — coarse fast-filter
 *  • Boolean fast-filters: requiresFlight, monsoonRisk, kidFriendly, wheelchairAccessible, petFriendly
 *  • `geohash` — 50m dedup bucket
 *  • `source` / `confidence` / `verifiedAt` — data quality pipeline
 *  • Old `coordinates: {lat, lng}` kept as optional for back-compat with static seed data
 *
 * Indexes (§4.4 ESR order):
 *  1. scenery + bestMonths + location (2dsphere) — geo + hot equality filters
 *  2. region + experienceTypes + bestMonths + budgetRange.min — non-geo multi-criteria
 *  3. name + description + tags (text) — full-text search
 *  4. name + state (unique) — upsert dedup key
 *  5. geohash — spatial dedup support
 */

import mongoose, { Schema, Document, Model } from 'mongoose';

export interface IDestination extends Document {
  // Identity
  name: string;
  state: string;
  region: 'North' | 'South' | 'East' | 'West' | 'Northeast' | 'Central';
  country: string;

  // Geo — GeoJSON Point (lng, lat) — required for $geoNear / 2dsphere
  location: { type: 'Point'; coordinates: [number, number] };

  // Legacy flat coords — keep for backward compat (static seed, old trips)
  coordinates?: { lat: number; lng: number };

  // Primary filter parameters (all indexed)
  scenery: string[];
  experienceTypes: string[];
  bestMonths: number[];
  budgetRange: { min: number; max: number };   // per person/day INR

  // Boolean fast-filters (cheap hard filters)
  requiresFlight: boolean;
  monsoonRisk: boolean;
  kidFriendly: boolean;
  wheelchairAccessible: boolean;
  petFriendly: boolean;
  dealbreakers: string[];

  // Rich / display
  description: string;
  highlights: string[];
  tags: string[];
  images: string[];
  events: { name: string; monthsActive: number[] }[];
  accessNote?: string;
  offSeasonWarning?: string;

  // External IDs & live overlay
  googlePlaceId?: string;
  wikidataId?: string;
  osmId?: string;
  rating?: number;
  reviewCount?: number;

  // Data quality / ops
  source: 'seed' | 'osm' | 'wikidata' | 'foursquare' | 'overture' | 'ai';
  geohash: string;
  confidence: 'high' | 'medium' | 'low';
  popularity: number;
  verifiedAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

const DestinationSchema = new Schema<IDestination>(
  {
    // Identity
    name:    { type: String, required: true, trim: true },
    state:   { type: String, required: true, trim: true },
    region:  { type: String, enum: ['North', 'South', 'East', 'West', 'Northeast', 'Central'], required: true },
    country: { type: String, default: 'India' },

    // GeoJSON (v2) — enables $geoNear
    location: {
      type:        { type: String, enum: ['Point'], default: 'Point' },
      coordinates: { type: [Number], required: true },  // [lng, lat]
    },

    // Legacy flat coords (back-compat, optional)
    coordinates: {
      lat: Number,
      lng: Number,
    },

    // Filter arrays
    scenery:         { type: [String], default: [] },
    experienceTypes: { type: [String], default: [] },
    bestMonths:      { type: [Number], default: [] },
    budgetRange: {
      min: { type: Number, required: true },
      max: { type: Number, required: true },
    },

    // Boolean fast-filters
    requiresFlight:      { type: Boolean, default: false },
    monsoonRisk:         { type: Boolean, default: false },
    kidFriendly:         { type: Boolean, default: true },
    wheelchairAccessible:{ type: Boolean, default: false },
    petFriendly:         { type: Boolean, default: false },
    dealbreakers:        { type: [String], default: [] },

    // Rich content
    description:     { type: String, required: true },
    highlights:      { type: [String], default: [] },
    tags:            { type: [String], default: [] },
    images:          { type: [String], default: [] },
    events:          { type: [{ name: String, monthsActive: [Number] }], default: [] },
    accessNote:      String,
    offSeasonWarning:String,

    // External
    googlePlaceId: String,
    wikidataId:    String,
    osmId:         String,
    rating:        Number,
    reviewCount:   Number,

    // Data quality
    source:     { type: String, enum: ['seed', 'osm', 'wikidata', 'foursquare', 'overture', 'ai'], default: 'seed' },
    geohash:    { type: String, required: true },
    confidence: { type: String, enum: ['high', 'medium', 'low'], default: 'medium' },
    popularity: { type: Number, default: 0 },
    verifiedAt: Date,
  },
  {
    timestamps: true,
    collection: 'destinations',
  }
);

// ─── Indexes (§4.4 — ESR order) ──────────────────────────────────────────────

// 1. Geo + hot equality filters (2dsphere must be in compound index)
// Note: MongoDB cannot index parallel arrays (scenery + bestMonths), so we split them.
DestinationSchema.index({ location: '2dsphere', scenery: 1 });
DestinationSchema.index({ location: '2dsphere', bestMonths: 1 });

// 2. Region + budget + single array (experience or season)
DestinationSchema.index({ region: 1, 'budgetRange.min': 1, experienceTypes: 1 });
DestinationSchema.index({ region: 1, 'budgetRange.min': 1, bestMonths: 1 });

// 3. Full-text search
DestinationSchema.index({ name: 'text', description: 'text', tags: 'text' });

// 4. Upsert dedup key — enforced unique
DestinationSchema.index({ name: 1, state: 1 }, { unique: true });

// 5. Geohash dedup support
DestinationSchema.index({ geohash: 1 });

// 6. Boolean fast-filters (compound for common queries)
DestinationSchema.index({ requiresFlight: 1, country: 1 });

export const Destination: Model<IDestination> =
  mongoose.models.Destination ??
  mongoose.model<IDestination>('Destination', DestinationSchema);
