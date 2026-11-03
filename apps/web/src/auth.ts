import NextAuth from 'next-auth';
import Credentials from 'next-auth/providers/credentials';
import { prisma } from '@nexus/db';
import { emailSchema } from '@nexus/shared';
import { authConfig } from './auth.config';
import { consumeToken } from '@/lib/server/magic';
import { verifyPassword } from '@/lib/server/password';
import { allow, clientIp } from '@/lib/server/ratelimit';

/**
 * Sign-in: email + password for members the Owner approved.
 * `magic-link` is only for owner recovery links. Invite links set a password first, then use `password`.
 */
export const { handlers, auth, signIn, signOut } = NextAuth({
  ...authConfig,
  providers: [
    Credentials({
      id: 'password',
      name: 'Email and password',
      credentials: { email: { type: 'email' }, password: { type: 'password' } },
      async authorize(c) {
        const email = emailSchema.safeParse(c?.email);
        const password = typeof c?.password === 'string' ? c.password : '';
        if (!email.success || !password || password.length > 128) return null;
        // 10 attempts / 15 min per email and 30 per IP
        if (!(await allow(`pw:${email.data}`, 10, 900)) || !(await allow(`pwip:${await clientIp()}`, 30, 900))) return null;
        const m = await prisma.teamMember.findUnique({ where: { email: email.data } });
        const ok = await verifyPassword(password, m?.passwordHash);
        if (!m || !ok || m.status !== 'ACTIVE') return null;
        await prisma.teamMember.update({ where: { id: m.id }, data: { lastLogin: new Date() } });
        return { id: m.id, email: m.email, name: m.name };
      },
    }),
    Credentials({
      id: 'magic-link',
      name: 'Owner recovery link',
      credentials: { token: { type: 'text' } },
      async authorize(c) {
        const member = await consumeToken(typeof c?.token === 'string' ? c.token : '');
        return member ? { id: member.id, email: member.email, name: member.name } : null;
      },
    }),
  ],
});
