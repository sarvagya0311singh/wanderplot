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
  budget: number;
  month: number;
  days: number;
  groupType: string;
  pace: string;
  scenery: string[];
  experience: string[];
  dealbreakers: string[];
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type ScoredDestination = any;

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

  const handleFormSubmit = async (data: TripInputsState) => {
    setInputs(data);
    setLoading(true);
    setLoadingMsg('Scoring destinations…');
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
      setRecommendations(json.results);
      setStep('recommendations');
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Unknown error';
      toast.error(`Recommendation failed: ${msg}`, { duration: 6000 });
      console.error('Recommend error:', err);
    } finally {
      setLoading(false);
      setLoadingMsg('');
    }
  };

  const handleSelectDestination = async (dest: ScoredDestination) => {
    setSelectedDest(dest);
    setLlmError(false);
    setLoading(true);
    setLoadingMsg('Writing your itinerary with AI…');
    try {
      const res = await fetch('/api/itinerary/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          destination: dest.destination,
          inputs,
        }),
      });
      const json = await res.json();
      if (!res.ok) {
        if (res.status === 503) {
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
    setLoadingMsg('Updating your plan…');
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
              <p className="text-gray-500 mt-2">Ranked by season, budget, scenery, and experience fit</p>
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

        {/* LLM not configured — friendly setup prompt */}
        {step === 'itinerary' && selectedDest && llmError && (
          <div className="animate-fade-in max-w-lg mx-auto">
            <div className="card p-8 text-center">
              <div className="w-16 h-16 rounded-full bg-amber/10 flex items-center justify-center mx-auto mb-4">
                <AlertTriangle className="w-8 h-8 text-amber" />
              </div>
              <h2 className="font-display font-bold text-2xl text-gray-900 mb-2">
                LLM API Key Missing
              </h2>
              <p className="text-gray-500 mb-6 leading-relaxed">
                You selected <strong>{selectedDest.destination.name}</strong> — now we need an AI model to write
                the itinerary. Add a key to <code className="bg-gray-100 px-1.5 py-0.5 rounded text-sm">.env.local</code> to continue.
              </p>

              <div className="text-left bg-gray-50 rounded-2xl p-5 mb-6 space-y-3 text-sm">
                <div className="flex items-start gap-2">
                  <Info className="w-4 h-4 text-brand mt-0.5 flex-none" />
                  <div>
                    <p className="font-semibold text-gray-800">Using Gemini (recommended — free tier)</p>
                    <p className="text-gray-500 mt-0.5">Get key at <a href="https://aistudio.google.com/app/apikey" target="_blank" className="text-brand underline">aistudio.google.com</a></p>
                    <code className="block bg-white border border-gray-200 rounded p-2 mt-1.5 text-xs text-gray-700 break-all">
                      ACTIVE_LLM=gemini<br />
                      GEMINI_API_KEY=your_key_here<br />
                      GEMINI_MODEL=gemini-1.5-pro
                    </code>
                  </div>
                </div>
                <div className="flex items-start gap-2">
                  <Info className="w-4 h-4 text-brand mt-0.5 flex-none" />
                  <div>
                    <p className="font-semibold text-gray-800">Using OpenAI GPT-4o</p>
                    <p className="text-gray-500 mt-0.5">Get key at <a href="https://platform.openai.com/api-keys" target="_blank" className="text-brand underline">platform.openai.com</a></p>
                    <code className="block bg-white border border-gray-200 rounded p-2 mt-1.5 text-xs text-gray-700 break-all">
                      ACTIVE_LLM=openai<br />
                      OPENAI_API_KEY=your_key_here
                    </code>
                  </div>
                </div>
              </div>

              <p className="text-xs text-gray-400 mb-4">After adding the key, restart the dev server and try again.</p>
              <button
                onClick={() => setStep('recommendations')}
                className="btn-secondary"
              >
                ← Pick another destination
              </button>
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
