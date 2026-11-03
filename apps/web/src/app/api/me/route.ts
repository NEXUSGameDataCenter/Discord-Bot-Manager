import { prisma } from '@nexus/db';
import { meSchema } from '@nexus/shared';
import { routeAs, body, HttpError } from '@/lib/server/route';
import { audit } from '@/lib/server/audit';

export const dynamic = 'force-dynamic';

export const GET = routeAs('EDITOR', async (_req, { member }) => ({
  me: { id: member.id, email: member.email, name: member.name, avatarAssetId: member.avatarAssetId, role: member.role, lastLogin: member.lastLogin },
}));

/** Everyone edits only their own display name and avatar. Email and role are not editable here. */
export const PUT = routeAs('EDITOR', async (req, { member, actor }) => {
  const input = meSchema.parse(await body(req));
  if (input.avatarAssetId && !(await prisma.asset.findFirst({ where: { id: input.avatarAssetId, kind: 'image' } }))) throw new HttpError(400, 'ไม่พบรูปที่อัปโหลด');
  await prisma.teamMember.update({ where: { id: member.id }, data: input });
  await audit(actor, 'me.updateProfile', { memberId: member.id }, 'success', { name: input.name, avatar: !!input.avatarAssetId });
  return { ok: true };
});
