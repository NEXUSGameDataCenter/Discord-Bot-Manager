import { prisma } from '@nexus/db';
import { notFound, routeAs } from '@/lib/server/route';
import { queues, RETRY_OPTS } from '@/lib/server/queue';
import { audit } from '@/lib/server/audit';

/** Retry only FAILED deliveries of the latest run. */
export const POST = routeAs('EDITOR', async (_req, { params, actor }) => {
  const a = (await prisma.announcement.findUnique({ where: { id: params.id! }, select: { id: true } })) ?? notFound('Announcement not found');
  const agg = await prisma.delivery.aggregate({ _max: { run: true }, where: { target: { announcementId: a.id } } });
  const run = agg._max.run;
  if (!run) return { queued: 0 };
  const failed = await prisma.delivery.findMany({ where: { run, status: 'FAILED', target: { announcementId: a.id } }, select: { id: true } });
  if (!failed.length) return { queued: 0 };
  await prisma.delivery.updateMany({ where: { id: { in: failed.map((d) => d.id) } }, data: { status: 'QUEUED', error: null } });
  await prisma.announcement.update({ where: { id: a.id }, data: { status: 'SENDING' } });
  const stamp = Date.now();
  await queues.delivery().addBulk(failed.map((d) => ({ name: 'send', data: { deliveryId: d.id }, opts: { ...RETRY_OPTS, jobId: `del-${d.id}-r${stamp}` } })));
  await audit(actor, 'announcement.retryFailed', { announcementId: a.id, channels: failed.length }, 'queued');
  return { queued: failed.length };
});
