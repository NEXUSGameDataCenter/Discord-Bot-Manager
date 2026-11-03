import type { NextAuthConfig } from 'next-auth';

/**
 * Edge-safe part of the Auth.js config (used by middleware): no providers, no database.
 * The full config with the email-link provider lives in auth.ts.
 */
export const authConfig = {
  providers: [],
  session: { strategy: 'jwt', maxAge: 60 * 60 * 12 },
  pages: { signIn: '/login', error: '/login' },
  trustHost: true,
  callbacks: {
    jwt({ token, user }) {
      if (user?.id) token.uid = user.id;
      return token;
    },
    session({ session, token }) {
      session.user.id = typeof token.uid === 'string' ? token.uid : '';
      return session;
    },
    authorized({ auth: session, request }) {
      // Membership/role/disabled are checked against the DB in the layout and every API route.
      const ok = !!session?.user?.id;
      if (!ok && request.nextUrl.pathname.startsWith('/api/')) return Response.json({ error: 'Unauthorized' }, { status: 401 });
      return ok;
    },
  },
} satisfies NextAuthConfig;
