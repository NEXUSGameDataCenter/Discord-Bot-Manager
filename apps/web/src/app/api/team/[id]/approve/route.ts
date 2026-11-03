import { prisma } from '@nexus/db';
import { approveSchema } from '@nexus/shared';
import { routeAs, body, HttpError, notFound } from '@/lib/server/route';
import { audit } from '@/lib/server/audit';

async function pending(id: string) {
  const m = (await prisma.teamMember.findUnique({ where: { id } })) ?? notFound('ไม่พบคำขอ');
  if (m.status !== 'PENDING') throw new HttpError(400, 'คำขอนี้ถูกจัดการไปแล้ว');
  return m;
}

/** Approve a request: the person can sign in right away with the password they chose. */
export const POST = routeAs('OWNER', async (req, { params, actor }) => {
  const { role } = approveSchema.parse(await body(req));
  const m = await pending(params.id!);
  await prisma.teamMember.update({ where: { id: m.id }, data: { status: 'ACTIVE', role, invitedBy: actor } });
  await audit(actor, 'team.approve', { email: m.email, role }, 'success');
  return { ok: true };
});

/** Reject: the request is deleted. */
export const DELETE = routeAs('OWNER', async (_req, { params, actor }) => {
  const m = await pending(params.id!);
  await prisma.teamMember.delete({ where: { id: m.id } });
  await audit(actor, 'team.reject', { email: m.email }, 'success');
  return { ok: true };
});
