'use client';
import { useState } from 'react';
import {
  MapPin, Calendar, Users, Gauge, Palette, Star, Ban, Shuffle,
  ArrowRight, IndianRupee
} from 'lucide-react';
import type { TripInputsState } from '@/app/plan/page';

const SCENERY_OPTIONS = [
  { value: 'mountains', label: 'Mountains', emoji: '🏔️' },
  { value: 'beach', label: 'Beach', emoji: '🏖️' },
  { value: 'forest', label: 'Forest', emoji: '🌿' },
  { value: 'desert', label: 'Desert', emoji: '🏜️' },
  { value: 'lake', label: 'Lake', emoji: '🏞️' },
  { value: 'backwaters', label: 'Backwaters', emoji: '🛶' },
];

const EXPERIENCE_OPTIONS = [
  { value: 'adventure', label: 'Adventure', emoji: '🧗' },
  { value: 'cultural', label: 'Cultural', emoji: '🏛️' },
  { value: 'spiritual', label: 'Spiritual', emoji: '🪔' },
  { value: 'wildlife', label: 'Wildlife', emoji: '🐘' },
  { value: 'relaxation', label: 'Relaxation', emoji: '😌' },
  { value: 'offbeat', label: 'Offbeat', emoji: '🗺️' },
  { value: 'romantic', label: 'Romantic', emoji: '💑' },
  { value: 'family', label: 'Family', emoji: '👨‍👩‍👧' },
];

const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

const GROUP_TYPES = [
  { value: 'solo', label: 'Solo', emoji: '🧑' },
  { value: 'couple', label: 'Couple', emoji: '💑' },
  { value: 'family', label: 'Family', emoji: '👨‍👩‍👧' },
  { value: 'friends', label: 'Friends', emoji: '👥' },
  { value: 'parents', label: 'With Parents', emoji: '👴' },
];

interface Props {
  onSubmit: (data: TripInputsState) => void;
}

export function PlannerForm({ onSubmit }: Props) {
  const [origin, setOrigin] = useState('');
  const [budget, setBudget] = useState(15000);
  const [month, setMonth] = useState(new Date().getMonth() + 1);
  const [days, setDays] = useState(4);
  const [groupType, setGroupType] = useState('couple');
  const [pace, setPace] = useState('moderate');
  const [scenery, setScenery] = useState<string[]>([]);
  const [experience, setExperience] = useState<string[]>([]);
  const [dealbreakers, setDealbreakers] = useState<string[]>([]);

  const toggleMulti = (
    arr: string[],
    setArr: (a: string[]) => void,
    val: string
  ) => {
    setArr(arr.includes(val) ? arr.filter((x) => x !== val) : [...arr, val]);
  };

  const handleSurpriseMe = () => {
    setScenery([]);
    setExperience([]);
    setPace('moderate');
    onSubmit({ origin: origin || 'Delhi', budget, month, days, groupType, pace: 'moderate', scenery: [], experience: [], dealbreakers });
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSubmit({ origin, budget, month, days, groupType, pace, scenery, experience, dealbreakers });
  };

  return (
    <form onSubmit={handleSubmit} className="max-w-2xl mx-auto">
      <div className="card p-8 space-y-8">

        {/* Origin */}
        <div>
          <label className="flex items-center gap-2 text-sm font-semibold text-gray-700 mb-3">
            <MapPin className="w-4 h-4 text-brand" />
            Where are you travelling from?
          </label>
          <input
            id="origin-input"
            type="text"
            value={origin}
            onChange={(e) => setOrigin(e.target.value)}
            placeholder="e.g. Mumbai, Delhi, Bangalore..."
            className="input-field"
            required
          />
        </div>

        {/* Budget + Days */}
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="flex items-center gap-2 text-sm font-semibold text-gray-700 mb-3">
              <IndianRupee className="w-4 h-4 text-brand" />
              Total Budget
            </label>
            <input
              id="budget-input"
              type="range"
              min={3000}
              max={200000}
              step={1000}
              value={budget}
              onChange={(e) => setBudget(Number(e.target.value))}
              className="w-full accent-brand"
            />
            <div className="text-center mt-2">
              <span className="font-bold text-brand text-lg">
                ₹{budget.toLocaleString('en-IN')}
              </span>
              <span className="text-gray-400 text-xs ml-1">total</span>
            </div>
          </div>
          <div>
            <label className="flex items-center gap-2 text-sm font-semibold text-gray-700 mb-3">
              <Calendar className="w-4 h-4 text-brand" />
              Number of Days
            </label>
            <input
              id="days-input"
              type="range"
              min={1}
              max={14}
              step={1}
              value={days}
              onChange={(e) => setDays(Number(e.target.value))}
              className="w-full accent-brand"
            />
            <div className="text-center mt-2">
              <span className="font-bold text-brand text-lg">{days}</span>
              <span className="text-gray-400 text-xs ml-1">days</span>
            </div>
          </div>
        </div>

        {/* Month */}
        <div>
          <label className="flex items-center gap-2 text-sm font-semibold text-gray-700 mb-3">
            <Calendar className="w-4 h-4 text-brand" />
            Travel Month
          </label>
          <div className="grid grid-cols-4 sm:grid-cols-6 gap-2">
            {MONTHS.map((m, i) => (
              <button
                key={m}
                type="button"
                onClick={() => setMonth(i + 1)}
                className={`py-2 px-1 rounded-xl text-xs font-medium transition-all border-2 ${
                  month === i + 1
                    ? 'bg-brand text-white border-brand shadow-md'
                    : 'bg-white text-gray-600 border-gray-200 hover:border-brand/40'
                }`}
              >
                {m.slice(0, 3)}
              </button>
            ))}
          </div>
        </div>

        {/* Group type */}
        <div>
          <label className="flex items-center gap-2 text-sm font-semibold text-gray-700 mb-3">
            <Users className="w-4 h-4 text-brand" />
            Who&apos;s going?
          </label>
          <div className="flex flex-wrap gap-2">
            {GROUP_TYPES.map((g) => (
              <button
                key={g.value}
                type="button"
                onClick={() => setGroupType(g.value)}
                className={`flex items-center gap-2 px-4 py-2 rounded-full text-sm font-medium transition-all border-2 ${
                  groupType === g.value
                    ? 'bg-brand text-white border-brand shadow-md'
                    : 'bg-white text-gray-600 border-gray-200 hover:border-brand/40'
                }`}
              >
                <span>{g.emoji}</span>
                {g.label}
              </button>
            ))}
          </div>
        </div>

        {/* Pace */}
        <div>
          <label className="flex items-center gap-2 text-sm font-semibold text-gray-700 mb-3">
            <Gauge className="w-4 h-4 text-brand" />
            Travel Pace
          </label>
          <div className="flex gap-3">
            {[
              { value: 'packed', label: 'Packed', desc: 'See everything' },
              { value: 'moderate', label: 'Moderate', desc: 'Balanced' },
              { value: 'relaxed', label: 'Relaxed', desc: 'Take it slow' },
            ].map((p) => (
              <button
                key={p.value}
                type="button"
                onClick={() => setPace(p.value)}
                className={`flex-1 py-3 px-2 rounded-2xl text-sm font-medium transition-all border-2 text-center ${
                  pace === p.value
                    ? 'bg-brand text-white border-brand shadow-md'
                    : 'bg-white text-gray-600 border-gray-200 hover:border-brand/40'
                }`}
              >
                <div className="font-semibold">{p.label}</div>
                <div className={`text-xs mt-0.5 ${pace === p.value ? 'text-white/70' : 'text-gray-400'}`}>
                  {p.desc}
                </div>
              </button>
            ))}
          </div>
        </div>

        {/* Scenery */}
        <div>
          <label className="flex items-center gap-2 text-sm font-semibold text-gray-700 mb-3">
            <Palette className="w-4 h-4 text-brand" />
            Scenery Preference <span className="text-gray-400 font-normal ml-1">(pick any)</span>
          </label>
          <div className="flex flex-wrap gap-2">
            {SCENERY_OPTIONS.map((s) => (
              <button
                key={s.value}
                type="button"
                onClick={() => toggleMulti(scenery, setScenery, s.value)}
                className={`flex items-center gap-2 px-3 py-2 rounded-full text-sm font-medium transition-all border-2 ${
                  scenery.includes(s.value)
                    ? 'bg-teal-600 text-white border-teal-600'
                    : 'bg-white text-gray-600 border-gray-200 hover:border-teal-300'
                }`}
              >
                <span>{s.emoji}</span>
                {s.label}
              </button>
            ))}
          </div>
        </div>

        {/* Experience */}
        <div>
          <label className="flex items-center gap-2 text-sm font-semibold text-gray-700 mb-3">
            <Star className="w-4 h-4 text-brand" />
            Experience Type <span className="text-gray-400 font-normal ml-1">(pick any)</span>
          </label>
          <div className="flex flex-wrap gap-2">
            {EXPERIENCE_OPTIONS.map((e) => (
              <button
                key={e.value}
                type="button"
                onClick={() => toggleMulti(experience, setExperience, e.value)}
                className={`flex items-center gap-2 px-3 py-2 rounded-full text-sm font-medium transition-all border-2 ${
                  experience.includes(e.value)
                    ? 'bg-amber text-white border-amber'
                    : 'bg-white text-gray-600 border-gray-200 hover:border-amber/40'
                }`}
              >
                <span>{e.emoji}</span>
                {e.label}
              </button>
            ))}
          </div>
        </div>

        {/* Dealbreakers */}
        <div>
          <label className="flex items-center gap-2 text-sm font-semibold text-gray-700 mb-3">
            <Ban className="w-4 h-4 text-brand" />
            Hard Constraints <span className="text-gray-400 font-normal ml-1">(dealbreakers)</span>
          </label>
          <div className="flex flex-wrap gap-2">
            {[
              { value: 'no-flights', label: '✈️ No Flights' },
              { value: 'vegetarian', label: '🥗 Vegetarian' },
              { value: 'wheelchair', label: '♿ Wheelchair Access' },
              { value: 'pet-friendly', label: '🐕 Pet Friendly' },
              { value: 'alcohol', label: '🚫 No Alcohol' },
            ].map((d) => (
              <button
                key={d.value}
                type="button"
                onClick={() => toggleMulti(dealbreakers, setDealbreakers, d.value)}
                className={`px-3 py-2 rounded-full text-sm font-medium transition-all border-2 ${
                  dealbreakers.includes(d.value)
                    ? 'bg-red-500 text-white border-red-500'
                    : 'bg-white text-gray-600 border-gray-200 hover:border-red-200'
                }`}
              >
                {d.label}
              </button>
            ))}
          </div>
        </div>

        {/* Actions */}
        <div className="flex flex-col sm:flex-row gap-3 pt-2">
          <button type="submit" id="find-destinations-btn" className="btn-primary flex-1 justify-center py-4 text-base">
            Find My Destinations
            <ArrowRight className="w-5 h-5" />
          </button>
          <button
            type="button"
            onClick={handleSurpriseMe}
            className="btn-secondary flex-none px-5 py-4 text-sm gap-1.5"
          >
            <Shuffle className="w-4 h-4" />
            Surprise Me
          </button>
        </div>
      </div>
    </form>
  );
}
