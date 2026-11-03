import NextAuth from 'next-auth';
import Discord from 'next-auth/providers/discord';

/** Edge-safe: no DB/Node imports here because middleware imports this file. */
function adminIds(): Set<string> {
  return new Set((process.env.ADMIN_DISCORD_IDS ?? '').split(',').map((s) => s.trim()).filter(Boolean));
}

export const { handlers, auth, signIn, signOut } = NextAuth({
  providers: [Discord({ authorization: { params: { scope: 'identify' } } })],
  session: { strategy: 'jwt', maxAge: 60 * 60 * 12 },
  pages: { signIn: '/login', error: '/login' },
  callbacks: {
    // Only allow-listed Discord user IDs can sign in.
    signIn({ profile }) {
      return !!profile?.id && adminIds().has(String(profile.id));
    },
    jwt({ token, profile }) {
      if (profile?.id) token.discordId = String(profile.id);
      return token;
    },
    session({ session, token }) {
      session.user.discordId = typeof token.discordId === 'string' ? token.discordId : undefined;
      return session;
    },
    authorized({ auth: session, request }) {
      const id = session?.user?.discordId;
      const ok = !!id && adminIds().has(id); // re-check: removal from the list revokes access
      if (!ok && request.nextUrl.pathname.startsWith('/api/')) return Response.json({ error: 'Unauthorized' }, { status: 401 });
      return ok;
    },
  },
});
