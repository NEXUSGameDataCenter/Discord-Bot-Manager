import { Worker } from 'bullmq';
import { prisma } from '@nexus/db';
import { QUEUES, type DispatchJob } from '@nexus/shared';
import { connection } from '../redis';
import { logger } from '../logger';
import { deliveryQueue, RETRY_OPTS } from '../queues';

/** Turns an announcement into one Delivery row + one job per active target (a new "run" each time). */
export async function dispatch(announcementId: string): Promise<number> {
  const a = await prisma.announcement.findUnique({ where: { id: announcementId }, include: { targets: true, schedule: true } });
  if (!a || a.status === 'DELETED') return 0;
  if (a.schedule && !a.schedule.active) return 0;
  const agg = await prisma.delivery.aggregate({ _max: { run: true }, where: { target: { announcementId } } });
  const run = (agg._max.run ?? 0) + 1;
  const active = a.targets.filter((t) => !t.skip);
  const deliveries = await prisma.$transaction(active.map((t) => prisma.delivery.create({ data: { targetId: t.id, run } })));
  await prisma.announcement.update({ where: { id: a.id }, data: { status: 'SENDING' } });
  if (a.schedule) await prisma.schedule.update({ where: { id: a.schedule.id }, data: { lastRunAt: new Date() } });
  await deliveryQueue.addBulk(deliveries.map((d) => ({ name: 'send', data: { deliveryId: d.id }, opts: { ...RETRY_OPTS, jobId: `del-${d.id}` } })));
  logger.info({ announcementId, run, targets: deliveries.length }, 'dispatched');
  return deliveries.length;
}

export function startDispatchWorker(): Worker<DispatchJob> {
  return new Worker<DispatchJob>(QUEUES.dispatch, async (job) => void (await dispatch(job.data.announcementId)), { connection, concurrency: 1 });
}
