'use client';
import Link from 'next/link';
import Image from 'next/image';
import { useRouter } from 'next/navigation';
import { sampleItineraries } from '@/data/sampleItineraries';
import { MapPin, Sparkles, Map, Star, Users, Zap, Shield, Share2, Compass, ArrowRight } from 'lucide-react';
import { motion, useScroll, useTransform } from 'framer-motion';
import { useRef } from 'react';

const features = [
  {
    icon: Sparkles,
    title: 'AI Itinerary Writer',
    desc: 'Get a hand-crafted day-by-day plan powered by Gemini, grounded in real places.',
    color: 'text-terracotta',
    bg: 'bg-terracotta/10',
  },
  {
    icon: Map,
    title: 'Smart Recommendations',
    desc: 'Our scoring engine matches season, budget, scenery, and experience — and tells you why.',
    color: 'text-ocean',
    bg: 'bg-ocean/10',
  },
  {
    icon: Zap,
    title: 'Instant Refinement',
    desc: '"Make it cheaper", "add a rest day" — refine any itinerary with voice or text.',
    color: 'text-brand',
    bg: 'bg-brand/10',
  },
  {
    icon: Shield,
    title: 'No Hallucinations',
    desc: 'Every suggestion is grounded in our curated destination database — no invented restaurants.',
    color: 'text-sage',
    bg: 'bg-sage/20',
  },
  {
    icon: Share2,
    title: 'Shareable Links',
    desc: 'Share your trip plan with a single link — no account needed to view.',
    color: 'text-terracotta',
    bg: 'bg-terracotta/10',
  },
  {
    icon: Users,
    title: 'Group-Aware',
    desc: 'Solo, couple, family with kids, or friends group — plans adapt to your travel style.',
    color: 'text-ocean',
    bg: 'bg-ocean/10',
  },
];

const destinations = [
  { name: 'Ladakh', slug: 'ladakh', tag: 'Adventure', image: '/destinations/ladakh.jpg', desc: 'High passes & azure lakes' },
  { name: 'Kerala', slug: 'kerala', tag: 'Backwaters', image: '/destinations/kerala.jpg', desc: 'Houseboat bliss & lush greens' },
  { name: 'Varanasi', slug: 'varanasi', tag: 'Spiritual', image: '/destinations/varanasi.jpg', desc: 'Ghats, aarti & ancient rituals' },
  { name: 'Andaman', slug: 'andaman', tag: 'Beaches', image: '/destinations/andaman.jpg', desc: 'White sands & coral reefs' },
];

export default function HomePage() {
  const targetRef = useRef(null);
  const router = useRouter();

  const viewRandomSample = () => {
    const slugs = Object.keys(sampleItineraries);
    const slug = slugs[Math.floor(Math.random() * slugs.length)];
    router.push(`/sample/${slug}`);
  };
  const { scrollYProgress } = useScroll({
    target: targetRef,
    offset: ["start start", "end start"]
  });

  const y = useTransform(scrollYProgress, [0, 1], ["0%", "50%"]);
  const opacity = useTransform(scrollYProgress, [0, 0.8], [1, 0]);

  return (
    <div className="bg-[#09090b] min-h-screen selection:bg-brand/30">
      {/* ─── Hero Section with Parallax Starry Mountain ─── */}
      <section ref={targetRef} className="relative min-h-[95vh] flex items-center justify-center overflow-hidden pt-20">
        <motion.div 
          style={{ y, opacity }}
          className="absolute inset-0 z-0"
        >
          {/* Stunning Starry Mountain Background */}
          <div 
            className="absolute inset-0 bg-cover bg-center bg-no-repeat opacity-60"
            style={{ backgroundImage: 'url("https://images.unsplash.com/photo-1519681393784-d120267933ba?auto=format&fit=crop&q=80&w=2000")' }}
          />
          {/* Dark gradient overlay to ensure text pops perfectly */}
          <div className="absolute inset-0 bg-gradient-to-b from-[#09090b]/40 via-[#09090b]/60 to-[#09090b]" />
        </motion.div>

        <div className="relative z-10 max-w-7xl mx-auto px-4 sm:px-6 w-full text-center mt-12">
          <motion.div
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 1, ease: "easeOut" }}
            className="max-w-4xl mx-auto"
          >
            <div className="inline-flex items-center gap-2 px-5 py-2 rounded-full glass-panel text-white/90 text-sm font-medium mb-8 border border-white/10 shadow-[0_0_20px_rgba(255,255,255,0.05)]">
              <Compass className="w-4 h-4 text-brand" />
              Next-generation travel planning
            </div>

            <h1 className="font-display text-5xl sm:text-6xl md:text-8xl font-medium text-white leading-[1.1] mb-6 tracking-tight drop-shadow-2xl">
              Plot your escape.<br />
              <span className="italic text-brand font-serif">Effortlessly.</span>
            </h1>

            <p className="text-lg sm:text-xl text-zinc-300 leading-relaxed mb-10 max-w-2xl mx-auto font-light drop-shadow-md">
              Tell us your vibe, budget, and travel month. Our AI builds a grounded, stunningly detailed Indian itinerary in seconds.
            </p>

            <div className="flex flex-col sm:flex-row gap-4 justify-center items-center">
              <Link href="/plan" className="btn-primary text-lg px-8 py-4 w-full sm:w-auto font-semibold group">
                <Sparkles className="w-5 h-5 transition-transform group-hover:rotate-12" />
                Start Your Journey
              </Link>
              <button onClick={viewRandomSample} className="btn-terracotta text-lg px-8 py-4 w-full sm:w-auto font-semibold">
                View sample trip <ArrowRight className="w-4 h-4 inline" />
              </button>
            </div>
          </motion.div>
        </div>
      </section>

      {/* ─── Destinations Grid ──────────────────────── */}
      <section id="destinations" className="py-24 relative z-20 bg-[#09090b]">
        <div className="max-w-7xl mx-auto px-4 sm:px-6">
          <motion.div 
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, margin: "-100px" }}
            className="flex flex-col md:flex-row justify-between items-end mb-16 gap-6"
          >
            <div className="max-w-2xl">
              <p className="text-brand font-semibold tracking-wider uppercase text-sm mb-4 flex items-center gap-2">
                <Star className="w-4 h-4" /> Curated Locales
              </p>
              <h2 className="section-title">Discover the extraordinary</h2>
            </div>
            <Link href="/plan" className="flex items-center gap-2 text-ocean hover:text-white transition-colors font-medium group">
              Explore all destinations <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
            </Link>
          </motion.div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
            {destinations.map((dest, i) => (
              <Link key={dest.name} href={`/sample/${dest.slug}`} className="block">
                <motion.div
                  initial={{ opacity: 0, y: 30 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true, margin: "-50px" }}
                  transition={{ duration: 0.6, delay: i * 0.1 }}
                  className="group relative h-[400px] rounded-3xl overflow-hidden cursor-pointer border border-white/10"
                >
                  <Image 
                    src={dest.image} 
                    alt={dest.name}
                    fill
                    className="object-cover transition-transform duration-700 group-hover:scale-105"
                    sizes="(max-width: 768px) 100vw, (max-width: 1200px) 50vw, 25vw"
                  />
                  <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/40 to-transparent" />
                  
                  <div className="absolute bottom-0 left-0 right-0 p-6">
                    <span className="inline-block px-3 py-1 bg-black/40 backdrop-blur-md rounded-full text-xs font-medium text-brand mb-3 border border-white/10">
                      {dest.tag}
                    </span>
                    <h3 className="font-display font-medium text-2xl text-white mb-1">{dest.name}</h3>
                    <p className="text-zinc-400 text-sm font-light">{dest.desc}</p>
                  </div>
                </motion.div>
              </Link>
            ))}
          </div>
        </div>
      </section>

      {/* ─── Features Layout ──────────────────────────────────── */}
      <section id="how-it-works" className="py-24 bg-[#09090b] relative">
        {/* Subtle background glow */}
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] bg-brand/5 rounded-full blur-[120px] pointer-events-none" />
        
        <div className="max-w-7xl mx-auto px-4 sm:px-6 relative z-10">
          <motion.div 
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            className="text-center mb-20"
          >
            <p className="text-brand font-semibold tracking-wider uppercase text-sm mb-4">Intelligent Engine</p>
            <h2 className="section-title">Crafted with precision</h2>
          </motion.div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
            {features.map((f, i) => (
              <motion.div
                key={f.title}
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ duration: 0.5, delay: i * 0.1 }}
                className="card p-8 group hover:-translate-y-1"
              >
                <div className="w-14 h-14 rounded-2xl bg-white/5 border border-white/10 flex items-center justify-center mb-6 group-hover:scale-110 transition-transform">
                  <f.icon className="w-6 h-6 text-brand" />
                </div>
                <h3 className="font-semibold text-xl text-white mb-3">{f.title}</h3>
                <p className="text-zinc-400 leading-relaxed font-light">{f.desc}</p>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* ─── Call to Action ────────────────────────────────── */}
      <section className="relative py-32 overflow-hidden border-t border-white/5">
        <div className="absolute inset-0 bg-[#09090b]" />
        {/* Glowing orb behind text */}
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[800px] h-[400px] bg-brand/10 rounded-[100%] blur-[100px] pointer-events-none" />
        
        <motion.div 
          initial={{ opacity: 0, scale: 0.95 }}
          whileInView={{ opacity: 1, scale: 1 }}
          viewport={{ once: true }}
          transition={{ duration: 0.8 }}
          className="relative z-10 max-w-4xl mx-auto px-4 sm:px-6 text-center"
        >
          <h2 className="font-display text-5xl md:text-7xl font-medium text-white mb-8">
            Ready to wander?
          </h2>
          <p className="text-zinc-300 text-xl mb-12 max-w-2xl mx-auto font-light">
            Skip the spreadsheets. Let AI design an unforgettable, realistic journey tailored perfectly to you.
          </p>
          <Link href="/plan" className="btn-primary text-lg px-12 py-5 font-semibold">
            Begin Your Story
          </Link>
        </motion.div>
      </section>

      {/* ─── Footer ────────────────────────────────────── */}
      <footer className="bg-[#09090b] py-12 border-t border-white/10">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 flex flex-col md:flex-row items-center justify-between gap-6 text-zinc-500 text-sm">
          <div className="flex items-center gap-2">
            <Compass className="w-5 h-5 text-brand" />
            <span className="font-display text-lg text-white">WanderPlot</span>
          </div>
          <div className="flex flex-col md:flex-row items-center gap-4 text-center md:text-left">
            <p className="font-light">AI-crafted journeys for the modern explorer.</p>
            <p className="font-light text-xs text-zinc-600">Geographic data &copy; <a href="https://www.geonames.org/" target="_blank" rel="noopener noreferrer" className="hover:text-zinc-400 underline">GeoNames</a> (CC-BY 4.0)</p>
          </div>
        </div>
      </footer>
    </div>
  );
}

