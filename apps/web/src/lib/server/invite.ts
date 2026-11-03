import 'server-only';
import { baseUrl } from './env';
import { createToken } from './magic';
import { linkEmail, sendMail } from './email';
import { logger } from './logger';

/**
 * Creates an invite link and tries to email it. The link is also returned to the owner
 * so it can be shared another way (e.g. Discord DM) when email is not configured or fails.
 */
export async function sendInvite(email: string, inviter: string): Promise<{ inviteUrl: string; emailed: boolean; emailError?: string }> {
  const inviteUrl = `${baseUrl()}/auth/verify?token=${await createToken(email, 'INVITE')}`;
  try {
    await sendMail(email, linkEmail('invite', inviteUrl, inviter));
    return { inviteUrl, emailed: true };
  } catch (err) {
    const emailError = err instanceof Error ? err.message : String(err);
    logger.warn({ email, emailError }, 'invite email not sent');
    return { inviteUrl, emailed: false, emailError };
  }
}
