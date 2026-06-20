import { NextRequest, NextResponse } from 'next/server';
import { isDbConfigured } from '@/config/env.config';

export async function POST(req: NextRequest) {
  try {
    if (!isDbConfigured()) {
      return NextResponse.json(
        { error: 'Registration requires MongoDB. Add MONGODB_URI to .env.local, or use Google Sign In.' },
        { status: 503 }
      );
    }

    const { name, email, password } = await req.json();

    if (!name || !email || !password) {
      return NextResponse.json({ error: 'Name, email, and password are required' }, { status: 400 });
    }

    if (password.length < 8) {
      return NextResponse.json({ error: 'Password must be at least 8 characters' }, { status: 400 });
    }

    const { connectDB } = await import('@/lib/db');
    const { User } = await import('@/models/User');
    const bcrypt = (await import('bcryptjs')).default;

    await connectDB();

    const existing = await User.findOne({ email: email.toLowerCase() });
    if (existing) {
      return NextResponse.json({ error: 'An account with this email already exists' }, { status: 409 });
    }

    const passwordHash = await bcrypt.hash(password, 12);
    await User.create({ name, email: email.toLowerCase(), password: passwordHash });

    return NextResponse.json({ success: true }, { status: 201 });
  } catch (err) {
    console.error('Register error:', err);
    return NextResponse.json({ error: 'Registration failed' }, { status: 500 });
  }
}
