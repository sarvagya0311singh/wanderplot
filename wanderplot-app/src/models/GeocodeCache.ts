import mongoose, { Schema, Document, Model } from 'mongoose';

export interface IGeocodeCache extends Document {
  /** Normalised lowercase city key */
  cityKey: string;
  /** Canonical display name */
  city: string;
  lat: number;
  lng: number;
  confidence: 'high' | 'medium' | 'low';
  source: 'nominatim' | 'gemini' | 'cache';
  createdAt: Date;
}

const GeocodeCacheSchema = new Schema<IGeocodeCache>({
  cityKey:    { type: String, required: true, unique: true },
  city:       { type: String, required: true },
  lat:        { type: Number, required: true },
  lng:        { type: Number, required: true },
  confidence: { type: String, enum: ['high', 'medium', 'low'], default: 'medium' },
  source:     { type: String, enum: ['nominatim', 'gemini', 'cache'], default: 'nominatim' },
  createdAt:  { type: Date, default: () => new Date() },
});

// TTL: 30 days — city coordinates don't change often
GeocodeCacheSchema.index({ createdAt: 1 }, { expireAfterSeconds: 30 * 86400 });

export const GeocodeCache: Model<IGeocodeCache> =
  mongoose.models.GeocodeCache ??
  mongoose.model<IGeocodeCache>('GeocodeCache', GeocodeCacheSchema);
