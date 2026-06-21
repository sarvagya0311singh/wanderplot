'use client';
import { useState, useRef, useEffect } from 'react';
import {
  MapPin, Share2, Download, Bookmark, ArrowLeft, Sparkles,
  Sun, Cloud, Moon, Home, ChevronDown, ChevronUp,
  IndianRupee, Luggage, Send, Loader2, Copy, CheckCheck,
  Mic, MicOff
} from 'lucide-react';
import type { TripInputsState } from '@/app/plan/page';
import toast from 'react-hot-toast';
import dynamic from 'next/dynamic';
import { motion, AnimatePresence } from 'framer-motion';

const MapView = dynamic(() => import('./MapView').then(m => m.MapView), {
  ssr: false,
  loading: () => <div className="h-64 bg-sand rounded-2xl flex items-center justify-center text-brand/40 text-sm font-medium">Loading map...</div>,
});

// ─── Types ──────────────────────────────────────────────────────────────────

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

// ─── Component ──────────────────────────────────────────────────────────────

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
  
  // Voice UI State
  const [isListening, setIsListening] = useState(false);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const recognitionRef = useRef<any>(null);

  const printRef = useRef<HTMLDivElement>(null);

  const shareUrl = savedTripId
    ? `${typeof window !== 'undefined' ? window.location.origin : ''}/trips/${savedTripId}`
    : null;

  // ─── Voice Recognition Setup ──────────────────────────────────────────────
  useEffect(() => {
    if (typeof window !== 'undefined') {
      // @ts-expect-error Web Speech API vendor prefixes
      const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
      if (SpeechRecognition) {
        recognitionRef.current = new SpeechRecognition();
        recognitionRef.current.continuous = false;
        recognitionRef.current.interimResults = true;

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        recognitionRef.current.onresult = (event: any) => {
          let transcript = '';
          for (let i = event.resultIndex; i < event.results.length; ++i) {
            transcript += event.results[i][0].transcript;
          }
          setRefineText(transcript);
        };

        recognitionRef.current.onerror = () => setIsListening(false);
        recognitionRef.current.onend = () => setIsListening(false);
      }
    }
  }, []);

  const toggleListening = () => {
    if (!recognitionRef.current) {
      toast.error('Voice recognition not supported in your browser.');
      return;
    }
    if (isListening) {
      recognitionRef.current.stop();
      setIsListening(false);
    } else {
      setRefineText('');
      recognitionRef.current.start();
      setIsListening(true);
    }
  };

  // ─── Handlers ─────────────────────────────────────────────────────────────
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

  const handlePrint = () => window.print();

  const handleRefineSubmit = () => {
    if (refineText.trim()) {
      onRefine(refineText);
      setRefineText('');
      if (isListening) {
        recognitionRef.current?.stop();
        setIsListening(false);
      }
    }
  };

  const quickRefines = [
    'Make it cheaper',
    'Add more rest time',
    'Include street food',
  ];

  const MONTHS = ['', 'January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December'];

  const totalBudget = Object.values(itinerary.budgetBreakdown || {}).reduce(
    (sum: number, val) => sum + (val as number), 0
  );

  return (
    <motion.div 
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -20 }}
      className="max-w-7xl mx-auto" 
      ref={printRef}
    >
      {/* Back button */}
      <button onClick={onBack} className="flex items-center gap-2 text-brand/60 hover:text-brand text-sm font-medium mb-8 group transition-colors">
        <ArrowLeft className="w-4 h-4 group-hover:-translate-x-1 transition-transform" />
        Back to destinations
      </button>

      {/* ─── Hero Header ──────────────────────────────────────────────────── */}
      <div className="relative rounded-[2rem] overflow-hidden mb-12 shadow-soft bg-brand-dark">
        <div className="absolute inset-0 bg-hero-gradient opacity-90" />
        <div className="absolute top-0 right-0 w-96 h-96 bg-terracotta/20 rounded-full blur-[100px] pointer-events-none" />
        
        <div className="relative p-10 md:p-14 text-white">
          <div className="flex flex-col md:flex-row gap-8 justify-between items-start">
            <div className="max-w-2xl">
              <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-white/10 border border-white/20 text-xs font-medium text-white mb-6">
                <MapPin className="w-3 h-3 text-terracotta" />
                {destination.state}, India
              </div>
              
              <h1 className="font-display font-medium text-4xl md:text-6xl leading-tight mb-4 tracking-tight">
                {inputs.days} Days in {destination.name}
              </h1>
              
              <div className="flex flex-wrap items-center gap-x-6 gap-y-3 text-white/80 font-light text-sm md:text-base">
                <span className="flex items-center gap-2"><div className="w-1.5 h-1.5 rounded-full bg-terracotta" /> {MONTHS[inputs.month]}</span>
                <span className="flex items-center gap-2"><div className="w-1.5 h-1.5 rounded-full bg-terracotta" /> {inputs.groupType}</span>
                <span className="flex items-center gap-2"><div className="w-1.5 h-1.5 rounded-full bg-terracotta" /> {inputs.pace} pace</span>
                <span className="flex items-center gap-2"><div className="w-1.5 h-1.5 rounded-full bg-terracotta" /> ₹{inputs.budget.toLocaleString('en-IN')}</span>
              </div>
            </div>
            
            {/* Match Score Badge */}
            <div className="flex-none flex flex-col items-center justify-center p-6 rounded-2xl glass-panel border-white/20">
              <span className="font-display font-medium text-5xl text-white">{matchScore}</span>
              <span className="text-xs font-medium uppercase tracking-wider text-white/60 mt-1">Match</span>
            </div>
          </div>

          {itinerary.summary && (
            <p className="mt-8 text-white/90 text-lg leading-relaxed font-light italic border-l-2 border-terracotta pl-4">
              &ldquo;{itinerary.summary}&rdquo;
            </p>
          )}

          <div className="flex flex-wrap gap-3 mt-10">
            <button onClick={onSave} disabled={!!savedTripId} className="btn-terracotta !py-2.5 !px-6 text-sm">
              <Bookmark className="w-4 h-4" />
              {savedTripId ? 'Saved ✓' : 'Save Trip'}
            </button>
            <button onClick={handleCopyLink} className="btn-primary !bg-white/10 hover:!bg-white/20 !border !border-white/20 !py-2.5 !px-6 text-sm">
              {copied ? <CheckCheck className="w-4 h-4" /> : <Share2 className="w-4 h-4" />}
              {copied ? 'Copied' : 'Share'}
            </button>
            <button onClick={handlePrint} className="btn-primary !bg-white/10 hover:!bg-white/20 !border !border-white/20 !py-2.5 !px-6 text-sm">
              <Download className="w-4 h-4" /> Export
            </button>
          </div>
        </div>
      </div>

      {/* ─── Main Content Layout ─────────────────────────────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-10 relative">
        
        {/* Left Col: Timeline (8 cols) */}
        <div className="lg:col-span-7 xl:col-span-8 relative">
          <h3 className="font-display text-3xl font-medium text-brand mb-8">The Itinerary</h3>
          
          <div className="relative pl-6 md:pl-8 border-l border-brand/10 space-y-12 pb-10">
            {itinerary.days?.map((day: ItineraryDay, i: number) => (
              <motion.div 
                key={day.day}
                initial={{ opacity: 0, x: -20 }}
                whileInView={{ opacity: 1, x: 0 }}
                viewport={{ once: true, margin: "-100px" }}
                transition={{ duration: 0.5, delay: i * 0.1 }}
                className="relative"
              >
                {/* Timeline Node */}
                <div className="absolute -left-[45px] md:-left-[53px] top-1 flex flex-col items-center">
                  <div className={`w-10 h-10 rounded-full flex items-center justify-center font-display font-bold text-lg shadow-soft border-4 border-cream ${expandedDay === day.day ? 'bg-terracotta text-white' : 'bg-sand text-brand'}`}>
                    {day.day}
                  </div>
                </div>

                <div className="card border-none hover:shadow-float">
                  <button
                    className="w-full text-left p-6 flex flex-col sm:flex-row sm:items-center justify-between gap-4"
                    onClick={() => setExpandedDay(expandedDay === day.day ? 0 : day.day)}
                  >
                    <div>
                      <h4 className="font-semibold text-lg text-brand">{day.title}</h4>
                      <div className="text-sm text-brand/60 mt-1 flex items-center gap-2">
                        <Home className="w-3.5 h-3.5" />
                        {day.accommodation}
                      </div>
                    </div>
                    <div className="flex items-center gap-4 text-brand">
                      <span className="font-medium bg-sand px-3 py-1 rounded-full text-sm">
                        ₹{day.estimatedCost?.toLocaleString('en-IN')}
                      </span>
                      <div className={`w-8 h-8 rounded-full bg-sand flex items-center justify-center transition-transform duration-300 ${expandedDay === day.day ? 'rotate-180' : ''}`}>
                        <ChevronDown className="w-4 h-4 text-brand" />
                      </div>
                    </div>
                  </button>

                  <AnimatePresence>
                    {expandedDay === day.day && (
                      <motion.div
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: 'auto', opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        transition={{ duration: 0.3 }}
                        className="overflow-hidden"
                      >
                        <div className="p-6 pt-0 border-t border-sand mx-6">
                          <div className="space-y-8 mt-6">
                            {[
                              { icon: Sun, label: 'Morning', content: day.morning, color: 'text-terracotta', bg: 'bg-terracotta/10' },
                              { icon: Cloud, label: 'Afternoon', content: day.afternoon, color: 'text-ocean', bg: 'bg-ocean/10' },
                              { icon: Moon, label: 'Evening', content: day.evening, color: 'text-brand', bg: 'bg-brand/10' },
                            ].map(({ icon: Icon, label, content, color, bg }) => (
                              <div key={label} className="flex gap-4">
                                <div className={`flex-none w-10 h-10 rounded-xl ${bg} ${color} flex items-center justify-center`}>
                                  <Icon className="w-5 h-5" />
                                </div>
                                <div className="pt-1">
                                  <p className={`text-xs font-bold uppercase tracking-wider mb-2 ${color}`}>{label}</p>
                                  <p className="text-brand/80 leading-relaxed font-light">{content}</p>
                                </div>
                              </div>
                            ))}

                            {day.tips && (
                              <div className="bg-sand rounded-2xl p-5 border border-brand/5">
                                <div className="flex items-start gap-3">
                                  <span className="text-xl">💡</span>
                                  <p className="text-sm text-brand/80 leading-relaxed font-light">{day.tips}</p>
                                </div>
                              </div>
                            )}

                            {(day.locations?.length ?? 0) > 0 && (
                              <div className="flex flex-wrap gap-2 pt-2">
                                {day.locations?.map((loc: string) => (
                                  <span key={loc} className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-full bg-brand/5 text-brand/70 font-medium border border-brand/10">
                                    <MapPin className="w-3 h-3" />
                                    {loc}
                                  </span>
                                ))}
                              </div>
                            )}
                          </div>
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>
              </motion.div>
            ))}
          </div>
        </div>

        {/* Right Col: Sticky Sidebar (4 cols) */}
        <div className="lg:col-span-5 xl:col-span-4 relative">
          <div className="sticky top-6 space-y-6">
            
            {/* AI Assistant Chat UI */}
            <div className="card p-6 shadow-float border-ocean/10">
              <h4 className="font-semibold text-brand mb-4 flex items-center gap-2">
                <Sparkles className="w-4 h-4 text-terracotta" />
                Refine with AI
              </h4>
              
              {/* iMessage style bubbles for suggestions */}
              <div className="space-y-2 mb-4">
                <div className="bg-sand/50 text-brand/70 text-xs py-2 px-3 rounded-2xl rounded-tl-sm w-fit max-w-[85%] font-medium">
                  Want to change something? Try saying...
                </div>
                {quickRefines.map((q) => (
                  <button
                    key={q}
                    onClick={() => onRefine(q)}
                    disabled={loading}
                    className="block bg-ocean text-white text-sm py-2 px-4 rounded-2xl rounded-tr-sm w-fit max-w-[85%] ml-auto text-left hover:bg-ocean-light transition-colors disabled:opacity-50"
                  >
                    "{q}"
                  </button>
                ))}
              </div>

              <div className="relative">
                <div className={`flex items-end gap-2 p-2 rounded-2xl border ${isListening ? 'border-terracotta bg-terracotta/5' : 'border-brand/10 bg-sand'} transition-colors`}>
                  <button
                    onClick={toggleListening}
                    disabled={loading}
                    className={`p-2.5 rounded-xl flex-none transition-colors ${isListening ? 'bg-terracotta text-white animate-pulse' : 'bg-white text-brand/50 hover:text-terracotta shadow-sm'}`}
                    title="Voice input"
                  >
                    {isListening ? <Mic className="w-4 h-4" /> : <MicOff className="w-4 h-4" />}
                  </button>
                  <textarea
                    value={refineText}
                    onChange={(e) => setRefineText(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && !e.shiftKey) {
                        e.preventDefault();
                        handleRefineSubmit();
                      }
                    }}
                    placeholder={isListening ? 'Listening...' : 'Type or speak...'}
                    className="w-full bg-transparent border-none text-sm text-brand placeholder-brand/40 resize-none outline-none py-2"
                    rows={1}
                    disabled={loading}
                  />
                  <button
                    onClick={handleRefineSubmit}
                    disabled={loading || !refineText.trim()}
                    className="p-2.5 rounded-xl bg-brand text-white flex-none disabled:opacity-50 hover:bg-brand-light transition-colors shadow-sm"
                  >
                    {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                  </button>
                </div>
              </div>
            </div>

            {/* Map */}
            <div className="card p-2 border-brand/5">
              {destination.coordinates && (
                <div className="rounded-xl overflow-hidden">
                  <MapView
                    coordinates={destination.coordinates}
                    name={destination.name}
                    days={itinerary.days}
                  />
                </div>
              )}
            </div>

            {/* Budget */}
            <div className="card p-6 border-brand/5">
              <h4 className="font-semibold text-brand mb-5 flex items-center gap-2">
                <IndianRupee className="w-4 h-4 text-ocean" />
                Est. Budget
              </h4>
              <div className="space-y-4">
                {Object.entries(itinerary.budgetBreakdown || {}).map(([key, val]) => {
                  const percentage = Math.round(((val as number) / totalBudget) * 100);
                  const colors: Record<string, string> = {
                    transport: 'bg-[#5B869C]', // ocean-light
                    accommodation: 'bg-[#2C5A53]', // brand-light
                    food: 'bg-[#D98A76]', // terracotta-light
                    activities: 'bg-[#8BA88E]', // sage
                    misc: 'bg-[#C4C4C4]',
                  };
                  return (
                    <div key={key}>
                      <div className="flex justify-between text-xs mb-2">
                        <span className="capitalize text-brand/60 font-medium">{key}</span>
                        <span className="font-medium text-brand">₹{(val as number).toLocaleString('en-IN')}</span>
                      </div>
                      <div className="h-1.5 rounded-full bg-sand overflow-hidden">
                        <motion.div
                          initial={{ width: 0 }}
                          whileInView={{ width: `${percentage}%` }}
                          viewport={{ once: true }}
                          transition={{ duration: 1, ease: "easeOut" }}
                          className={`h-full rounded-full ${colors[key] || 'bg-brand'}`}
                        />
                      </div>
                    </div>
                  );
                })}
                <div className="pt-4 border-t border-sand flex justify-between font-semibold mt-6">
                  <span className="text-brand">Total est.</span>
                  <span className="text-terracotta">₹{totalBudget.toLocaleString('en-IN')}</span>
                </div>
              </div>
            </div>

            {/* Packing List */}
            {itinerary.packingList?.length > 0 && (
              <div className="card p-6 border-brand/5">
                <button
                  className="flex items-center justify-between w-full"
                  onClick={() => setShowPackingList(!showPackingList)}
                >
                  <h4 className="font-semibold text-brand flex items-center gap-2">
                    <Luggage className="w-4 h-4 text-sage" />
                    Packing Essentials
                  </h4>
                  <ChevronDown className={`w-4 h-4 text-brand/40 transition-transform ${showPackingList ? 'rotate-180' : ''}`} />
                </button>
                <AnimatePresence>
                  {showPackingList && (
                    <motion.div 
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: 'auto', opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }}
                      className="overflow-hidden"
                    >
                      <div className="mt-4 grid grid-cols-2 gap-2">
                        {itinerary.packingList.map((item: string) => (
                          <div key={item} className="flex items-center gap-2 text-xs text-brand/70 font-medium">
                            <div className="w-3 h-3 rounded bg-sand border border-brand/10 flex-none" />
                            {item}
                          </div>
                        ))}
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            )}

          </div>
        </div>
      </div>
    </motion.div>
  );
}
