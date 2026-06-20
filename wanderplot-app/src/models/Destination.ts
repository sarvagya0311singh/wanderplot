import mongoose, { Schema, Document, Model } from 'mongoose';

export interface IDestination extends Document {
  name: string;
  state: string;
  country: string;
  coordinates: { lat: number; lng: number };
  scenery: string[];
  experienceTypes: string[];
  bestMonths: number[];
  budgetRange: { min: number; max: number }; // per person per day in INR
  description: string;
  highlights: string[];
  images: string[];
  tags: string[];
  dealbreakers: string[]; // e.g. ['no-flights'] means flights needed
  rating?: number;
  reviewCount?: number;
}

const DestinationSchema = new Schema<IDestination>({
  name: { type: String, required: true },
  state: { type: String, required: true },
  country: { type: String, default: 'India' },
  coordinates: {
    lat: { type: Number, required: true },
    lng: { type: Number, required: true },
  },
  scenery: [String],
  experienceTypes: [String],
  bestMonths: [Number],
  budgetRange: {
    min: { type: Number, required: true },
    max: { type: Number, required: true },
  },
  description: { type: String, required: true },
  highlights: [String],
  images: [String],
  tags: [String],
  dealbreakers: [String],
  rating: Number,
  reviewCount: Number,
});

// Text search index
DestinationSchema.index({ name: 'text', description: 'text', tags: 'text' });

export const Destination: Model<IDestination> =
  mongoose.models.Destination ??
  mongoose.model<IDestination>('Destination', DestinationSchema);
