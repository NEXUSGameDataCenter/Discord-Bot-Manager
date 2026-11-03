import 'server-only';
import { baseUrl } from './env';
import { createToken } from './magic';

/** Creates a single-use invite link (7 days). The Owner shares it directly, e.g. in a Discord DM. No email is sent. */
export async function createInviteLink(email: string): Promise<{ inviteUrl: string }> {
  return { inviteUrl: `${baseUrl()}/auth/verify?token=${await createToken(email, 'INVITE')}` };
}
