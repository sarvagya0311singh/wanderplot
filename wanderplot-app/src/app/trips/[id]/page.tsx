import { notFound } from 'next/navigation';
import { isDbConfigured } from '@/config/env.config';
import { AlertTriangle } from 'lucide-react';
import Link from 'next/link';
import type { Metadata } from 'next';
import TripItineraryLayout from '@/components/TripItineraryLayout';

interface Props {
  params: Promise<{ id: string }>;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  if (!isDbConfigured()) return { title: 'Setup Required — WanderPlot' };
  const { id } = await params;
  try {
    const { connectDB } = await import('@/lib/db');
    const { Trip } = await import('@/models/Trip');
    await connectDB();
    const trip = await Trip.findOne({ shareToken: id }).lean() ?? await Trip.findById(id).lean();
    if (!trip) return { title: 'Trip Not Found' };
    return {
      title: `${(trip as { title?: string }).title || `Trip to ${(trip as { selectedDestination?: { name?: string } }).selectedDestination?.name}`} — WanderPlot`,
      description: `Check out this AI-planned trip on WanderPlot`,
    };
  } catch { return { title: 'Trip — WanderPlot' }; }
}

const MONTHS = ['', 'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December'];

export default async function SharedTripPage({ params }: Props) {
  if (!isDbConfigured()) {
    return (
      <div className="min-h-screen bg-cream flex items-center justify-center">
        <div className="card p-10 text-center max-w-md mx-4">
          <AlertTriangle className="w-12 h-12 text-amber mx-auto mb-4" />
          <h1 className="font-display font-bold text-2xl text-gray-900 mb-2">MongoDB Required</h1>
          <p className="text-gray-500 mb-6">Shared trips are stored in MongoDB. Add <code className="bg-gray-100 px-1 rounded">MONGODB_URI</code> to your <code className="bg-gray-100 px-1 rounded">.env.local</code> to view saved trips.</p>
          <Link href="/plan" className="btn-primary justify-center">Plan a New Trip</Link>
        </div>
      </div>
    );
  }

  const { id } = await params;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let trip: any = null;

  try {
    const { connectDB } = await import('@/lib/db');
    const { Trip } = await import('@/models/Trip');
    await connectDB();

    trip = await Trip.findOne({ shareToken: id }).lean();
    if (!trip) {
      try { trip = await Trip.findById(id).lean(); } catch { /* invalid id format */ }
    }
  } catch (err) {
    console.error('SharedTripPage DB error:', err);
    return (
      <div className="min-h-screen bg-cream flex items-center justify-center">
        <div className="card p-10 text-center max-w-md mx-4">
          <AlertTriangle className="w-12 h-12 text-amber mx-auto mb-4" />
          <h1 className="font-display font-bold text-2xl text-gray-900 mb-2">
            Could Not Load Trip
          </h1>
          <p className="text-gray-500 mb-6">
            There was a problem connecting to the database. Please try again in a moment.
          </p>
          <Link href="/plan" className="btn-primary justify-center">
            Plan a New Trip
          </Link>
        </div>
      </div>
    );
  }

  if (!trip) notFound();

  return <TripItineraryLayout trip={trip} />;
}
