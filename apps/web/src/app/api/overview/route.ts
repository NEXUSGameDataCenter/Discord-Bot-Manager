import { prisma } from '@nexus/db';
import { routeAs } from '@/lib/server/route';
import { enrichAudit } from '@/lib/server/auditView';

export const dynamic = 'force-dynamic';

export const GET = routeAs('EDITOR', async () => {
  const since7 = new Date(Date.now() - 7 * 864e5);
  const since30 = new Date(Date.now() - 30 * 864e5);
  const [bots, guilds, sent30, failed7, sentRows, recent] = await Promise.all([
    prisma.bot.findMany({ select: { id: true, username: true, avatarUrl: true, status: true, pingMs: true, _count: { select: { guilds: { where: { present: true } } } } } }),
    prisma.guild.count({ where: { present: true } }),
    prisma.delivery.count({ where: { status: 'SENT', sentAt: { gte: since30 } } }),
    prisma.delivery.count({ where: { status: 'FAILED', updatedAt: { gte: since7 } } }),
    prisma.delivery.findMany({ where: { status: 'SENT', sentAt: { gte: since7 } }, select: { sentAt: true } }),
    prisma.auditLog.findMany({ orderBy: { createdAt: 'desc' }, take: 8 }),
  ]);
  // Bucket by Asia/Bangkok calendar day.
  const fmt = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Bangkok' });
  const days = Array.from({ length: 7 }, (_, i) => fmt.format(new Date(Date.now() - (6 - i) * 864e5)));
  const counts = Object.fromEntries(days.map((d) => [d, 0]));
  for (const r of sentRows) if (r.sentAt) counts[fmt.format(r.sentAt)] = (counts[fmt.format(r.sentAt)] ?? 0) + 1;
  return {
    bots: bots.map((b) => ({ id: b.id, username: b.username, avatarUrl: b.avatarUrl, status: b.status, pingMs: b.pingMs, guilds: b._count.guilds })),
    guilds,
    sent30,
    failed7,
    activity: days.map((d) => ({ day: d, count: counts[d] ?? 0 })),
    recent: await enrichAudit(recent),
  };
});
