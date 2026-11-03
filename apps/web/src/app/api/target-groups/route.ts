import { prisma } from '@nexus/db';
import { targetGroupSchema } from '@nexus/shared';
import { body, routeAs } from '@/lib/server/route';
import { audit } from '@/lib/server/audit';

export const dynamic = 'force-dynamic';

export const GET = routeAs('EDITOR', async () => ({ groups: await prisma.targetGroup.findMany({ orderBy: { name: 'asc' } }) }));

export const POST = routeAs('EDITOR', async (req, { actor }) => {
  const input = targetGroupSchema.parse(await body(req));
  const group = await prisma.targetGroup.upsert({ where: { name: input.name }, create: input, update: { guildRefIds: input.guildRefIds } });
  await audit(actor, 'targetGroup.save', { groupId: group.id, servers: input.guildRefIds.length }, 'success');
  return { group };
});
