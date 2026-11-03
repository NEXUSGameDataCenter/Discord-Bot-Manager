import { prisma } from '@nexus/db';
import { inviteSchema } from '@nexus/shared';
import { routeAs, body, HttpError } from '@/lib/server/route';
import { audit } from '@/lib/server/audit';
import { createInviteLink } from '@/lib/server/invite';

export const dynamic = 'force-dynamic';

export const GET = routeAs('EDITOR', async () => ({
  members: await prisma.teamMember.findMany({
    orderBy: [{ role: 'asc' }, { createdAt: 'asc' }],
    select: { id: true, email: true, name: true, avatarAssetId: true, role: true, status: true, lastLogin: true, createdAt: true, invitedBy: true, requestNote: true },
  }),
}));

/** Owner creates an invite link to share directly (e.g. Discord DM). No email is sent. */
export const POST = routeAs('OWNER', async (req, { actor }) => {
  const { email, role } = inviteSchema.parse(await body(req));
  const existing = await prisma.teamMember.findUnique({ where: { email } });
  if (existing?.status === 'PENDING') throw new HttpError(400, 'อีเมลนี้ส่งคำขอเข้าร่วมไว้แล้ว — กดอนุมัติในรายการคำขอได้เลย');
  if (existing && existing.status !== 'INVITED') throw new HttpError(400, 'อีเมลนี้อยู่ในทีมแล้ว');
  await prisma.teamMember.upsert({ where: { email }, create: { email, role, invitedBy: actor }, update: { role, invitedBy: actor } });
  const result = await createInviteLink(email);
  await audit(actor, 'team.invite', { email, role }, 'success');
  return result;
});
