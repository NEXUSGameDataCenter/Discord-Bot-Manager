import { prisma } from '@nexus/db';
import { memberPatchSchema } from '@nexus/shared';
import { routeAs, body, HttpError, notFound } from '@/lib/server/route';
import { audit } from '@/lib/server/audit';

async function target(id: string, selfId: string) {
  const m = (await prisma.teamMember.findUnique({ where: { id } })) ?? notFound('ไม่พบสมาชิก');
  if (m.id === selfId) throw new HttpError(400, 'แก้ไขสิทธิ์ของตัวเองไม่ได้');
  if (m.role === 'OWNER') throw new HttpError(400, 'แก้ไขหรือลบ Owner ไม่ได้');
  return m;
}

export const PATCH = routeAs('OWNER', async (req, { params, member, actor }) => {
  const input = memberPatchSchema.parse(await body(req));
  const m = await target(params.id!, member.id);
  const status = input.status === 'DISABLED' ? 'DISABLED' : input.status === 'ENABLED' ? (m.lastLogin ? 'ACTIVE' : 'INVITED') : undefined;
  await prisma.teamMember.update({ where: { id: m.id }, data: { role: input.role, status } });
  await audit(actor, 'team.update', { email: m.email }, 'success', input);
  return { ok: true };
});

export const DELETE = routeAs('OWNER', async (_req, { params, member, actor }) => {
  const m = await target(params.id!, member.id);
  await prisma.$transaction([prisma.magicToken.deleteMany({ where: { email: m.email } }), prisma.teamMember.delete({ where: { id: m.id } })]);
  await audit(actor, 'team.remove', { email: m.email }, 'success');
  return { ok: true };
});
