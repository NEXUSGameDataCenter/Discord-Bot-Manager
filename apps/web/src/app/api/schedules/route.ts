import { prisma } from '@nexus/db';
import { routeAs } from '@/lib/server/route';

export const dynamic = 'force-dynamic';

export const GET = routeAs('EDITOR', async () => ({
  schedules: await prisma.schedule.findMany({
    orderBy: { createdAt: 'desc' },
    include: { announcement: { select: { id: true, title: true, status: true, _count: { select: { targets: { where: { skip: false } } } } } } },
  }),
}));
