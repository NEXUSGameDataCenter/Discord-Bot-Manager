import { prisma } from '@nexus/db';
import { routeAs, HttpError, notFound } from '@/lib/server/route';
import { audit } from '@/lib/server/audit';
import { createInviteLink } from '@/lib/server/invite';

/** Fresh invite link for someone who has not joined yet (the old one keeps working until it expires). */
export const POST = routeAs('OWNER', async (_req, { params, actor }) => {
  const m = (await prisma.teamMember.findUnique({ where: { id: params.id! } })) ?? notFound('ไม่พบสมาชิก');
  if (m.status !== 'INVITED') throw new HttpError(400, 'สมาชิกนี้เข้าร่วมแล้ว หรือเป็นคำขอที่รออนุมัติ');
  const result = await createInviteLink(m.email);
  await audit(actor, 'team.newInviteLink', { email: m.email }, 'success');
  return result;
});
