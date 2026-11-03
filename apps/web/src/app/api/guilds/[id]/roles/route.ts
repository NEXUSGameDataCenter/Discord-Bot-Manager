import { prisma } from '@nexus/db';
import { routeAs } from '@/lib/server/route';

export const dynamic = 'force-dynamic';

export const GET = routeAs('EDITOR', async (_req, { params }) => ({
  roles: await prisma.role.findMany({
    where: { guildRefId: params.id!, NOT: { name: '@everyone' } },
    orderBy: { position: 'desc' },
    select: { roleId: true, name: true, color: true, managed: true, assignable: true },
  }),
}));
