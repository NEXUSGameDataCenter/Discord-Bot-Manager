import { prisma } from '@nexus/db';
import { route } from '@/lib/server/route';

export const dynamic = 'force-dynamic';

export const GET = route(async (_req, { params }) => ({
  cases: await prisma.modCase.findMany({ where: { guildRefId: params.id! }, orderBy: { caseNo: 'desc' }, take: 100 }),
}));
