'use client';
import { useEffect, useState } from 'react';
import { useSession } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import Image from 'next/image';
import {
  MapPin, Calendar, Trash2, Share2, Plus,
  Heart, LayoutDashboard, User, Copy, CheckCheck
} from 'lucide-react';
import toast from 'react-hot-toast';

const MONTHS = ['', 'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function TripCard({ trip, onDelete }: { trip: any; onDelete: (id: string) => void }) {
  const [copied, setCopied] = useState(false);
  const shareUrl = `${window.location.origin}/trips/${trip.shareToken}`;

  const handleCopy = async () => {
    await navigator.clipboard.writeText(shareUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
    toast.success('Link copied!');
  };

  return (
    <div className="card group overflow-hidden">
      {/* Gradient header */}
      <div className="bg-hero-gradient p-5 text-white relative">
        <div className="absolute top-3 right-3">
          <span className="text-2xl font-display font-bold text-white/90">{trip.matchScore}
            <span className="text-xs font-normal text-white/50">/100</span>
          </span>
        </div>
        <div className="flex items-center gap-1.5 text-white/50 text-xs mb-1">
          <MapPin className="w-3 h-3" />
          {trip.selectedDestination?.state}
        </div>
        <h3 className="font-display font-semibold text-lg">
          {trip.title || `${trip.inputs?.days}d in ${trip.selectedDestination?.name}`}
        </h3>
        <div className="flex gap-3 mt-2 text-white/60 text-xs">
          <span className="flex items-center gap-1"><Calendar className="w-3 h-3" /> {MONTHS[trip.inputs?.month]}</span>
          <span>₹{trip.inputs?.budget?.toLocaleString('en-IN')}</span>
          <span>{trip.inputs?.groupType}</span>
        </div>
      </div>

      <div className="p-4 flex items-center gap-2">
        <Link href={`/trips/${trip.shareToken}`} className="btn-primary flex-1 justify-center text-sm py-2.5">
          View Trip
        </Link>
        <button onClick={handleCopy} className="p-2.5 rounded-xl border-2 border-gray-200 hover:border-brand/40 transition-colors">
          {copied ? <CheckCheck className="w-4 h-4 text-brand" /> : <Share2 className="w-4 h-4 text-gray-400" />}
        </button>
        <button
          onClick={() => onDelete(trip._id)}
          className="p-2.5 rounded-xl border-2 border-gray-200 hover:border-red-200 hover:bg-red-50 transition-colors"
        >
          <Trash2 className="w-4 h-4 text-gray-400 hover:text-red-400" />
        </button>
      </div>
    </div>
  );
}

export default function DashboardPage() {
  const { data: session, status } = useSession();
  const router = useRouter();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [trips, setTrips] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (status === 'unauthenticated') {
      router.push('/auth/signin?callbackUrl=/dashboard');
    }
  }, [status, router]);

  useEffect(() => {
    if (status === 'authenticated') {
      fetch('/api/trips')
        .then((r) => r.json())
        .then((d) => setTrips(d.trips || []))
        .catch(() => toast.error('Failed to load trips'))
        .finally(() => setLoading(false));
    }
  }, [status]);

  const handleDelete = async (id: string) => {
    try {
      await fetch(`/api/trips/${id}`, { method: 'DELETE' });
      setTrips((prev) => prev.filter((t) => t._id !== id));
      toast.success('Trip deleted');
    } catch {
      toast.error('Failed to delete');
    }
  };

  if (status === 'loading' || loading) {
    return (
      <div className="min-h-screen bg-cream flex items-center justify-center">
        <div className="w-12 h-12 rounded-full border-4 border-brand border-t-transparent animate-spin" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-cream page-enter">
      {/* Header */}
      <div className="bg-hero-gradient pt-24 pb-10">
        <div className="max-w-5xl mx-auto px-4 sm:px-6">
          <div className="flex items-center gap-4">
            {session?.user?.image ? (
              <Image
                src={session.user.image}
                alt="avatar"
                width={56}
                height={56}
                className="rounded-full border-2 border-white/30"
              />
            ) : (
              <div className="w-14 h-14 rounded-full bg-white/20 flex items-center justify-center">
                <User className="w-7 h-7 text-white" />
              </div>
            )}
            <div>
              <h1 className="font-display font-bold text-3xl text-white">
                {session?.user?.name?.split(' ')[0]}&apos;s Dashboard
              </h1>
              <p className="text-white/60 text-sm">{session?.user?.email}</p>
            </div>
          </div>

          <div className="flex gap-6 mt-8 text-white/70 text-sm">
            <div className="flex items-center gap-2">
              <LayoutDashboard className="w-4 h-4" />
              <span className="font-semibold text-white">{trips.length}</span> trips saved
            </div>
          </div>
        </div>
      </div>

      <div className="max-w-5xl mx-auto px-4 sm:px-6 py-10">
        {/* Saved Trips */}
        <div className="flex items-center justify-between mb-6">
          <h2 className="font-display font-bold text-2xl text-brand flex items-center gap-2">
            <MapPin className="w-5 h-5" />
            Saved Trips
          </h2>
          <Link href="/plan" className="btn-primary text-sm px-5 py-2.5">
            <Plus className="w-4 h-4" />
            New Trip
          </Link>
        </div>

        {trips.length === 0 ? (
          <div className="card p-12 text-center">
            <div className="text-5xl mb-4">🗺️</div>
            <h3 className="font-semibold text-gray-900 text-xl mb-2">No trips yet</h3>
            <p className="text-gray-500 mb-6">Plan your first trip and it&apos;ll appear here.</p>
            <Link href="/plan" className="btn-primary">
              <Plus className="w-4 h-4" />
              Plan a Trip
            </Link>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
            {trips.map((trip) => (
              <TripCard key={trip._id} trip={trip} onDelete={handleDelete} />
            ))}
          </div>
        )}

        {/* Wishlist placeholder */}
        <div id="wishlist" className="mt-12">
          <h2 className="font-display font-bold text-2xl text-brand flex items-center gap-2 mb-6">
            <Heart className="w-5 h-5" />
            Wishlist
          </h2>
          <div className="card p-10 text-center">
            <div className="text-4xl mb-3">❤️</div>
            <p className="text-gray-500">
              Heart destinations while exploring recommendations to save them here.
            </p>
            <Link href="/plan" className="btn-secondary mt-4 inline-flex">
              Explore Destinations
            </Link>
          </div>
        </div>

        {/* Copy share links quick access */}
        {trips.length > 0 && (
          <div className="mt-10 card p-6">
            <h3 className="font-semibold text-gray-900 mb-4 flex items-center gap-2">
              <Copy className="w-4 h-4 text-brand" />
              Quick Share Links
            </h3>
            <div className="space-y-2">
              {trips.slice(0, 3).map((trip) => {
                const url = `${window.location.origin}/trips/${trip.shareToken}`;
                return (
                  <div key={trip._id} className="flex items-center gap-3">
                    <span className="text-sm text-gray-600 flex-1 truncate">{trip.title || trip.selectedDestination?.name}</span>
                    <button
                      onClick={async () => {
                        await navigator.clipboard.writeText(url);
                        toast.success('Copied!');
                      }}
                      className="text-xs text-brand hover:underline flex items-center gap-1 shrink-0"
                    >
                      <Copy className="w-3 h-3" />
                      Copy
                    </button>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
