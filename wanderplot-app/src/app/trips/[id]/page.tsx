import { notFound } from 'next/navigation';
import { connectDB } from '@/lib/db';
import { Trip } from '@/models/Trip';
import { MapPin, Calendar, Users, Gauge, Share2, Sun, Cloud, Moon, Home, IndianRupee } from 'lucide-react';
import Link from 'next/link';
import type { Metadata } from 'next';

interface Props {
  params: Promise<{ id: string }>;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { id } = await params;
  await connectDB();
  const trip = await Trip.findOne({ shareToken: id }).lean() ?? await Trip.findById(id).lean();
  if (!trip) return { title: 'Trip Not Found' };
  return {
    title: `${(trip as { title?: string }).title || `Trip to ${(trip as { selectedDestination?: { name?: string } }).selectedDestination?.name}`} — WanderPlot`,
    description: `Check out this AI-planned trip on WanderPlot`,
  };
}

const MONTHS = ['', 'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December'];

export default async function SharedTripPage({ params }: Props) {
  const { id } = await params;
  await connectDB();

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let trip: any = await Trip.findOne({ shareToken: id }).lean();
  if (!trip) {
    try { trip = await Trip.findById(id).lean(); } catch { /* invalid id */ }
  }
  if (!trip) notFound();

  const { selectedDestination: dest, inputs, itinerary, matchScore, title } = trip;
  const totalBudget = Object.values(itinerary?.budgetBreakdown || {}).reduce(
    (sum: number, v) => sum + (v as number), 0
  );

  return (
    <div className="min-h-screen bg-cream page-enter">
      {/* Hero */}
      <div className="bg-hero-gradient pt-24 pb-12">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 text-white">
          <div className="flex items-center gap-2 text-white/60 text-sm mb-3">
            <MapPin className="w-4 h-4" />
            {dest?.state}
          </div>
          <h1 className="font-display font-bold text-4xl md:text-5xl">
            {title || `${inputs?.days} Days in ${dest?.name}`}
          </h1>
          <div className="flex flex-wrap gap-4 mt-4 text-white/70 text-sm">
            <span className="flex items-center gap-1.5"><Calendar className="w-4 h-4" /> {MONTHS[inputs?.month]}</span>
            <span className="flex items-center gap-1.5"><Users className="w-4 h-4" /> {inputs?.groupType}</span>
            <span className="flex items-center gap-1.5"><Gauge className="w-4 h-4" /> {inputs?.pace} pace</span>
            <span className="flex items-center gap-1.5"><IndianRupee className="w-4 h-4" /> ₹{inputs?.budget?.toLocaleString('en-IN')} budget</span>
          </div>
          {matchScore && (
            <div className="inline-flex items-center gap-2 mt-4 bg-white/15 rounded-full px-4 py-2 text-sm">
              <span className="font-bold text-amber">{matchScore}/100</span>
              <span className="text-white/70">match score</span>
            </div>
          )}
        </div>
      </div>

      <div className="max-w-4xl mx-auto px-4 sm:px-6 py-10">
        {/* Summary */}
        {itinerary?.summary && (
          <div className="card p-6 mb-8">
            <p className="text-gray-600 italic text-lg leading-relaxed">&ldquo;{itinerary.summary}&rdquo;</p>
          </div>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Days */}
          <div className="lg:col-span-2 space-y-4">
            <h2 className="font-display font-bold text-2xl text-brand">Itinerary</h2>
            {itinerary?.days?.map((day: { day: number; title: string; morning: string; afternoon: string; evening: string; accommodation: string; estimatedCost: number; tips?: string; locations?: string[] }) => (
              <div key={day.day} className="card p-6">
                <div className="flex items-center gap-3 mb-4">
                  <div className="w-9 h-9 rounded-full bg-brand text-white font-bold text-sm flex items-center justify-center">
                    {day.day}
                  </div>
                  <div>
                    <h3 className="font-semibold text-gray-900">{day.title}</h3>
                    <p className="text-xs text-gray-400 flex items-center gap-1 mt-0.5">
                      <Home className="w-3 h-3" /> {day.accommodation}
                    </p>
                  </div>
                  <span className="ml-auto text-sm font-semibold text-brand">₹{day.estimatedCost?.toLocaleString('en-IN')}</span>
                </div>
                <div className="space-y-3 pl-2 border-l-2 border-brand/20">
                  {[
                    { icon: Sun, label: 'Morning', content: day.morning, color: 'text-amber' },
                    { icon: Cloud, label: 'Afternoon', content: day.afternoon, color: 'text-blue-500' },
                    { icon: Moon, label: 'Evening', content: day.evening, color: 'text-indigo-500' },
                  ].map(({ icon: Icon, label, content, color }) => (
                    <div key={label} className="flex gap-3 pl-3">
                      <Icon className={`w-4 h-4 mt-0.5 ${color} flex-none`} />
                      <div>
                        <p className="text-xs font-bold text-gray-400 uppercase tracking-wide">{label}</p>
                        <p className="text-sm text-gray-700 leading-relaxed mt-0.5">{content}</p>
                      </div>
                    </div>
                  ))}
                </div>
                {day.tips && (
                  <div className="mt-3 bg-amber/10 rounded-xl p-3 text-sm text-amber-800">
                    <span className="font-semibold">💡 Tip: </span>{day.tips}
                  </div>
                )}
              </div>
            ))}
          </div>

          {/* Sidebar */}
          <div className="space-y-5">
            {/* Budget */}
            <div className="card p-5">
              <h4 className="font-semibold text-gray-900 mb-4 flex items-center gap-2">
                <IndianRupee className="w-4 h-4 text-brand" />
                Budget Breakdown
              </h4>
              <div className="space-y-3">
                {Object.entries(itinerary?.budgetBreakdown || {}).map(([key, val]) => {
                  const pct = Math.round(((val as number) / totalBudget) * 100);
                  return (
                    <div key={key}>
                      <div className="flex justify-between text-xs mb-1">
                        <span className="capitalize text-gray-600">{key}</span>
                        <span className="font-medium">₹{(val as number).toLocaleString('en-IN')}</span>
                      </div>
                      <div className="score-bar">
                        <div className="score-fill bg-brand" style={{ width: `${pct}%` }} />
                      </div>
                    </div>
                  );
                })}
                <div className="pt-3 border-t border-gray-100 flex justify-between font-semibold">
                  <span>Total</span>
                  <span className="text-brand">₹{totalBudget.toLocaleString('en-IN')}</span>
                </div>
              </div>
            </div>

            {/* Packing */}
            {itinerary?.packingList?.length > 0 && (
              <div className="card p-5">
                <h4 className="font-semibold text-gray-900 mb-3">🎒 Packing List</h4>
                <div className="grid grid-cols-2 gap-1.5">
                  {itinerary.packingList.map((item: string) => (
                    <div key={item} className="flex items-center gap-2 text-xs text-gray-600">
                      <div className="w-3.5 h-3.5 rounded border border-gray-300 flex-none" />
                      {item}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Plan your own */}
            <div className="card p-5 bg-brand text-white">
              <h4 className="font-semibold mb-2 flex items-center gap-2">
                <Share2 className="w-4 h-4" />
                Inspired by this trip?
              </h4>
              <p className="text-white/70 text-sm mb-4">Plan your own personalised trip with WanderPlot — it&apos;s free.</p>
              <Link href="/plan" className="btn-amber text-sm w-full justify-center">
                Start Planning
              </Link>
            </div>
          </div>
        </div>

        <p className="text-center text-xs text-gray-400 mt-10">
          Cost estimates are planning figures, not guaranteed prices. Always verify before booking.
        </p>
      </div>
    </div>
  );
}
