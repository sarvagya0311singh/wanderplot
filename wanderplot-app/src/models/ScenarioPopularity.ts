import mongoose, { Schema, Document, Model } from 'mongoose';

/**
 * Tracks how often each itinerary scenario (cacheKey) is requested, so the
 * background warm job can pre-generate the most popular scenarios — making even
 * the FIRST user hit on a popular trip an instant cache read.
 */
export interface IScenarioPopularity extends Document {
  cacheKey: string;
  destinationName: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  destinationSnapshot: any;  // enough to re-generate without the client
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  inputsSnapshot: any;
  count: number;
  lastSeen: Date;
}

const ScenarioPopularitySchema = new Schema<IScenarioPopularity>({
  cacheKey:            { type: String, required: true, unique: true, index: true },
  destinationName:     { type: String, required: true },
  destinationSnapshot: { type: Schema.Types.Mixed },
  inputsSnapshot:      { type: Schema.Types.Mixed },
  count:               { type: Number, default: 1, index: true },
  lastSeen:            { type: Date, default: Date.now },
});

export const ScenarioPopularity: Model<IScenarioPopularity> =
  mongoose.models.ScenarioPopularity ??
  mongoose.model<IScenarioPopularity>('ScenarioPopularity', ScenarioPopularitySchema);
