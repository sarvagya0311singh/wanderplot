import mongoose, { Schema, Document, Model } from 'mongoose';

export interface IItineraryDay {
  day: number;
  title: string;
  morning: string;
  afternoon: string;
  evening: string;
  accommodation: string;
  estimatedCost: number;
  tips?: string;
  locations?: string[];
}

export interface ITrip extends Document {
  userId?: string; // null for anonymous trips
  shareToken: string; // UUID for public sharing
  isPublic: boolean;
  inputs: {
    origin: string;
    budget: number;
    month: number;
    days: number;
    groupType: string;
    pace: string;
    scenery: string[];
    experience: string[];
    dealbreakers: string[];
  };
  selectedDestination: {
    id: string;
    name: string;
    state: string;
    coordinates: { lat: number; lng: number };
    images: string[];
  };
  matchScore: number;
  matchReasons: string[];
  itinerary: {
    days: IItineraryDay[];
    budgetBreakdown: {
      transport: number;
      accommodation: number;
      food: number;
      activities: number;
      misc: number;
    };
    packingList?: string[];
    llmProvider?: string;
  };
  title?: string;
  createdAt: Date;
  updatedAt: Date;
}

const ItineraryDaySchema = new Schema<IItineraryDay>({
  day: Number,
  title: String,
  morning: String,
  afternoon: String,
  evening: String,
  accommodation: String,
  estimatedCost: Number,
  tips: String,
  locations: [String],
});

const TripSchema = new Schema<ITrip>(
  {
    userId: { type: String, index: true },
    shareToken: { type: String, required: true, unique: true, index: true },
    isPublic: { type: Boolean, default: true },
    inputs: {
      origin: String,
      budget: Number,
      month: Number,
      days: Number,
      groupType: String,
      pace: String,
      scenery: [String],
      experience: [String],
      dealbreakers: [String],
    },
    selectedDestination: {
      id: String,
      name: String,
      state: String,
      coordinates: { lat: Number, lng: Number },
      images: [String],
    },
    matchScore: Number,
    matchReasons: [String],
    itinerary: {
      days: [ItineraryDaySchema],
      budgetBreakdown: {
        transport: Number,
        accommodation: Number,
        food: Number,
        activities: Number,
        misc: Number,
      },
      packingList: [String],
      llmProvider: String,
    },
    title: String,
  },
  { timestamps: true }
);

export const Trip: Model<ITrip> =
  mongoose.models.Trip ?? mongoose.model<ITrip>('Trip', TripSchema);
