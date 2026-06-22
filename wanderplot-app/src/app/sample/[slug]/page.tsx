import { notFound } from 'next/navigation';
import { sampleItineraries, sampleList } from '@/data/sampleItineraries';
import TripItineraryLayout from '@/components/TripItineraryLayout';
import type { Metadata } from 'next';

interface Props {
  params: Promise<{ slug: string }>;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const sample = sampleItineraries[slug];
  if (!sample) return { title: 'Sample Not Found' };
  return {
    title: `${sample.title} — WanderPlot`,
    description: sample.itinerary.summary,
  };
}

export async function generateStaticParams() {
  return sampleList.map((sample) => ({
    slug: sample.slug,
  }));
}

export default async function SampleTripPage({ params }: Props) {
  const { slug } = await params;
  const sample = sampleItineraries[slug];

  if (!sample) notFound();

  return <TripItineraryLayout trip={sample as any} />;
}
