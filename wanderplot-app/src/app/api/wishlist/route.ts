import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/auth';
import { isDbConfigured } from '@/config/env.config';

export async function POST(req: NextRequest) {
  try {
    if (!isDbConfigured()) {
      return NextResponse.json(
        { error: 'Wishlist requires MongoDB. Add MONGODB_URI to .env.local' },
        { status: 503 }
      );
    }

    const session = await auth();
    if (!session?.user?.email) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { destinationId, action } = await req.json();

    const { connectDB } = await import('@/lib/db');
    const { User } = await import('@/models/User');
    await connectDB();

    const user = await User.findOne({ email: session.user.email });
    if (!user) return NextResponse.json({ error: 'User not found' }, { status: 404 });

    if (action === 'add') {
      if (!user.wishlist.includes(destinationId)) {
        user.wishlist.push(destinationId);
      }
    } else if (action === 'remove') {
      user.wishlist = user.wishlist.filter((id: string) => id !== destinationId);
    }

    await user.save();
    return NextResponse.json({ wishlist: user.wishlist });
  } catch (err) {
    console.error('Wishlist error:', err);
    return NextResponse.json({ error: 'Failed to update wishlist' }, { status: 500 });
  }
}
