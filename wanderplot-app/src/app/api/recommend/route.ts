import { NextRequest, NextResponse } from 'next/server';
import { scoreDestinations, TripInputs } from '@/lib/recommend';
import { isDbConfigured } from '@/config/env.config';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json() as TripInputs;

    if (!body.month || !body.budget || !body.days) {
      return NextResponse.json(
        { error: 'Missing required fields: month, budget, days' },
        { status: 400 }
      );
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let allDestinations: any[] = [];

    if (isDbConfigured()) {
      // Prefer MongoDB data when available
      try {
        const { connectDB } = await import('@/lib/db');
        const { Destination } = await import('@/models/Destination');
        await connectDB();
        allDestinations = await Destination.find({}).lean();
      } catch (dbErr) {
        console.warn('MongoDB unavailable, falling back to local destination data:', dbErr);
        const { destinations } = await import('@/data/destinations');
        allDestinations = destinations;
      }
    } else {
      // No MongoDB configured — use bundled local data (works out of the box)
      const { destinations } = await import('@/data/destinations');
      allDestinations = destinations;
    }

    if (allDestinations.length === 0) {
      return NextResponse.json(
        { error: 'No destination data available. Try seeding: GET /api/seed' },
        { status: 503 }
      );
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const scored = scoreDestinations(allDestinations as any, body);

    return NextResponse.json({
      results: scored.slice(0, 8),
      total: scored.length,
      source: isDbConfigured() ? 'database' : 'local',
    });
  } catch (err) {
    console.error('Recommend error:', err);
    return NextResponse.json(
      { error: 'Failed to get recommendations', detail: err instanceof Error ? err.message : String(err) },
      { status: 500 }
    );
  }
}
