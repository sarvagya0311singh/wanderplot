import { NextRequest, NextResponse } from 'next/server';
import { isDbConfigured } from '@/config/env.config';

// DEV ONLY — seeds the destination collection
export async function GET(req: NextRequest) {
  if (process.env.NODE_ENV === 'production') {
    return NextResponse.json({ error: 'Not available in production' }, { status: 403 });
  }

  if (!isDbConfigured()) {
    return NextResponse.json(
      {
        error: 'MongoDB not configured. Add MONGODB_URI to .env.local first.',
        tip: 'The recommend API already works without a database using local data.'
      },
      { status: 503 }
    );
  }

  try {
    const { connectDB } = await import('@/lib/db');
    const { Destination } = await import('@/models/Destination');
    const { destinations } = await import('@/data/destinations');

    await connectDB();
    await Destination.deleteMany({});
    const inserted = await Destination.insertMany(destinations);
    return NextResponse.json({
      message: `Seeded ${inserted.length} destinations into MongoDB`,
      destinations: inserted.map((d) => d.name),
    });
  } catch (err) {
    console.error('Seed error:', err);
    return NextResponse.json({ error: 'Seed failed', detail: String(err) }, { status: 500 });
  }
}
