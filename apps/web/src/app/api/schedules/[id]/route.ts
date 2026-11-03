import { z } from 'zod';
import { prisma } from '@nexus/db';
import { body, notFound, routeAs } from '@/lib/server/route';
import { queues, scheduleJobId } from '@/lib/server/queue';
import { audit } from '@/lib/server/audit';

async function unschedule(announcementId: string) {
  const q = queues.dispatch();
  await q.removeJobScheduler(scheduleJobId(announcementId)).catch(() => undefined);
  await q.remove(scheduleJobId(announcementId)).catch(() => undefined);
}

export const PATCH = routeAs('EDITOR', async (req, { params, actor }) => {
  const { active } = z.object({ active: z.boolean() }).parse(await body(req));
  const s = (await prisma.schedule.findUnique({ where: { id: params.id! } })) ?? notFound('Schedule not found');
  await unschedule(s.announcementId);
  if (active) {
    const q = queues.dispatch();
    if (s.cron) await q.upsertJobScheduler(scheduleJobId(s.announcementId), { pattern: s.cron, tz: s.timezone }, { name: 'dispatch', data: { announcementId: s.announcementId } });
    else if (s.runAt && !s.lastRunAt)
      await q.add('dispatch', { announcementId: s.announcementId }, { jobId: scheduleJobId(s.announcementId), delay: Math.max(0, s.runAt.getTime() - Date.now()) });
  }
  await prisma.schedule.update({ where: { id: s.id }, data: { active } });
  await audit(actor, active ? 'schedule.resume' : 'schedule.pause', { scheduleId: s.id, announcementId: s.announcementId }, 'success');
  return { ok: true };
});

export const DELETE = routeAs('EDITOR', async (_req, { params, actor }) => {
  const s = (await prisma.schedule.findUnique({ where: { id: params.id! } })) ?? notFound('Schedule not found');
  await unschedule(s.announcementId);
  await prisma.schedule.delete({ where: { id: s.id } });
  await audit(actor, 'schedule.delete', { scheduleId: s.id, announcementId: s.announcementId }, 'success');
  return { ok: true };
});
