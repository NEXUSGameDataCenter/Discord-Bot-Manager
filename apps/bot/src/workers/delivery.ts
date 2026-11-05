import { setTimeout as sleep } from 'node:timers/promises';
import { Worker } from 'bullmq';
import {
  ChannelType,
  type APIEmbed,
  type APIActionRowComponent,
  type APIButtonComponentWithURL,
  type MessageCreateOptions,
  type NewsChannel,
  type TextChannel,
  type Webhook,
  type Client,
  type MessageMentionOptions,
} from 'discord.js';
import { prisma, type Prisma } from '@nexus/db';
import {
  QUEUES,
  backoffDelay,
  messagePayloadBase,
  renderPayload,
  validateMessage,
  missingPermissions,
  CHANNEL_SEND_PERMS,
  PERMISSION_FIX,
  type DeliveryJob,
  type Embed,
  type MessagePayload,
  type PermName,
} from '@nexus/shared';
import { connection, publish } from '../redis';
import { notify } from '../queues';
import { logger } from '../logger';
import { env } from '../env';
import { store } from '../assets';
import { FatalError, inspect } from '../discordError';
import { getClient } from '../manager';

type SendableChannel = TextChannel | NewsChannel;

export function toApiEmbed(e: Embed, now: Date): APIEmbed {
  return {
    title: e.title || undefined,
    description: e.description || undefined,
    url: e.url,
    color: e.color,
    author: e.author ? { name: e.author.name, url: e.author.url, icon_url: e.author.iconUrl } : undefined,
    thumbnail: e.thumbnailUrl ? { url: e.thumbnailUrl } : undefined,
    image: e.imageUrl ? { url: e.imageUrl } : undefined,
    fields: e.fields,
    footer: e.footer ? { text: e.footer.text, icon_url: e.footer.iconUrl } : undefined,
    timestamp: e.timestamp ? now.toISOString() : undefined,
  };
}

function buttonRows(p: MessagePayload): APIActionRowComponent<APIButtonComponentWithURL>[] {
  const rows: APIActionRowComponent<APIButtonComponentWithURL>[] = [];
  for (let i = 0; i < p.buttons.length; i += 5) {
    rows.push({ type: 1, components: p.buttons.slice(i, i + 5).map((b) => ({ type: 2, style: 5, label: b.label, url: b.url })) });
  }
  return rows;
}

/** Mentions are always explicit: nothing pings unless allowed here. */
export function buildAllowedMentions(allowEveryone: boolean, pingRoleId: string | null): MessageMentionOptions {
  return { parse: allowEveryone ? ['everyone'] : [], roles: pingRoleId ? [pingRoleId] : [], users: [], repliedUser: false };
}

async function getOrCreateWebhook(client: Client<true>, ch: SendableChannel): Promise<Webhook> {
  const hooks = await ch.fetchWebhooks();
  const own = hooks.find((w) => w.applicationId === client.application.id && w.token);
  return own ?? ch.createWebhook({ name: 'Nexus Announcements', reason: 'Nexus webhook delivery' });
}

const load = (id: string) =>
  prisma.delivery.findUnique({ where: { id }, include: { target: { include: { announcement: true, guild: true } } } });
type LoadedDelivery = NonNullable<Prisma.PromiseReturnType<typeof load>>;

async function send(d: LoadedDelivery): Promise<{ messageId: string; webhookId: string | null }> {
  const { target } = d;
  const a = target.announcement;
  const client = getClient(a.botId);
  const dg = client.guilds.cache.get(target.guild.guildId);
  if (!dg) throw new FatalError('Bot ไม่ได้อยู่ใน Server นี้แล้ว');
  const ch = dg.channels.cache.get(target.channelId);
  if (!ch || (ch.type !== ChannelType.GuildText && ch.type !== ChannelType.GuildAnnouncement)) throw new FatalError('ไม่พบห้องปลายทาง หรือไม่ใช่ห้องข้อความ');
  const channel = ch as SendableChannel;

  const payload = messagePayloadBase.parse(a.payload);
  const need: PermName[] = [...CHANNEL_SEND_PERMS];
  if (payload.attachmentIds.length || payload.imageUrls.length) need.push('AttachFiles');
  if (target.mode === 'WEBHOOK') need.push('ManageWebhooks');
  if (a.allowEveryone) need.push('MentionEveryone');
  const missing = missingPermissions(channel.permissionsFor(dg.members.me!)?.bitfield ?? 0n, need);
  if (missing.length) throw new FatalError(`ขาด Permission: ${missing.join(', ')} — ${missing.map((m) => PERMISSION_FIX[m]).join(' / ')}`);

  const custom = (target.guild.customVars ?? {}) as Record<string, string>;
  const rendered = renderPayload(payload, {
    server: { name: dg.name, memberCount: dg.memberCount },
    channel: { name: channel.name },
    date: new Date(),
    custom,
  });
  const prefix = [target.pingRoleId ? `<@&${target.pingRoleId}>` : '', target.extraText ?? ''].filter(Boolean).join(' ');
  rendered.content = [prefix, rendered.content].filter(Boolean).join('\n');
  // The @everyone checkbox is the single source of truth: ticked → the tag is always there,
  // unticked → no @everyone/@here text at all (not even as plain, non-pinging text).
  const tag = /@(everyone|here)\b/;
  if (a.allowEveryone) {
    if (!tag.test(rendered.content)) rendered.content = ['@everyone', rendered.content].filter(Boolean).join('\n');
  } else {
    rendered.content = rendered.content.replace(/@(everyone|here)\b[ \t]*\n?/g, '').trim();
  }
  const errors = validateMessage(rendered);
  if (errors.length) throw new FatalError(`ข้อความเกินขีดจำกัดหลังแทนตัวแปร: ${errors.join('; ')}`);

  const assets = payload.attachmentIds.length ? await prisma.asset.findMany({ where: { id: { in: payload.attachmentIds } } }) : [];
  const now = new Date();
  const opts: MessageCreateOptions = {
    content: rendered.content || undefined,
    embeds: rendered.embeds.map((e) => toApiEmbed(e, now)),
    components: buttonRows(rendered),
    files: [
      ...(await Promise.all(assets.map(async (f) => ({ attachment: await store.get(f.storedAs), name: f.fileName })))),
      ...(await Promise.all(payload.imageUrls.map((u, i) => fetchImage(u, i)))),
    ],
    allowedMentions: buildAllowedMentions(a.allowEveryone, target.pingRoleId),
  };

  await sleep(Math.floor(Math.random() * 400)); // jitter; discord.js REST handles 429 buckets itself
  if (target.mode === 'WEBHOOK') {
    const hook = await getOrCreateWebhook(client, channel);
    const msg = await hook.send({ ...opts, username: target.webhookName ?? undefined, avatarURL: target.webhookAvatarUrl ?? undefined });
    if (a.crosspost && channel.type === ChannelType.GuildAnnouncement) await channel.messages.crosspost(msg.id).catch((err) => logger.warn({ err: err.message }, 'crosspost failed'));
    return { messageId: msg.id, webhookId: hook.id };
  }
  const msg = await channel.send(opts);
  if (a.crosspost && channel.type === ChannelType.GuildAnnouncement) await msg.crosspost().catch((err) => logger.warn({ err: err.message }, 'crosspost failed'));
  return { messageId: msg.id, webhookId: null };
}

/** Recompute the announcement status from its latest run. */
export async function refreshAnnouncementStatus(announcementId: string): Promise<void> {
  const latest = await prisma.delivery.aggregate({ _max: { run: true }, where: { target: { announcementId } } });
  const run = latest._max.run;
  if (!run) return;
  const groups = await prisma.delivery.groupBy({ by: ['status'], where: { run, target: { announcementId } }, _count: true });
  const n = (s: string) => groups.find((g) => g.status === s)?._count ?? 0;
  const ann = await prisma.announcement.findUnique({ where: { id: announcementId }, include: { schedule: true } });
  if (!ann || ann.status === 'DELETED') return;
  let status: 'SENDING' | 'DONE' | 'PARTIAL' | 'FAILED' | 'SCHEDULED' = 'SENDING';
  if (n('QUEUED') === 0) status = n('FAILED') === 0 ? 'DONE' : n('SENT') === 0 ? 'FAILED' : 'PARTIAL';
  if (status !== 'SENDING' && ann.schedule?.cron && ann.schedule.active) status = status === 'DONE' ? 'SCHEDULED' : status;
  await prisma.announcement.update({ where: { id: announcementId }, data: { status } });
  if (status === 'SENDING' || status === ann.status) return;
  const link = `/tracking/${announcementId}`;
  const total = n('SENT') + n('FAILED');
  if (n('FAILED')) {
    notify({
      kind: 'delivery_failed', title: `ส่งประกาศ "${ann.title}" ล้มเหลว ${n('FAILED')} ห้อง`, body: `ส่งสำเร็จ ${n('SENT')}/${total} ห้อง · กดเพื่อดูสาเหตุ`,
      link, emails: [ann.createdBy], roles: ['ADMIN'], dedupeKey: `ann-${announcementId}-${run}`,
    });
  } else if (ann.schedule) {
    notify({ kind: 'schedule_sent', title: `ประกาศตั้งเวลา "${ann.title}" ส่งครบแล้ว`, body: `${total} ห้อง`, link, emails: [ann.createdBy], dedupeKey: `sched-${announcementId}-${run}` });
  }
}

async function markFailed(deliveryId: string, announcementId: string, reason: string, attempts: number) {
  await prisma.delivery.update({ where: { id: deliveryId }, data: { status: 'FAILED', error: reason, attempts } });
  publish({ type: 'delivery', announcementId, deliveryId, status: 'FAILED' });
  await refreshAnnouncementStatus(announcementId);
}

export function startDeliveryWorker(): Worker<DeliveryJob> {
  const w = new Worker<DeliveryJob>(
    QUEUES.delivery,
    async (job) => {
      const d = await load(job.data.deliveryId);
      if (!d || d.status !== 'QUEUED') return; // idempotent: already sent / failed / deleted
      const announcementId = d.target.announcementId;
      try {
        const { messageId, webhookId } = await send(d);
        await prisma.delivery.update({
          where: { id: d.id },
          data: { status: 'SENT', messageId, webhookId, sentAt: new Date(), error: null, attempts: job.attemptsMade + 1 },
        });
        publish({ type: 'delivery', announcementId, deliveryId: d.id, status: 'SENT' });
        await refreshAnnouncementStatus(announcementId);
      } catch (err) {
        const { cls, reason } = inspect(err);
        if (cls === 'fatal') return markFailed(d.id, announcementId, reason, job.attemptsMade + 1); // 403/404/4xx: no retry
        await prisma.delivery.update({ where: { id: d.id }, data: { attempts: job.attemptsMade + 1, error: reason } });
        throw err; // 5xx / network / offline: BullMQ retries with backoff
      }
    },
    {
      connection,
      concurrency: env.DELIVERY_CONCURRENCY,
      limiter: { max: 10, duration: 1000 },
      settings: { backoffStrategy: (attempts: number) => backoffDelay(attempts) },
    },
  );
  w.on('failed', (job, err) => {
    if (!job || job.attemptsMade < (job.opts.attempts ?? 1)) return;
    void (async () => {
      const d = await prisma.delivery.findUnique({ where: { id: job.data.deliveryId }, include: { target: true } });
      if (d && d.status === 'QUEUED') await markFailed(d.id, d.target.announcementId, inspect(err).reason, job.attemptsMade);
    })().catch((e) => logger.error({ e }, 'final failure bookkeeping failed'));
  });
  return w;
}

const MAX_IMAGE_BYTES = 20 * 1024 * 1024;
const PRIVATE_HOST = /^(localhost|127\.|10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.|169\.254\.|0\.|\[?::1\]?$|\[?f[cd]|.*\.internal$|.*\.railway\.internal$)/i;

/** Downloads an image link so it is posted as a real attachment (outside any embed). */
async function fetchImage(url: string, i: number): Promise<{ attachment: Buffer; name: string }> {
  const u = new URL(url);
  if (u.protocol !== 'https:' || PRIVATE_HOST.test(u.hostname)) throw new FatalError(`ลิงก์รูปไม่อนุญาต: ${u.hostname}`);
  let res: Response;
  try {
    res = await fetch(u, { redirect: 'follow', signal: AbortSignal.timeout(15_000), headers: { 'user-agent': 'NexusBot/1.0' } });
  } catch {
    throw new Error(`โหลดรูปจากลิงก์ไม่ได้ (${u.hostname})`); // network issue: retried
  }
  if (!res.ok) throw new FatalError(`โหลดรูปจากลิงก์ไม่ได้: HTTP ${res.status} (${u.hostname})`);
  const type = res.headers.get('content-type') ?? '';
  if (!type.startsWith('image/')) throw new FatalError(`ลิงก์นี้ไม่ใช่ไฟล์รูปภาพ (${type || 'unknown'})`);
  if (Number(res.headers.get('content-length') ?? 0) > MAX_IMAGE_BYTES) throw new FatalError('รูปจากลิงก์ใหญ่เกิน 20 MB');
  const buf = Buffer.from(await res.arrayBuffer());
  if (buf.length > MAX_IMAGE_BYTES) throw new FatalError('รูปจากลิงก์ใหญ่เกิน 20 MB');
  const ext = (type.split('/')[1] ?? 'png').split(/[;+]/)[0]!.replace('jpeg', 'jpg');
  const base = decodeURIComponent(u.pathname.split('/').pop() ?? '').replace(/[^\w.-]/g, '').slice(0, 60);
  return { attachment: buf, name: /\.\w{2,5}$/.test(base) ? base : `image-${i + 1}.${ext}` };
}
