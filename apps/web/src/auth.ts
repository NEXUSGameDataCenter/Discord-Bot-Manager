import NextAuth from 'next-auth';
import Credentials from 'next-auth/providers/credentials';
import { authConfig } from './auth.config';
import { consumeToken } from '@/lib/server/magic';

/** Sign-in = a single-use email link (login or invite). There is no password and no OAuth provider. */
export const { handlers, auth, signIn, signOut } = NextAuth({
  ...authConfig,
  providers: [
    Credentials({
      id: 'magic-link',
      name: 'Email link',
      credentials: { token: { type: 'text' } },
      async authorize(credentials) {
        const token = typeof credentials?.token === 'string' ? credentials.token : '';
        const member = await consumeToken(token);
        return member ? { id: member.id, email: member.email, name: member.name } : null;
      },
    }),
  ],
});
