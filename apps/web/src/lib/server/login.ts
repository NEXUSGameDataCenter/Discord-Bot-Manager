import 'server-only';
import { prisma } from '@nexus/db';
import { emailSchema } from '@nexus/shared';
import { baseUrl, serverEnv } from './env';
import { createToken, recentTokens } from './magic';
import { linkEmail, NoEmailProvider, sendMail } from './email';
import { logger } from './logger';

/**
 * Sends a sign-in link if (and only if) the email belongs to an invited, non-disabled member.
 * The caller always shows the same message, so the form cannot be used to probe who is on the team.
 */
export async function requestLogin(rawEmail: string): Promise<void> {
  const parsed = emailSchema.safeParse(rawEmail);
  if (!parsed.success) return;
  const email = parsed.data;
  const env = serverEnv();
  let member = await prisma.teamMember.findUnique({ where: { email } });
  if (!member && env.OWNER_EMAIL === email) {
    member = await prisma.teamMember.create({ data: { email, role: 'OWNER', status: 'ACTIVE' } });
  }
  if (!member || member.status === 'DISABLED') return;
  if ((await recentTokens(email)) >= 5) return; // throttle: 5 links / 15 min per email
  const url = `${baseUrl()}/auth/verify?token=${await createToken(email, 'LOGIN')}`;
  try {
    await sendMail(email, linkEmail('login', url));
  } catch (err) {
    if (err instanceof NoEmailProvider && member.role === 'OWNER') {
      // Bootstrap only: lets the owner in before email is configured. Visible to Railway project members only.
      logger.warn({ email, url }, 'OWNER sign-in link (email not configured — set RESEND_API_KEY or SMTP_URL to stop this)');
      return;
    }
    logger.error({ email, err: err instanceof Error ? err.message : String(err) }, 'sign-in email failed');
  }
}
