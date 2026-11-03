import { prisma } from '@nexus/db';
import { routeAs, HttpError, notFound } from '@/lib/server/route';
import { audit } from '@/lib/server/audit';
import { sendInvite } from '@/lib/server/invite';

/** Re-send (or get a fresh copy of) the invite link for someone who has not joined yet. */
export const POST = routeAs('OWNER', async (_req, { params, member, actor }) => {
  const m = (await prisma.teamMember.findUnique({ where: { id: params.id! } })) ?? notFound('ไม่พบสมาชิก');
  if (m.status !== 'INVITED') throw new HttpError(400, 'สมาชิกนี้เข้าร่วมแล้ว ให้เขาเข้าสู่ระบบด้วยอีเมลได้เลย');
  const result = await sendInvite(m.email, member.name ?? member.email);
  await audit(actor, 'team.resendInvite', { email: m.email }, result.emailed ? 'success' : 'partial');
  return result;
});
