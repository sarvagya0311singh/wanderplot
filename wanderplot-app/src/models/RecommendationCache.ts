import mongoose, { Schema, Document, Model } from 'mongoose';

export interface IRecommendationCache extends Document {
  /** SHA-256 of normalised banded inputs — unique index */
  cacheKey: string;
  /** Copy of the Redis key (for cross-invalidation) */
  redisKey?: string;
  /** Input snapshot for debugging */
  inputsSnapshot: Record<string, unknown>;
  /** Ordered list of Destination._id values */
  destinationIds: string[];
  /** Total candidates before top-N slicing */
  totalCandidates: number;
  /** Source flag at time of caching */
  source: string;
  createdAt: Date;
}

const RecommendationCacheSchema = new Schema<IRecommendationCache>({
  cacheKey:        { type: String, required: true, unique: true },
  redisKey:        String,
  inputsSnapshot:  { type: Schema.Types.Mixed, default: {} },
  destinationIds:  [{ type: String }],
  totalCandidates: { type: Number, default: 0 },
  source:          { type: String, default: 'unknown' },
  createdAt:       { type: Date, default: () => new Date() },
});

// TTL: RECO_CACHE_TTL_HOURS (default 6h). Atlas auto-deletes expired entries.
const ttlHours = parseInt(process.env.RECO_CACHE_TTL_HOURS || '6', 10);
RecommendationCacheSchema.index({ createdAt: 1 }, { expireAfterSeconds: ttlHours * 3600 });

export const RecommendationCache: Model<IRecommendationCache> =
  mongoose.models.RecommendationCache ??
  mongoose.model<IRecommendationCache>('RecommendationCache', RecommendationCacheSchema);
