'use client';
import { useState, useRef } from 'react';
import {
  MapPin, Share2, Download, Bookmark, ArrowLeft, Sparkles,
  Sun, Cloud, Moon, Home, ChevronDown, ChevronUp,
  IndianRupee, Luggage, MessageSquare, Send, Loader2, Copy, CheckCheck
} from 'lucide-react';
import type { TripInputsState } from '@/app/plan/page';
import toast from 'react-hot-toast';
import dynamic from 'next/dynamic';

const MapView = dynamic(() => import('./MapView').then(m => m.MapView), {
  ssr: false,
  loading: () => <div className="h-64 bg-gray-100 rounded-2xl flex items-center justify-center text-gray-400 text-sm">Loading map...</div>,
});

interface ItineraryDay {
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

interface Props {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  destination: any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  itinerary: any;
  inputs: TripInputsState;
  matchScore: number;
  matchReasons: string[];
  onRefine: (instruction: string) => void;
  onSave: () => void;
  savedTripId: string | null;
  onBack: () => void;
  loading: boolean;
}

export function ItineraryView({
  destination,
  itinerary,
  inputs,
  matchScore,
  onRefine,
  onSave,
  savedTripId,
  onBack,
  loading,
}: Props) {
  const [expandedDay, setExpandedDay] = useState<number>(1);
  const [refineText, setRefineText] = useState('');
  const [showPackingList, setShowPackingList] = useState(false);
  const [copied, setCopied] = useState(false);
  const printRef = useRef<HTMLDivElement>(null);

  const shareUrl = savedTripId
    ? `${window.location.origin}/trips/${savedTripId}`
    : null;

  const handleCopyLink = async () => {
    if (!shareUrl) {
      await onSave();
      return;
    }
    await navigator.clipboard.writeText(shareUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
    toast.success('Link copied!');
  };

  const handlePrint = () => {
    window.print();
  };

  const quickRefines = [
    '🏷️ Make it cheaper',
    '😴 Add more rest time',
    '🍽️ Add food recommendations',
    '🏕️ More outdoor activities',
    '🌃 More evening options',
  ];

  const MONTHS = ['', 'January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December'];

  const totalBudget = Object.values(itinerary.budgetBreakdown || {}).reduce(
    (sum: number, val) => sum + (val as number), 0
  );

  return (
    <div className="animate-fade-in" ref={printRef}>
      {/* Back button */}
      <button onClick={onBack} className="flex items-center gap-2 text-brand hover:text-brand-light text-sm font-medium mb-6 group">
        <ArrowLeft className="w-4 h-4 group-hover:-translate-x-1 transition-transform" />
        Change destination
      </button>

      {/* Trip Header Card */}
      <div className="card overflow-hidden mb-6">
        <div className="bg-hero-gradient p-8 text-white relative overflow-hidden">
          <div className="absolute inset-0 bg-gradient-radial from-white/5 to-transparent" />
          <div className="relative">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div>
                <div className="flex items-center gap-2 text-white/60 text-sm mb-2">
                  <MapPin className="w-4 h-4" />
                  {destination.state}
                </div>
                <h2 className="font-display font-bold text-3xl md:text-4xl">
                  {inputs.days} Days in {destination.name}
                </h2>
                <div className="flex flex-wrap gap-3 mt-3 text-white/70 text-sm">
                  <span>📅 {MONTHS[inputs.month]}</span>
                  <span>👥 {inputs.groupType}</span>
                  <span>⚡ {inputs.pace} pace</span>
                  <span>💰 ₹{inputs.budget.toLocaleString('en-IN')} budget</span>
                </div>
              </div>
              <div className="flex items-center gap-2 bg-white/15 rounded-2xl px-4 py-3">
                <span className="font-display font-bold text-4xl">{matchScore}</span>
                <div className="text-xs text-white/70">
                  <div>Match</div>
                  <div>Score</div>
                </div>
              </div>
            </div>

            {itinerary.summary && (
              <p className="mt-4 text-white/80 leading-relaxed italic max-w-2xl">
                &ldquo;{itinerary.summary}&rdquo;
              </p>
            )}

            {/* Action buttons */}
            <div className="flex flex-wrap gap-3 mt-6">
              <button
                onClick={onSave}
                disabled={!!savedTripId}
                className="flex items-center gap-2 px-4 py-2 rounded-full bg-white/20 hover:bg-white/30 text-sm font-medium transition-colors disabled:opacity-50"
              >
                <Bookmark className="w-4 h-4" />
                {savedTripId ? 'Saved ✓' : 'Save Trip'}
              </button>
              <button
                onClick={handleCopyLink}
                className="flex items-center gap-2 px-4 py-2 rounded-full bg-white/20 hover:bg-white/30 text-sm font-medium transition-colors"
              >
                {copied ? <CheckCheck className="w-4 h-4" /> : <Share2 className="w-4 h-4" />}
                {copied ? 'Copied!' : shareUrl ? 'Copy Link' : 'Share'}
              </button>
              <button
                onClick={handlePrint}
                className="flex items-center gap-2 px-4 py-2 rounded-full bg-white/20 hover:bg-white/30 text-sm font-medium transition-colors"
              >
                <Download className="w-4 h-4" />
                Export PDF
              </button>
            </div>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Main: Itinerary days */}
        <div className="lg:col-span-2 space-y-4">
          <h3 className="font-display font-bold text-2xl text-brand">Day-by-Day Plan</h3>

          {itinerary.days?.map((day: ItineraryDay) => (
            <div key={day.day} className="card overflow-hidden">
              {/* Day header */}
              <button
                className="w-full flex items-center justify-between p-5 hover:bg-gray-50 transition-colors"
                onClick={() => setExpandedDay(expandedDay === day.day ? 0 : day.day)}
              >
                <div className="flex items-center gap-4">
                  <div className="w-10 h-10 rounded-full bg-brand text-white font-bold flex items-center justify-center text-sm">
                    {day.day}
                  </div>
                  <div className="text-left">
                    <div className="font-semibold text-gray-900">{day.title}</div>
                    <div className="text-xs text-gray-400 mt-0.5 flex items-center gap-2">
                      <Home className="w-3 h-3" />
                      {day.accommodation}
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <span className="text-sm font-semibold text-brand">
                    ₹{day.estimatedCost?.toLocaleString('en-IN')}
                  </span>
                  {expandedDay === day.day ? (
                    <ChevronUp className="w-5 h-5 text-gray-400" />
                  ) : (
                    <ChevronDown className="w-5 h-5 text-gray-400" />
                  )}
                </div>
              </button>

              {/* Day content */}
              {expandedDay === day.day && (
                <div className="px-5 pb-5 border-t border-gray-100 animate-slide-up">
                  <div className="space-y-4 mt-4">
                    {[
                      { icon: Sun, label: 'Morning', content: day.morning, color: 'text-amber' },
                      { icon: Cloud, label: 'Afternoon', content: day.afternoon, color: 'text-blue-500' },
                      { icon: Moon, label: 'Evening', content: day.evening, color: 'text-indigo-500' },
                    ].map(({ icon: Icon, label, content, color }) => (
                      <div key={label} className="flex gap-3">
                        <div className={`flex-none mt-1 ${color}`}>
                          <Icon className="w-4 h-4" />
                        </div>
                        <div>
                          <p className="text-xs font-bold text-gray-400 uppercase tracking-wide mb-1">{label}</p>
                          <p className="text-sm text-gray-700 leading-relaxed">{content}</p>
                        </div>
                      </div>
                    ))}

                    {day.tips && (
                      <div className="bg-amber/10 border border-amber/20 rounded-xl p-3 text-sm text-amber-800">
                        <span className="font-semibold">💡 Insider tip: </span>
                        {day.tips}
                      </div>
                    )}

                    {(day.locations?.length ?? 0) > 0 && (
                      <div className="flex flex-wrap gap-1.5">
                        {day.locations?.map((loc: string) => (
                          <span key={loc} className="flex items-center gap-1 text-xs px-2 py-1 rounded-full bg-brand/10 text-brand">
                            <MapPin className="w-3 h-3" />
                            {loc}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>

        {/* Sidebar */}
        <div className="space-y-5">
          {/* Budget breakdown */}
          <div className="card p-5">
            <h4 className="font-semibold text-gray-900 mb-4 flex items-center gap-2">
              <IndianRupee className="w-4 h-4 text-brand" />
              Budget Breakdown
            </h4>
            <div className="space-y-3">
              {Object.entries(itinerary.budgetBreakdown || {}).map(([key, val]) => {
                const percentage = Math.round(((val as number) / totalBudget) * 100);
                const colors: Record<string, string> = {
                  transport: 'bg-blue-400',
                  accommodation: 'bg-purple-400',
                  food: 'bg-orange-400',
                  activities: 'bg-green-400',
                  misc: 'bg-gray-400',
                };
                return (
                  <div key={key}>
                    <div className="flex justify-between text-xs mb-1.5">
                      <span className="capitalize text-gray-600">{key}</span>
                      <span className="font-medium text-gray-800">₹{(val as number).toLocaleString('en-IN')}</span>
                    </div>
                    <div className="score-bar">
                      <div
                        className={`score-fill ${colors[key] || 'bg-brand'}`}
                        style={{ width: `${percentage}%` }}
                      />
                    </div>
                  </div>
                );
              })}
              <div className="pt-3 border-t border-gray-100 flex justify-between font-semibold">
                <span className="text-gray-700">Total</span>
                <span className="text-brand">₹{totalBudget.toLocaleString('en-IN')}</span>
              </div>
            </div>
          </div>

          {/* Map */}
          <div className="card p-4">
            <h4 className="font-semibold text-gray-900 mb-3 flex items-center gap-2">
              <MapPin className="w-4 h-4 text-brand" />
              Location
            </h4>
            {destination.coordinates && (
              <MapView
                coordinates={destination.coordinates}
                name={destination.name}
                days={itinerary.days}
              />
            )}
          </div>

          {/* Packing list */}
          {itinerary.packingList?.length > 0 && (
            <div className="card p-5">
              <button
                className="flex items-center justify-between w-full"
                onClick={() => setShowPackingList(!showPackingList)}
              >
                <h4 className="font-semibold text-gray-900 flex items-center gap-2">
                  <Luggage className="w-4 h-4 text-brand" />
                  Packing List
                </h4>
                <span className="text-xs text-gray-400 bg-gray-100 px-2 py-0.5 rounded-full">
                  {itinerary.packingList.length} items
                </span>
              </button>
              {showPackingList && (
                <div className="mt-3 grid grid-cols-2 gap-1.5 animate-slide-up">
                  {itinerary.packingList.map((item: string) => (
                    <div key={item} className="flex items-center gap-2 text-sm text-gray-600">
                      <div className="w-4 h-4 rounded border border-gray-300 flex-none" />
                      {item}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* AI Chat Refinement */}
          <div className="card p-5">
            <h4 className="font-semibold text-gray-900 mb-3 flex items-center gap-2">
              <Sparkles className="w-4 h-4 text-brand" />
              Refine with AI
            </h4>

            {/* Quick chips */}
            <div className="flex flex-wrap gap-1.5 mb-3">
              {quickRefines.map((q) => (
                <button
                  key={q}
                  onClick={() => onRefine(q)}
                  disabled={loading}
                  className="text-xs px-3 py-1.5 rounded-full bg-brand/10 text-brand hover:bg-brand hover:text-white transition-colors disabled:opacity-50"
                >
                  {q}
                </button>
              ))}
            </div>

            {/* Custom instruction */}
            <div className="flex gap-2">
              <input
                type="text"
                value={refineText}
                onChange={(e) => setRefineText(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && refineText.trim()) {
                    onRefine(refineText);
                    setRefineText('');
                  }
                }}
                placeholder='e.g. "add a vegetarian restaurant day 2"'
                className="input-field text-sm py-2.5"
                disabled={loading}
              />
              <button
                onClick={() => {
                  if (refineText.trim()) {
                    onRefine(refineText);
                    setRefineText('');
                  }
                }}
                disabled={loading || !refineText.trim()}
                className="btn-primary px-4 py-2.5 disabled:opacity-50"
              >
                {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
              </button>
            </div>
            <p className="text-xs text-gray-400 mt-2 flex items-center gap-1">
              <MessageSquare className="w-3 h-3" />
              Powered by AI — changes happen instantly
            </p>
          </div>

          {/* Share link */}
          {shareUrl && (
            <div className="card p-5">
              <h4 className="font-semibold text-gray-900 mb-3 flex items-center gap-2">
                <Share2 className="w-4 h-4 text-brand" />
                Share This Trip
              </h4>
              <div className="flex gap-2">
                <input
                  readOnly
                  value={shareUrl}
                  className="input-field text-xs py-2"
                />
                <button onClick={handleCopyLink} className="btn-primary px-3 py-2 text-xs">
                  <Copy className="w-3 h-3" />
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
