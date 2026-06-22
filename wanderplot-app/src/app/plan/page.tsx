'use client';
import { useState } from 'react';
import { PlannerForm } from '@/components/PlannerForm';
import { DestinationCard } from '@/components/DestinationCard';
import { ItineraryView } from '@/components/ItineraryView';
import { Sparkles, MapPin, Map, AlertTriangle, Info } from 'lucide-react';
import toast from 'react-hot-toast';

export type PlanStep = 'intake' | 'recommendations' | 'itinerary';

export interface TripInputsState {
  origin: string;
  originCoords?: { lat: number; lng: number };
  budget: number;
  month: number;
  days: number;
  groupType: string;
  pace: string;
  scenery: string[];
  experience: string[];
  dealbreakers: string[];
  partySize: number;          // §9.4 — number of travellers
  knownDestination?: string;  // §9.3 — "I know where I want to go"
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type ScoredDestination = any;

// Loading messages — short for fast path, longer for AI generation
const LOADING_MESSAGES = {
  recommendations: [
    'Scoring destinations…',
    'Finding fresh destinations for you…',
    'Asking AI for hidden gems…',
  ],
  itinerary: 'Writing your itinerary with AI…',
  refine: 'Updating your plan…',
};

export default function PlanPage() {
  const [step, setStep] = useState<PlanStep>('intake');
  const [inputs, setInputs] = useState<TripInputsState | null>(null);
  const [recommendations, setRecommendations] = useState<ScoredDestination[]>([]);
  const [selectedDest, setSelectedDest] = useState<ScoredDestination | null>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [itinerary, setItinerary] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [loadingMsg, setLoadingMsg] = useState('');
  const [savedTripId, setSavedTripId] = useState<string | null>(null);
  const [llmError, setLlmError] = useState(false);
  const [llmErrorMsg, setLlmErrorMsg] = useState('');
  const [llmErrorKind, setLlmErrorKind] = useState('');
  const [relaxedMsg, setRelaxedMsg] = useState<string | undefined>();
  const [sourceFlag, setSourceFlag] = useState<string>('local');

  // Cycle loading messages for long-running AI generation
  let msgTimer: ReturnType<typeof setTimeout> | null = null;
  const startCyclingMessages = (msgs: string[]) => {
    let i = 0;
    setLoadingMsg(msgs[0]);
    if (msgs.length < 2) return;
    msgTimer = setInterval(() => {
      i = (i + 1) % msgs.length;
      setLoadingMsg(msgs[i]);
    }, 3500);
  };
  const stopCyclingMessages = () => {
    if (msgTimer) clearInterval(msgTimer);
    setLoadingMsg('');
  };

  const handleFormSubmit = async (data: TripInputsState) => {
    setInputs(data);
    setLoading(true);
    setRelaxedMsg(undefined);
    startCyclingMessages(LOADING_MESSAGES.recommendations);
    try {
      const res = await fetch('/api/recommend', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });
      const json = await res.json();
      if (!res.ok) {
        throw new Error(json.error || json.detail || 'Recommendation failed');
      }
      if (data.knownDestination && json.results.length === 1) {
        // Skip recommendations view entirely
        handleSelectDestination(json.results[0], data);
      } else {
        setRecommendations(json.results);
        setSourceFlag(json.source ?? 'local');
        if (json.relaxedMessage) setRelaxedMsg(json.relaxedMessage);
        setStep('recommendations');
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Unknown error';
      toast.error(`Recommendation failed: ${msg}`, { duration: 6000 });
      console.error('Recommend error:', err);
    } finally {
      stopCyclingMessages();
      setLoading(false);
    }
  };

  const handleSelectDestination = async (dest: ScoredDestination, currentInputs?: TripInputsState) => {
    setSelectedDest(dest);
    setLlmError(false);
    setLoading(true);
    setLoadingMsg(LOADING_MESSAGES.itinerary);
    try {
      const activeInputs = currentInputs || inputs;
      const res = await fetch('/api/itinerary/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          destination: dest.destination,
          inputs: activeInputs,
        }),
      });
      const json = await res.json();
      if (!res.ok) {
        if (res.status === 503) {
          setLlmErrorMsg(json.error || 'Itinerary generation failed. Please try again.');
          setLlmErrorKind(json.errorKind || 'unknown');
          setLlmError(true);
          setStep('itinerary');
          return;
        }
        throw new Error(json.error || 'Itinerary generation failed');
      }
      setItinerary(json.itinerary);
      setStep('itinerary');
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Unknown error';
      toast.error(`Itinerary error: ${msg}`, { duration: 8000 });
      console.error('Itinerary error:', err);
    } finally {
      setLoading(false);
      setLoadingMsg('');
    }
  };

  const handleRefine = async (instruction: string) => {
    if (!itinerary || !selectedDest) return;
    setLoading(true);
    setLoadingMsg(LOADING_MESSAGES.refine);
    try {
      const res = await fetch('/api/itinerary/refine', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          itinerary,
          instruction,
          destination: selectedDest.destination,
          inputs,
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error);
      setItinerary(json.itinerary);
      toast.success('Itinerary updated!');
    } catch (err) {
      toast.error('Failed to refine — check your LLM API key.');
      console.error(err);
    } finally {
      setLoading(false);
      setLoadingMsg('');
    }
  };

  const handleSaveTrip = async () => {
    if (!selectedDest || !itinerary || !inputs) return;
    try {
      const res = await fetch('/api/trips', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          inputs,
          selectedDestination: {
            id: selectedDest.destination._id,
            name: selectedDest.destination.name,
            state: selectedDest.destination.state,
            coordinates: selectedDest.destination.coordinates,
            images: selectedDest.destination.images,
          },
          matchScore: selectedDest.totalScore,
          matchReasons: selectedDest.reasons,
          itinerary,
          title: `${inputs.days} days in ${selectedDest.destination.name}`,
        }),
      });
      const json = await res.json();
      if (!res.ok) {
        if (res.status === 503) {
          toast.error('Trip saving requires MongoDB — add MONGODB_URI to .env.local');
          return;
        }
        throw new Error(json.error);
      }
      setSavedTripId(json.trip.shareToken);
      toast.success('Trip saved! 🎉');
    } catch (err) {
      toast.error('Failed to save trip.');
      console.error(err);
    }
  };

  const steps = [
    { id: 'intake', label: 'Trip Details', icon: MapPin },
    { id: 'recommendations', label: 'Pick a Destination', icon: Map },
    { id: 'itinerary', label: 'Your Itinerary', icon: Sparkles },
  ];

  const sourceLabel: Record<string, string> = {
    local: 'Curated catalog',
    db: 'Catalog + AI cache',
    'ai+db': '✨ AI-curated',
    'ai-ephemeral': '✨ AI-generated',
  };

  return (
    <div className="min-h-screen bg-cream page-enter">
      {/* Header */}
      <div className="bg-hero-gradient pt-24 pb-12">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 text-center">
          <h1 className="font-display text-4xl md:text-5xl font-bold text-white mb-3">
            Plan Your Trip
          </h1>
          <p className="text-white/70">Fill in the details and let AI do the heavy lifting</p>
        </div>

        {/* Step indicator */}
        <div className="max-w-2xl mx-auto px-4 sm:px-6 mt-10">
          <div className="flex items-center justify-center gap-2">
            {steps.map((s, i) => {
              const isActive = s.id === step;
              const isDone = steps.findIndex((x) => x.id === step) > i;
              return (
                <div key={s.id} className="flex items-center">
                  <div
                    className={`flex items-center gap-2 px-4 py-2 rounded-full text-sm font-medium transition-all ${
                      isActive
                        ? 'bg-white text-brand shadow-md'
                        : isDone
                        ? 'bg-white/20 text-white'
                        : 'bg-white/10 text-white/40'
                    }`}
                  >
                    <s.icon className="w-4 h-4" />
                    <span className="hidden sm:inline">{s.label}</span>
                    <span className="sm:hidden">{i + 1}</span>
                  </div>
                  {i < steps.length - 1 && (
                    <div className={`w-8 h-0.5 mx-1 ${isDone ? 'bg-white/40' : 'bg-white/10'}`} />
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="max-w-5xl mx-auto px-4 sm:px-6 py-12">
        {/* Loading overlay */}
        {loading && (
          <div className="fixed inset-0 bg-black/20 backdrop-blur-sm flex items-center justify-center z-50">
            <div className="bg-white rounded-3xl p-8 shadow-card-hover text-center max-w-sm mx-4">
              <div className="w-16 h-16 rounded-full border-4 border-brand border-t-transparent animate-spin mx-auto mb-4" />
              <p className="font-semibold text-brand">{loadingMsg || 'Working on it…'}</p>
              <p className="text-gray-400 text-sm mt-2">This takes a few seconds</p>
            </div>
          </div>
        )}

        {step === 'intake' && (
          <PlannerForm onSubmit={handleFormSubmit} />
        )}

        {step === 'recommendations' && (
          <div className="animate-fade-in">
            <div className="text-center mb-8">
              <h2 className="section-title">Your Top Matches</h2>
              <div className="flex items-center justify-center gap-2 mt-2">
                <p className="text-gray-500">Ranked by season, budget, scenery, and experience fit</p>
                {sourceFlag && (
                  <span className="text-xs px-2.5 py-1 rounded-full bg-brand/10 text-brand font-medium">
                    {sourceLabel[sourceFlag] ?? sourceFlag}
                  </span>
                )}
              </div>
              {relaxedMsg && (
                <div className="mt-4 inline-flex items-center gap-2 px-4 py-2 rounded-2xl bg-amber/10 text-amber text-sm font-medium">
                  <Info className="w-4 h-4 flex-none" />
                  {relaxedMsg}
                </div>
              )}
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {recommendations.map((rec) => (
                <DestinationCard
                  key={rec.destination._id || rec.destination.name}
                  rec={rec}
                  onSelect={() => handleSelectDestination(rec)}
                />
              ))}
            </div>
            <div className="text-center mt-8">
              <button
                onClick={() => setStep('intake')}
                className="text-brand hover:text-brand-light underline underline-offset-4 text-sm font-medium"
              >
                ← Change trip details
              </button>
            </div>
          </div>
        )}

        {/* Itinerary generation failed — accurate, honest error + retry */}
        {step === 'itinerary' && selectedDest && llmError && (
          <div className="animate-fade-in max-w-lg mx-auto">
            <div className="card p-8 text-center">
              <div className="w-16 h-16 rounded-full bg-amber-500/10 flex items-center justify-center mx-auto mb-4 border border-amber-500/20">
                <AlertTriangle className="w-8 h-8 text-amber-500" />
              </div>
              <h2 className="font-display font-bold text-2xl text-white mb-2">
                {llmErrorKind === 'unavailable' || llmErrorKind === 'timeout'
                  ? 'AI is busy right now'
                  : llmErrorKind === 'quota'
                  ? 'Rate limit reached'
                  : 'Couldn’t generate the itinerary'}
              </h2>
              <p className="text-zinc-400 mb-6 leading-relaxed">
                We couldn’t finish the plan for <strong>{selectedDest.destination.name}</strong>.
                <br />
                {llmErrorMsg || 'Please try again.'}
              </p>
              <div className="flex flex-col gap-3">
                {/* Retry — most failures (overload/timeout) succeed on a second attempt */}
                <button
                  onClick={() => { setLlmError(false); handleSelectDestination(selectedDest, inputs ?? undefined); }}
                  className="btn-primary w-full justify-center"
                  disabled={loading}
                >
                  ↻ Try again
                </button>
                <button
                  onClick={() => { setStep('recommendations'); setLlmError(false); }}
                  className="btn-terracotta w-full"
                >
                  ← Back to Destinations
                </button>
              </div>
            </div>
          </div>
        )}

        {step === 'itinerary' && selectedDest && itinerary && !llmError && (
          <ItineraryView
            destination={selectedDest.destination}
            itinerary={itinerary}
            inputs={inputs!}
            matchScore={selectedDest.totalScore}
            matchReasons={selectedDest.reasons}
            onRefine={handleRefine}
            onSave={handleSaveTrip}
            savedTripId={savedTripId}
            onBack={() => setStep('recommendations')}
            loading={loading}
          />
        )}
      </div>
    </div>
  );
}
