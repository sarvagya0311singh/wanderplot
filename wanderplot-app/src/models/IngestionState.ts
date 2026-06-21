import mongoose, { Schema, Document, Model } from 'mongoose';

export type IngestionPhase = 'wikidata' | 'osm' | 'foursquare' | 'overture' | 'gemini-enrich' | 'seed-enrich';
export type IngestionStatus = 'idle' | 'running' | 'paused' | 'completed' | 'failed';

export interface IIngestionState extends Document {
  /** Unique identifier per ingestion job type */
  jobId: string;
  phase: IngestionPhase;
  status: IngestionStatus;
  /** Opaque cursor — e.g. Wikidata offset, OSM node ID, last-processed index */
  cursor: string;
  /** How many records processed in total this run */
  totalProcessed: number;
  /** How many were new upserts */
  totalInserted: number;
  /** How many were duplicate merges */
  totalMerged: number;
  /** How many failed validation */
  totalRejected: number;
  lastRunAt: Date;
  /** Error message if status=failed */
  lastError?: string;
  /** Free-form metadata (batch size, config snapshot) */
  metadata?: Record<string, unknown>;
  createdAt: Date;
  updatedAt: Date;
}

const IngestionStateSchema = new Schema<IIngestionState>(
  {
    jobId:          { type: String, required: true, unique: true },
    phase:          { type: String, enum: ['wikidata', 'osm', 'foursquare', 'overture', 'gemini-enrich', 'seed-enrich'], required: true },
    status:         { type: String, enum: ['idle', 'running', 'paused', 'completed', 'failed'], default: 'idle' },
    cursor:         { type: String, default: '' },
    totalProcessed: { type: Number, default: 0 },
    totalInserted:  { type: Number, default: 0 },
    totalMerged:    { type: Number, default: 0 },
    totalRejected:  { type: Number, default: 0 },
    lastRunAt:      { type: Date, default: () => new Date() },
    lastError:      String,
    metadata:       { type: Schema.Types.Mixed, default: {} },
  },
  { timestamps: true, collection: 'ingestionState' }
);

export const IngestionState: Model<IIngestionState> =
  mongoose.models.IngestionState ??
  mongoose.model<IIngestionState>('IngestionState', IngestionStateSchema);
