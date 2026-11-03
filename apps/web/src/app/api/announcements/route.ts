import { prisma } from '@nexus/db';
import { createAnnouncementSchema } from '@nexus/shared';
import { route, body, HttpError } from '@/lib/server/route';
import { queues, scheduleJobId } from '@/lib/server/queue';
import { audit } from '@/lib/server/audit';

export const dynamic = 'force-dynamic';

export const GET = route(async () => {
  const anns = await prisma.announcement.findMany({
    orderBy: { createdAt: 'desc' },
    take: 50,
    include: { schedule: true, targets: { select: { skip: true, deliveries: { select: { status: true, run: true } } } } },
  });
  return {
    announcements: anns.map((a) => {
      const runs = a.targets.flatMap((t) => t.deliveries.map((d) => d.run));
      const run = runs.length ? Math.max(...runs) : 0;
      const latest = a.targets.flatMap((t) => t.deliveries.filter((d) => d.run === run));
      const count = (s: string) => latest.filter((d) => d.status === s).length;
      return {
        id: a.id,
        title: a.title,
        status: a.status,
        isTest: a.isTest,
        createdAt: a.createdAt,
        targets: a.targets.filter((t) => !t.skip).length,
        run,
        sent: count('SENT'),
        failed: count('FAILED'),
        queued: count('QUEUED'),
        schedule: a.schedule ? { cron: a.schedule.cron, runAt: a.schedule.runAt, active: a.schedule.active } : null,
      };
    }),
  };
});

export const POST = route(async (req, { actor }) => {
  const input = createAnnouncementSchema.parse(await body(req));
  const bot = await prisma.bot.findUnique({ where: { id: input.botId }, select: { id: true } });
  if (!bot) throw new HttpError(400, 'Bot not found');

  // Server-side re-check of every target against the live channel cache: never trust the browser's list.
  const hasFiles = input.payload.attachmentIds.length > 0;
  if (hasFiles) {
    const n = await prisma.asset.count({ where: { id: { in: input.payload.attachmentIds } } });
    if (n !== input.payload.attachmentIds.length) throw new HttpError(400, 'ไฟล์แนบบางไฟล์ไม่พบ');
  }
  const active = input.targets.filter((t) => !t.skip);
  const guilds = await prisma.guild.findMany({
    where: { id: { in: [...new Set(input.targets.map((t) => t.guildRefId))] }, botId: bot.id, present: true },
    include: { channels: true },
  });
  const byId = new Map(guilds.map((g) => [g.id, g]));
  for (const t of active) {
    const g = byId.get(t.guildRefId);
    if (!g) throw new HttpError(400, `Server ${t.guildRefId} ไม่อยู่ใน Bot นี้`);
    const ch = g.channels.find((c) => c.channelId === t.channelId);
    if (!ch?.canSend) throw new HttpError(400, `${g.name}: Bot ส่งข้อความในห้องนี้ไม่ได้`);
    if (hasFiles && !ch.canAttach) throw new HttpError(400, `${g.name} #${ch.name}: ขาด Attach Files`);
    if (t.mode === 'WEBHOOK' && !ch.canWebhook) throw new HttpError(400, `${g.name} #${ch.name}: ขาด Manage Webhooks`);
    if (input.allowEveryone && !ch.canMentionEveryone) throw new HttpError(400, `${g.name} #${ch.name}: ขาด Mention Everyone`);
  }

  const status = input.timing.kind === 'now' ? 'SENDING' : 'SCHEDULED';
  const ann = await prisma.announcement.create({
    data: {
      botId: bot.id,
      title: input.isTest ? `[TEST] ${input.title}` : input.title,
      payload: input.payload,
      allowEveryone: input.allowEveryone,
      crosspost: input.crosspost,
      isTest: input.isTest,
      status,
      createdBy: actor,
      targets: { create: input.targets.map((t) => ({ ...t, pingRoleId: t.pingRoleId ?? null, extraText: t.extraText || null })) },
      schedule:
        input.timing.kind === 'at'
          ? { create: { runAt: new Date(input.timing.runAt) } }
          : input.timing.kind === 'cron'
            ? { create: { cron: input.timing.cron } }
            : undefined,
    },
  });

  try {
    const q = queues.dispatch();
    if (input.timing.kind === 'now') await q.add('dispatch', { announcementId: ann.id }, { jobId: `now-${ann.id}` });
    else if (input.timing.kind === 'at')
      await q.add('dispatch', { announcementId: ann.id }, { jobId: scheduleJobId(ann.id), delay: Math.max(0, new Date(input.timing.runAt).getTime() - Date.now()) });
    else await q.upsertJobScheduler(scheduleJobId(ann.id), { pattern: input.timing.cron, tz: 'Asia/Bangkok' }, { name: 'dispatch', data: { announcementId: ann.id } });
  } catch (e) {
    await prisma.announcement.delete({ where: { id: ann.id } });
    throw new HttpError(400, `ตั้งเวลาไม่สำเร็จ: ${e instanceof Error ? e.message : 'invalid schedule'}`);
  }

  const servers = new Set(active.map((t) => t.guildRefId)).size;
  await audit(actor, input.isTest ? 'announcement.test' : 'announcement.create', { announcementId: ann.id, servers, channels: active.length }, 'queued', {
    timing: input.timing,
    allowEveryone: input.allowEveryone,
  });
  return { id: ann.id, servers, channels: active.length };
});
