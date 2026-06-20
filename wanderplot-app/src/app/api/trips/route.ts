import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/auth';
import { isDbConfigured } from '@/config/env.config';

export async function GET(req: NextRequest) {
  try {
    if (!isDbConfigured()) {
      return NextResponse.json(
        { trips: [], message: 'Trip saving requires MongoDB. Add MONGODB_URI to .env.local' }
      );
    }

    const session = await auth();
    if (!session?.user?.email) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { connectDB } = await import('@/lib/db');
    const { Trip } = await import('@/models/Trip');
    const { User } = await import('@/models/User');
    await connectDB();

    const user = await User.findOne({ email: session.user.email });
    if (!user) return NextResponse.json({ error: 'User not found' }, { status: 404 });

    const trips = await Trip.find({ userId: user._id.toString() })
      .sort({ createdAt: -1 })
      .lean();

    return NextResponse.json({ trips });
  } catch (err) {
    console.error('Trips GET error:', err);
    return NextResponse.json({ error: 'Failed to fetch trips' }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    if (!isDbConfigured()) {
      return NextResponse.json(
        { error: 'Trip saving requires MongoDB. Add MONGODB_URI to .env.local' },
        { status: 503 }
      );
    }

    const body = await req.json();
    const session = await auth();

    const { connectDB } = await import('@/lib/db');
    const { Trip } = await import('@/models/Trip');
    const { v4: uuidv4 } = await import('uuid');
    await connectDB();

    let userId: string | undefined;
    if (session?.user?.email) {
      const { User } = await import('@/models/User');
      const user = await User.findOne({ email: session.user.email });
      userId = user?._id.toString();
    }

    const trip = await Trip.create({
      ...body,
      userId,
      shareToken: uuidv4(),
      isPublic: true,
    });

    return NextResponse.json({ trip }, { status: 201 });
  } catch (err) {
    console.error('Trips POST error:', err);
    return NextResponse.json({ error: 'Failed to save trip' }, { status: 500 });
  }
}
