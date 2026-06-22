import mongoose, { Schema, Document, Model } from 'mongoose';

/**
 * Caches generated itineraries keyed by a hash of (destination + banded inputs).
 * Lets repeat requests for the same trip skip the Gemini call entirely — the
 * single biggest reduction in LLM calls. TTL-expired so content stays fresh.
 */
export interface IItineraryCache extends Document {
  cacheKey: string;            // sha256 of destination + banded inputs
  destinationName: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  itinerary: any;              // the generated itinerary JSON (days, budgetBreakdown, …)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  inputsSnapshot: any;         // for debugging / analytics
  llmProvider?: string;
  createdAt: Date;
}

const ItineraryCacheSchema = new Schema<IItineraryCache>({
  cacheKey:        { type: String, required: true, unique: true, index: true },
  destinationName: { type: String, required: true },
  itinerary:       { type: Schema.Types.Mixed, required: true },
  inputsSnapshot:  { type: Schema.Types.Mixed },
  llmProvider:     { type: String },
  // TTL: documents auto-expire 30 days after creation so itineraries refresh.
  createdAt:       { type: Date, default: Date.now, expires: 60 * 60 * 24 * 30 },
});

export const ItineraryCache: Model<IItineraryCache> =
  mongoose.models.ItineraryCache ??
  mongoose.model<IItineraryCache>('ItineraryCache', ItineraryCacheSchema);
