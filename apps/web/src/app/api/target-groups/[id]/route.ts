import { prisma } from '@nexus/db';
import { route } from '@/lib/server/route';
import { audit } from '@/lib/server/audit';

export const DELETE = route(async (_req, { params, actor }) => {
  const g = await prisma.targetGroup.delete({ where: { id: params.id! } });
  await audit(actor, 'targetGroup.delete', { groupId: g.id, name: g.name }, 'success');
  return { ok: true };
});
