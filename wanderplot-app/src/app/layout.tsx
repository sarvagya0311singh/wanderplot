import type { Metadata } from 'next';
import { Inter, Playfair_Display } from 'next/font/google';
import './globals.css';
import { Navbar } from '@/components/Navbar';
import { Providers } from '@/components/Providers';
import { Toaster } from 'react-hot-toast';

const inter = Inter({
  subsets: ['latin'],
  variable: '--font-inter',
});

const playfair = Playfair_Display({
  subsets: ['latin'],
  variable: '--font-playfair',
  weight: ['400', '600', '700'],
  style: ['normal', 'italic'],
});

export const metadata: Metadata = {
  title: 'WanderPlot — AI Trip Planner for India',
  description:
    'Plan your perfect Indian trip with AI. Get personalized destination recommendations and detailed itineraries based on your budget, travel month, and interests.',
  keywords: 'India travel, trip planner, AI travel, itinerary, budget travel, destinations',
  openGraph: {
    title: 'WanderPlot — AI Trip Planner for India',
    description: 'Plan your perfect Indian trip with AI-powered destination recommendations.',
    type: 'website',
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${inter.variable} ${playfair.variable}`}>
      <body className="min-h-screen bg-cream">
        <Providers>
          <Navbar />
          <main>{children}</main>
          <Toaster
            position="top-right"
            toastOptions={{
              style: {
                borderRadius: '12px',
                background: '#0D4F5C',
                color: '#fff',
              },
            }}
          />
        </Providers>
      </body>
    </html>
  );
}
