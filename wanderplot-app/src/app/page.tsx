import Link from 'next/link';
import { MapPin, Sparkles, Map, Star, Users, Zap, Shield, Share2 } from 'lucide-react';
import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'WanderPlot — AI Trip Planner for India',
  description: 'Plan your perfect Indian trip with AI. Personalized destination recommendations and detailed itineraries based on your budget and interests.',
};

const features = [
  {
    icon: Sparkles,
    title: 'AI Itinerary Writer',
    desc: 'Get a hand-crafted day-by-day plan powered by Gemini or GPT-4o, grounded in real places.',
    color: 'from-purple-500 to-pink-500',
  },
  {
    icon: Map,
    title: 'Smart Recommendations',
    desc: 'Our scoring engine matches season, budget, scenery, and experience — and tells you why.',
    color: 'from-teal-500 to-cyan-400',
  },
  {
    icon: Zap,
    title: 'Instant Refinement',
    desc: '"Make it cheaper", "add a rest day" — refine any itinerary with a single message.',
    color: 'from-amber-400 to-orange-500',
  },
  {
    icon: Shield,
    title: 'No Hallucinations',
    desc: 'Every suggestion is grounded in our curated destination database — no invented restaurants.',
    color: 'from-green-500 to-emerald-400',
  },
  {
    icon: Share2,
    title: 'Shareable Links',
    desc: 'Share your trip plan with a single link — no account needed to view.',
    color: 'from-blue-500 to-indigo-500',
  },
  {
    icon: Users,
    title: 'Group-Aware',
    desc: 'Solo, couple, family with kids, or friends group — plans adapt to your travel style.',
    color: 'from-rose-500 to-red-400',
  },
];

const destinations = [
  { name: 'Ladakh', tag: 'Adventure', emoji: '🏔️', desc: 'High passes & azure lakes' },
  { name: 'Goa', tag: 'Beaches', emoji: '🏖️', desc: 'Sun, sand & Portuguese heritage' },
  { name: 'Varanasi', tag: 'Spiritual', emoji: '🪔', desc: 'Ghats, aarti & ancient rituals' },
  { name: 'Coorg', tag: 'Relaxation', emoji: '☕', desc: 'Coffee estates & misty forests' },
  { name: 'Jaisalmer', tag: 'Desert', emoji: '🐪', desc: 'Golden fort & dune camping' },
  { name: 'Alleppey', tag: 'Backwaters', emoji: '🛶', desc: 'Houseboat bliss in Kerala' },
];

export default function HomePage() {
  return (
    <div className="page-enter">
      {/* ─── Hero ──────────────────────────────────────────── */}
      <section className="relative min-h-screen bg-hero-gradient overflow-hidden flex items-center">
        {/* Background decoration */}
        <div className="absolute inset-0 overflow-hidden pointer-events-none">
          <div className="absolute -top-40 -right-40 w-96 h-96 bg-white/5 rounded-full blur-3xl" />
          <div className="absolute bottom-0 -left-20 w-80 h-80 bg-amber/10 rounded-full blur-3xl" />
          <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] bg-white/3 rounded-full blur-3xl" />
          {/* Floating dots */}
          {[...Array(12)].map((_, i) => (
            <div
              key={i}
              className="absolute w-2 h-2 bg-white/20 rounded-full animate-float"
              style={{
                left: `${10 + i * 8}%`,
                top: `${15 + (i % 4) * 20}%`,
                animationDelay: `${i * 0.5}s`,
                animationDuration: `${4 + (i % 3)}s`,
              }}
            />
          ))}
        </div>

        <div className="relative max-w-7xl mx-auto px-4 sm:px-6 pt-24 pb-16">
          <div className="max-w-3xl mx-auto text-center">
            {/* Badge */}
            <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-white/10 border border-white/20 text-white/90 text-sm font-medium mb-8">
              <Star className="w-4 h-4 text-amber fill-amber" />
              AI-powered trip planning for India
            </div>

            {/* Headline */}
            <h1 className="font-display text-5xl sm:text-6xl md:text-7xl font-bold text-white leading-tight mb-6">
              Your perfect trip,{' '}
              <span className="italic text-amber">plotted</span> in minutes
            </h1>

            <p className="text-lg sm:text-xl text-white/75 leading-relaxed mb-10 max-w-2xl mx-auto">
              Tell us your budget, travel month, and what you love — our AI recommends 
              the best Indian destinations and writes a day-by-day itinerary just for you.
            </p>

            {/* CTAs */}
            <div className="flex flex-col sm:flex-row gap-4 justify-center">
              <Link href="/plan" id="hero-start-planning" className="btn-amber text-base px-8 py-4 shadow-glow-amber">
                <Sparkles className="w-5 h-5" />
                Start Planning Free
              </Link>
              <Link href="/trips/demo" className="btn-secondary border-white text-white hover:bg-white hover:text-brand text-base px-8 py-4">
                See a Sample Trip
              </Link>
            </div>

            {/* Social proof */}
            <div className="mt-14 flex flex-col sm:flex-row items-center justify-center gap-8 text-white/60 text-sm">
              <div className="flex items-center gap-2">
                <div className="flex -space-x-2">
                  {['🧑', '👩', '🧔', '👱'].map((e, i) => (
                    <div key={i} className="w-8 h-8 rounded-full bg-white/20 flex items-center justify-center text-sm border-2 border-white/10">
                      {e}
                    </div>
                  ))}
                </div>
                <span>10,000+ trips planned</span>
              </div>
              <div className="flex items-center gap-1">
                {[...Array(5)].map((_, i) => (
                  <Star key={i} className="w-4 h-4 text-amber fill-amber" />
                ))}
                <span className="ml-1">4.9 / 5 from travellers</span>
              </div>
              <div className="flex items-center gap-2">
                <MapPin className="w-4 h-4 text-amber" />
                <span>30+ curated destinations</span>
              </div>
            </div>
          </div>
        </div>

        {/* Wave */}
        <div className="absolute bottom-0 left-0 right-0">
          <svg viewBox="0 0 1440 80" className="w-full text-cream fill-current" preserveAspectRatio="none">
            <path d="M0,40 C360,80 1080,0 1440,40 L1440,80 L0,80 Z" />
          </svg>
        </div>
      </section>

      {/* ─── Destinations preview ──────────────────────── */}
      <section className="py-20 bg-cream">
        <div className="max-w-7xl mx-auto px-4 sm:px-6">
          <div className="text-center mb-12">
            <p className="text-amber font-semibold tracking-wide uppercase text-sm mb-3">Where will you go?</p>
            <h2 className="section-title">Discover India&apos;s finest</h2>
            <p className="text-gray-500 mt-3 max-w-xl mx-auto">
              From snow-capped Himalayan passes to tropical beaches — 30 handpicked destinations with honest, AI-grounded recommendations.
            </p>
          </div>

          <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
            {destinations.map((dest, i) => (
              <Link
                key={dest.name}
                href="/plan"
                className="card group cursor-pointer relative overflow-hidden aspect-[4/3]"
                style={{ animationDelay: `${i * 0.1}s` }}
              >
                {/* Gradient bg representing scenery */}
                <div
                  className="absolute inset-0 transition-transform duration-500 group-hover:scale-110"
                  style={{
                    background: [
                      'linear-gradient(135deg, #1a3a5c, #2d6a8e)',
                      'linear-gradient(135deg, #1a5c3a, #2d8e6a)',
                      'linear-gradient(135deg, #5c3a1a, #8e6a2d)',
                      'linear-gradient(135deg, #2e1a5c, #6a2d8e)',
                      'linear-gradient(135deg, #5c1a2e, #8e2d6a)',
                      'linear-gradient(135deg, #1a5c5c, #2d8e8e)',
                    ][i],
                  }}
                />
                <div className="absolute inset-0 bg-card-gradient" />
                <div className="absolute top-4 right-4 text-3xl">{dest.emoji}</div>
                <div className="absolute bottom-0 left-0 p-5 text-white">
                  <span className="text-xs font-semibold uppercase tracking-wider text-amber/90 bg-amber/20 px-2 py-0.5 rounded-full">
                    {dest.tag}
                  </span>
                  <h3 className="font-display font-bold text-xl mt-2">{dest.name}</h3>
                  <p className="text-white/70 text-sm">{dest.desc}</p>
                </div>
              </Link>
            ))}
          </div>

          <div className="text-center mt-10">
            <Link href="/plan" className="btn-primary">
              <MapPin className="w-4 h-4" />
              Explore All Destinations
            </Link>
          </div>
        </div>
      </section>

      {/* ─── Features ──────────────────────────────────── */}
      <section className="py-20 bg-white">
        <div className="max-w-7xl mx-auto px-4 sm:px-6">
          <div className="text-center mb-14">
            <p className="text-amber font-semibold tracking-wide uppercase text-sm mb-3">Why WanderPlot</p>
            <h2 className="section-title">Planning that actually makes sense</h2>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
            {features.map((f) => (
              <div
                key={f.title}
                className="group p-6 rounded-3xl border border-gray-100 hover:border-brand/20 bg-white hover:bg-cream/50 transition-all duration-300 hover:shadow-card"
              >
                <div className={`w-12 h-12 rounded-2xl bg-gradient-to-br ${f.color} flex items-center justify-center mb-4 shadow-md group-hover:scale-110 transition-transform`}>
                  <f.icon className="w-6 h-6 text-white" />
                </div>
                <h3 className="font-semibold text-lg text-gray-900 mb-2">{f.title}</h3>
                <p className="text-gray-500 text-sm leading-relaxed">{f.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ─── How it works ──────────────────────────────── */}
      <section className="py-20 bg-cream">
        <div className="max-w-5xl mx-auto px-4 sm:px-6">
          <div className="text-center mb-14">
            <h2 className="section-title">Plan a trip in 3 steps</h2>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
            {[
              { step: '01', title: 'Tell us your trip', desc: 'Origin, budget, travel month, group type, and what you love. Or just type it in plain English.' },
              { step: '02', title: 'Pick a destination', desc: 'Get ranked recommendations with match scores and honest "why" explanations for each place.' },
              { step: '03', title: 'Get your itinerary', desc: 'AI writes a detailed day-by-day plan. Refine it with one message, export PDF, or share the link.' },
            ].map((item) => (
              <div key={item.step} className="text-center">
                <div className="w-16 h-16 rounded-full bg-brand/10 border-2 border-brand/20 flex items-center justify-center mx-auto mb-4">
                  <span className="font-display font-bold text-brand text-lg">{item.step}</span>
                </div>
                <h3 className="font-semibold text-xl text-gray-900 mb-3">{item.title}</h3>
                <p className="text-gray-500 leading-relaxed">{item.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ─── CTA Banner ────────────────────────────────── */}
      <section className="py-20 bg-brand">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 text-center">
          <h2 className="font-display text-4xl md:text-5xl font-bold text-white mb-6">
            Your next adventure is{' '}
            <span className="italic text-amber">one click away</span>
          </h2>
          <p className="text-white/70 text-lg mb-8 max-w-xl mx-auto">
            No account needed to start. Just tell us where you&apos;re coming from and we&apos;ll handle the rest.
          </p>
          <Link href="/plan" className="btn-amber text-lg px-10 py-4 shadow-glow-amber">
            <Sparkles className="w-5 h-5" />
            Plan My Trip Now
          </Link>
        </div>
      </section>

      {/* ─── Footer ────────────────────────────────────── */}
      <footer className="bg-brand-dark py-10">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 flex flex-col md:flex-row items-center justify-between gap-4 text-white/40 text-sm">
          <div className="flex items-center gap-2">
            <MapPin className="w-4 h-4 text-amber" />
            <span className="font-display font-semibold text-white/70">WanderPlot</span>
            <span>— AI Trip Planner for India</span>
          </div>
          <p>Estimates are planning figures, not guaranteed prices. Always verify before booking.</p>
        </div>
      </footer>
    </div>
  );
}
