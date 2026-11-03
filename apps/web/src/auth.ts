import NextAuth from 'next-auth';
import Discord from 'next-auth/providers/discord';

/** Edge-safe: no DB/Node imports here because middleware imports this file. */
function adminIds(): Set<string> {
  return new Set((process.env.ADMIN_DISCORD_IDS ?? '').split(',').map((s) => s.trim()).filter(Boolean));
}

export const { handlers, auth, signIn, signOut } = NextAuth({
  // Full URL on purpose: the Discord provider defines `authorization` as a string, and passing
  // only `{ params }` replaces it with an object that has no URL ("TypeError: Invalid URL" on sign-in).
  // Discord now returns an `iss` parameter on the OAuth callback (RFC 9207); without a matching
  // issuer Auth.js rejects it ("unexpected iss response parameter value").
  providers: [Discord({ issuer: 'https://discord.com', authorization: 'https://discord.com/api/oauth2/authorize?scope=identify' })],
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
