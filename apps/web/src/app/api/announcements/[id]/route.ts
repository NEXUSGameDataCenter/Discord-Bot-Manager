import { prisma } from '@nexus/db';
import { confirmSchema, editAnnouncementSchema } from '@nexus/shared';
import { route, body, HttpError, notFound } from '@/lib/server/route';
import { queues, scheduleJobId } from '@/lib/server/queue';
import { audit } from '@/lib/server/audit';

export const dynamic = 'force-dynamic';

async function load(id: string) {
  return (
    (await prisma.announcement.findUnique({
      where: { id },
      include: {
        schedule: true,
        targets: { include: { guild: { select: { name: true, guildId: true, channels: { select: { channelId: true, name: true } } } }, deliveries: { orderBy: { run: 'desc' } } } },
      },
    })) ?? notFound('Announcement not found')
  );
}

export const GET = route(async (_req, { params }) => {
  const a = await load(params.id!);
  const run = Math.max(0, ...a.targets.flatMap((t) => t.deliveries.map((d) => d.run)));
  return {
    announcement: { id: a.id, title: a.title, status: a.status, createdAt: a.createdAt, payload: a.payload, isTest: a.isTest, crosspost: a.crosspost, allowEveryone: a.allowEveryone, schedule: a.schedule },
    run,
    targets: a.targets.map((t) => {
      const d = t.deliveries.find((x) => x.run === run);
      return {
        id: t.id,
        guildName: t.guild.name,
        channelName: t.guild.channels.find((c) => c.channelId === t.channelId)?.name ?? t.channelId,
        mode: t.mode,
        skip: t.skip,
        status: t.skip ? 'SKIPPED' : (d?.status ?? 'NOT_SENT'),
        error: d?.error ?? null,
        attempts: d?.attempts ?? 0,
        sentAt: d?.sentAt ?? null,
        jumpUrl: d?.messageId ? `https://discord.com/channels/${t.guild.guildId}/${t.channelId}/${d.messageId}` : null,
      };
    }),
    sentTotal: a.targets.reduce((n, t) => n + t.deliveries.filter((d) => d.status === 'SENT').length, 0),
  };
});

/** Edit content everywhere. confirmCount must equal the number of SENT messages. */
export const PATCH = route(async (req, { params, actor }) => {
  const raw = await body(req);
  const { content } = editAnnouncementSchema.parse(raw);
  const { confirmCount } = confirmSchema.parse(raw);
  const a = await load(params.id!);
  const sent = a.targets.reduce((n, t) => n + t.deliveries.filter((d) => d.status === 'SENT').length, 0);
  if (confirmCount !== sent) throw new HttpError(400, 'จำนวนที่ยืนยันไม่ตรงกับจำนวนข้อความที่ส่งแล้ว');
  await queues.manage().add('edit', { announcementId: a.id, action: 'edit', content });
  await audit(actor, 'announcement.editEverywhere', { announcementId: a.id, messages: sent }, 'queued');
  return { queued: sent };
});

/** Delete everywhere + cancel any schedule. */
export const DELETE = route(async (req, { params, actor }) => {
  const { confirmCount } = confirmSchema.parse(await body(req));
  const a = await load(params.id!);
  const sent = a.targets.reduce((n, t) => n + t.deliveries.filter((d) => d.status === 'SENT').length, 0);
  if (confirmCount !== sent) throw new HttpError(400, 'จำนวนที่ยืนยันไม่ตรงกับจำนวนข้อความที่ส่งแล้ว');
  const q = queues.dispatch();
  await q.removeJobScheduler(scheduleJobId(a.id)).catch(() => undefined);
  await q.remove(scheduleJobId(a.id)).catch(() => undefined);
  if (a.schedule) await prisma.schedule.update({ where: { id: a.schedule.id }, data: { active: false } });
  await queues.manage().add('delete', { announcementId: a.id, action: 'delete' });
  await audit(actor, 'announcement.deleteEverywhere', { announcementId: a.id, messages: sent }, 'queued');
  return { queued: sent };
});
