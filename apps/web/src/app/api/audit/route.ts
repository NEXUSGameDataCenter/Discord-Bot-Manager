import { prisma } from '@nexus/db';
import { route } from '@/lib/server/route';

export const dynamic = 'force-dynamic';

export const GET = route(async (req) => {
  const q = new URL(req.url).searchParams.get('q')?.trim().slice(0, 100);
  const logs = await prisma.auditLog.findMany({
    where: q ? { OR: [{ action: { contains: q, mode: 'insensitive' } }, { actor: { contains: q } }, { result: { contains: q } }] } : {},
    orderBy: { createdAt: 'desc' },
    take: 200,
  });
  return { logs };
});
