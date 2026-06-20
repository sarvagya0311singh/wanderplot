'use client';
import { ThumbsUp, ThumbsDown, MapPin, CheckCircle, AlertTriangle, ChevronRight } from 'lucide-react';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
interface Props {
  rec: any;
  onSelect: () => void;
}

const sceneryColors: Record<string, string> = {
  mountains: 'bg-blue-100 text-blue-700',
  beach: 'bg-cyan-100 text-cyan-700',
  forest: 'bg-green-100 text-green-700',
  desert: 'bg-orange-100 text-orange-700',
  lake: 'bg-teal-100 text-teal-700',
  backwaters: 'bg-emerald-100 text-emerald-700',
  river: 'bg-sky-100 text-sky-700',
  plains: 'bg-yellow-100 text-yellow-700',
};

const scoreColor = (score: number) => {
  if (score >= 80) return 'text-green-600';
  if (score >= 60) return 'text-amber';
  return 'text-red-500';
};

const scoreBarColor = (score: number) => {
  if (score >= 80) return 'bg-green-500';
  if (score >= 60) return 'bg-amber';
  return 'bg-red-400';
};

export function DestinationCard({ rec, onSelect }: Props) {
  const { destination, totalScore, scores, reasons, warnings } = rec;

  const MONTHS = ['', 'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

  // Background gradient by scenery
  const primaryScenery = destination.scenery?.[0] || 'mountains';
  const gradients: Record<string, string> = {
    mountains: 'from-slate-700 to-blue-900',
    beach: 'from-cyan-600 to-blue-700',
    forest: 'from-green-700 to-emerald-900',
    desert: 'from-amber-600 to-orange-800',
    lake: 'from-teal-600 to-cyan-900',
    backwaters: 'from-emerald-600 to-teal-800',
    river: 'from-blue-500 to-cyan-700',
    plains: 'from-yellow-600 to-amber-800',
  };
  const gradient = gradients[primaryScenery] || 'from-gray-700 to-gray-900';

  return (
    <div className="card group overflow-hidden hover:-translate-y-1 transition-all duration-300">
      {/* Destination header */}
      <div className={`bg-gradient-to-br ${gradient} p-6 relative min-h-36`}>
        <div className="absolute top-4 right-4">
          <div className={`text-3xl font-display font-bold ${scoreColor(totalScore)} bg-white rounded-2xl px-3 py-1 shadow-md`}>
            {totalScore}
            <span className="text-sm font-normal text-gray-400">/100</span>
          </div>
        </div>

        <div className="text-white">
          <div className="flex items-center gap-1.5 text-white/60 text-xs mb-2">
            <MapPin className="w-3 h-3" />
            {destination.state}
          </div>
          <h3 className="font-display font-bold text-2xl">{destination.name}</h3>
          <div className="flex flex-wrap gap-1.5 mt-3">
            {destination.scenery?.slice(0, 3).map((s: string) => (
              <span key={s} className="text-xs px-2 py-0.5 rounded-full bg-white/20 text-white/80 capitalize">
                {s}
              </span>
            ))}
          </div>
        </div>
      </div>

      <div className="p-5">
        {/* Warnings */}
        {warnings?.length > 0 && (
          <div className="mb-4 flex flex-wrap gap-2">
            {warnings.map((w: string, i: number) => (
              <span key={i} className="flex items-center gap-1 text-xs px-2.5 py-1 rounded-full bg-amber/10 text-amber-700 font-medium border border-amber/20">
                <AlertTriangle className="w-3 h-3" />
                {w}
              </span>
            ))}
          </div>
        )}

        {/* Score breakdown */}
        <div className="space-y-2 mb-5">
          {Object.entries(scores).map(([key, val]) => (
            <div key={key} className="flex items-center gap-2">
              <span className="text-xs text-gray-500 w-20 capitalize">{key}</span>
              <div className="score-bar flex-1">
                <div
                  className={`score-fill ${scoreBarColor(val as number)}`}
                  style={{ width: `${val}%` }}
                />
              </div>
              <span className={`text-xs font-semibold w-8 text-right ${scoreColor(val as number)}`}>
                {val as number}
              </span>
            </div>
          ))}
        </div>

        {/* Why this place */}
        <div className="mb-5">
          <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">Why this destination</p>
          <ul className="space-y-1">
            {reasons?.slice(0, 3).map((r: string, i: number) => (
              <li key={i} className="flex items-start gap-2 text-xs text-gray-600">
                <CheckCircle className="w-3 h-3 text-brand mt-0.5 shrink-0" />
                {r}
              </li>
            ))}
          </ul>
        </div>

        {/* Budget & season */}
        <div className="flex items-center justify-between text-xs text-gray-500 mb-5">
          <span>
            ₹{destination.budgetRange?.min?.toLocaleString('en-IN')}–
            {destination.budgetRange?.max?.toLocaleString('en-IN')}/day
          </span>
          <span>
            Best: {destination.bestMonths?.slice(0, 3).map((m: number) => MONTHS[m]).join(', ')}
          </span>
        </div>

        {/* Tags */}
        <div className="flex flex-wrap gap-1.5 mb-5">
          {destination.tags?.slice(0, 5).map((tag: string) => (
            <span key={tag} className="tag bg-gray-100 text-gray-600 text-xs">{tag}</span>
          ))}
        </div>

        {/* Actions */}
        <div className="flex gap-2">
          <button
            id={`select-dest-${destination.name?.toLowerCase().replace(/\s/g, '-')}`}
            onClick={onSelect}
            className="btn-primary flex-1 justify-center py-3 text-sm"
          >
            Build Itinerary
            <ChevronRight className="w-4 h-4" />
          </button>
          <button className="p-3 rounded-xl border-2 border-gray-200 hover:border-green-300 hover:bg-green-50 transition-colors">
            <ThumbsUp className="w-4 h-4 text-gray-400 hover:text-green-500" />
          </button>
          <button className="p-3 rounded-xl border-2 border-gray-200 hover:border-red-200 hover:bg-red-50 transition-colors">
            <ThumbsDown className="w-4 h-4 text-gray-400 hover:text-red-400" />
          </button>
        </div>
      </div>
    </div>
  );
}
