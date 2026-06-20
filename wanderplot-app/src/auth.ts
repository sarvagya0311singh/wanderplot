import NextAuth from 'next-auth';
import Google from 'next-auth/providers/google';
import Credentials from 'next-auth/providers/credentials';
import { env, isGoogleAuthConfigured, isDbConfigured } from '@/config/env.config';

// Providers array — only include Google if credentials are set
const providers = [];

if (isGoogleAuthConfigured()) {
  providers.push(
    Google({
      clientId: env.googleClientId!,
      clientSecret: env.googleClientSecret!,
    })
  );
}

// Always include credentials provider
providers.push(
  Credentials({
    credentials: {
      email: { label: 'Email', type: 'email' },
      password: { label: 'Password', type: 'password' },
    },
    async authorize(credentials) {
      const email = credentials?.email as string;
      const password = credentials?.password as string;
      if (!email || !password) return null;

      // Only attempt DB auth if MongoDB is configured
      if (!isDbConfigured()) return null;

      try {
        const { connectDB } = await import('@/lib/db');
        const { User } = await import('@/models/User');
        const bcrypt = (await import('bcryptjs')).default;

        await connectDB();
        const user = await User.findOne({ email }).select('+password');
        if (!user || !user.password) return null;

        const valid = await bcrypt.compare(password, user.password);
        if (!valid) return null;

        return { id: user._id.toString(), name: user.name, email: user.email, image: user.image };
      } catch (err) {
        console.error('Auth error:', err);
        return null;
      }
    },
  })
);

export const { handlers, auth, signIn, signOut } = NextAuth({
  providers,
  callbacks: {
    async signIn({ user, account }) {
      // Only sync to DB if MongoDB is available
      if (account?.provider === 'google' && isDbConfigured()) {
        try {
          const { connectDB } = await import('@/lib/db');
          const { User } = await import('@/models/User');
          await connectDB();
          const existing = await User.findOne({ email: user.email });
          if (!existing) {
            await User.create({
              name: user.name ?? 'User',
              email: user.email ?? '',
              image: user.image ?? undefined,
              emailVerified: new Date(),
            });
          }
        } catch (err) {
          console.error('SignIn DB sync error:', err);
          // Don't block sign-in if DB is unavailable
        }
      }
      return true;
    },
    async session({ session }) {
      // Enrich session with DB id only if MongoDB is available
      if (session.user?.email && isDbConfigured()) {
        try {
          const { connectDB } = await import('@/lib/db');
          const { User } = await import('@/models/User');
          await connectDB();
          const dbUser = await User.findOne({ email: session.user.email });
          if (dbUser) {
            (session.user as { id?: string }).id = dbUser._id.toString();
          }
        } catch (err) {
          console.error('Session DB error:', err);
          // Don't break session if DB is unavailable
        }
      }
      return session;
    },
  },
  pages: {
    signIn: '/auth/signin',
  },
  // AUTH_SECRET takes precedence (NextAuth v5 default), fallback to NEXTAUTH_SECRET
  secret: env.authSecret,
});
