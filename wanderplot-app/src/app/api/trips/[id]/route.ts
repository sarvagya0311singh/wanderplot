import { NextRequest, NextResponse } from 'next/server';
import { isDbConfigured } from '@/config/env.config';

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    if (!isDbConfigured()) {
      return NextResponse.json({ error: 'Database not configured' }, { status: 503 });
    }

    const { connectDB } = await import('@/lib/db');
    const { Trip } = await import('@/models/Trip');
    await connectDB();

    const { id } = await params;

    // Try by shareToken first (for public share links), then by _id
    let trip = await Trip.findOne({ shareToken: id }).lean();
    if (!trip) {
      try { trip = await Trip.findById(id).lean(); } catch { /* invalid id format */ }
    }

    if (!trip) return NextResponse.json({ error: 'Trip not found' }, { status: 404 });

    return NextResponse.json({ trip });
  } catch (err) {
    console.error('Trip GET error:', err);
    return NextResponse.json({ error: 'Failed to fetch trip' }, { status: 500 });
  }
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    if (!isDbConfigured()) {
      return NextResponse.json({ error: 'Database not configured' }, { status: 503 });
    }

    const { connectDB } = await import('@/lib/db');
    const { Trip } = await import('@/models/Trip');
    await connectDB();

    const { id } = await params;
    await Trip.findByIdAndDelete(id);
    return NextResponse.json({ success: true });
  } catch (err) {
    console.error('Trip DELETE error:', err);
    return NextResponse.json({ error: 'Failed to delete trip' }, { status: 500 });
  }
}
