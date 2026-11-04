import { prisma } from '@nexus/db';
import { route } from '@/lib/server/route';
import { enrichAudit } from '@/lib/server/auditView';

export const dynamic = 'force-dynamic';

export const GET = route(async (req) => {
  const q = new URL(req.url).searchParams.get('q')?.trim().slice(0, 100);
  // Searching a display name also finds that member's rows (actor is stored as email).
  const byName = q ? await prisma.teamMember.findMany({ where: { name: { contains: q, mode: 'insensitive' } }, select: { email: true } }) : [];
  const logs = await prisma.auditLog.findMany({
    where: q
      ? { OR: [{ action: { contains: q, mode: 'insensitive' } }, { actor: { contains: q, mode: 'insensitive' } }, { actor: { in: byName.map((m) => m.email) } }, { result: { contains: q } }] }
      : {},
    orderBy: { createdAt: 'desc' },
    take: 200,
  });
  return { logs: await enrichAudit(logs) };
});
