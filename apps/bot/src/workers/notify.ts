import { Worker } from 'bullmq';
import webpush from 'web-push';
import { prisma } from '@nexus/db';
import { QUEUES, hasRole, inQuietHours, resolvePrefs, type NotifyJob } from '@nexus/shared';
import { env } from '../env';
import { logger } from '../logger';
import { connection, publish } from '../redis';

const pushReady = Boolean(env.VAPID_PUBLIC_KEY && env.VAPID_PRIVATE_KEY);
if (pushReady) webpush.setVapidDetails(env.VAPID_SUBJECT, env.VAPID_PUBLIC_KEY!, env.VAPID_PRIVATE_KEY!);

async function sendPush(email: string, payload: { title: string; body?: string; link?: string; tag?: string }) {
  if (!pushReady) return;
  const subs = await prisma.pushSubscription.findMany({ where: { email } });
  await Promise.all(
    subs.map(async (s) => {
      try {
        await webpush.sendNotification({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, JSON.stringify(payload), { TTL: 3600 });
      } catch (err) {
        const code = (err as { statusCode?: number }).statusCode;
        // The browser unsubscribed or the subscription expired.
        if (code === 404 || code === 410) await prisma.pushSubscription.delete({ where: { id: s.id } }).catch(() => undefined);
        else logger.warn({ err, code }, 'web push failed');
      }
    }),
  );
}

async function handle(job: NotifyJob) {
  if (job.dedupeKey) {
    const fresh = await connection.set(`nexus:notify:${job.dedupeKey}`, '1', 'EX', 300, 'NX');
    if (!fresh) return;
  }
  const emails = (job.emails ?? []).map((e) => e.toLowerCase());
  const members = await prisma.teamMember.findMany({
    where: { status: 'ACTIVE', OR: [{ email: { in: emails } }, ...(job.roles?.length ? [{ role: { in: job.roles.flatMap((r) => (['EDITOR', 'ADMIN', 'OWNER'] as const).filter((x) => hasRole(x, r))) } }] : [])] },
    select: { email: true, notifyPrefs: true },
  });
  const payload = { title: job.title, body: job.body, link: job.link, tag: job.dedupeKey };
  if (job.test) {
    await Promise.all(members.map((m) => sendPush(m.email, payload)));
    return;
  }
  const web: string[] = [];
  await Promise.all(
    members.map(async (m) => {
      const p = resolvePrefs(m.notifyPrefs);
      if (p.web[job.kind]) web.push(m.email);
      if (p.push[job.kind] && (!inQuietHours(p) || (job.urgent && p.quiet.urgentAlways))) await sendPush(m.email, payload);
    }),
  );
  if (web.length) {
    await prisma.notification.createMany({ data: web.map((email) => ({ email, kind: job.kind, title: job.title, body: job.body ?? null, link: job.link ?? null })) });
    publish({ type: 'notify', emails: web });
  }
}

export function startNotifyWorker() {
  // Housekeeping: drop in-app notifications older than 30 days, once a day.
  const sweep = () => prisma.notification.deleteMany({ where: { createdAt: { lt: new Date(Date.now() - 30 * 864e5) } } }).catch(() => undefined);
  void sweep();
  setInterval(sweep, 864e5).unref();
  const w = new Worker<NotifyJob>(QUEUES.notify, async (j) => handle(j.data), { connection, concurrency: 4 });
  w.on('failed', (j, err) => logger.warn({ err, kind: j?.data.kind }, 'notify job failed'));
  return w;
}
