import { z } from 'zod';
import { prisma } from '@nexus/db';
import { routeAs, body } from '@/lib/server/route';

export const dynamic = 'force-dynamic';

export const GET = routeAs('EDITOR', async (_req, { member }) => {
  const [items, unread] = await Promise.all([
    prisma.notification.findMany({ where: { email: member.email }, orderBy: { createdAt: 'desc' }, take: 50 }),
    prisma.notification.count({ where: { email: member.email, readAt: null } }),
  ]);
  return { items, unread };
});

const readSchema = z.object({ ids: z.array(z.string()).max(100).optional(), all: z.boolean().optional() });

/** Mark some (ids) or all notifications as read. */
export const POST = routeAs('EDITOR', async (req, { member }) => {
  const { ids, all } = readSchema.parse(await body(req));
  await prisma.notification.updateMany({ where: { email: member.email, readAt: null, ...(all ? {} : { id: { in: ids ?? [] } }) }, data: { readAt: new Date() } });
  return { ok: true };
});
