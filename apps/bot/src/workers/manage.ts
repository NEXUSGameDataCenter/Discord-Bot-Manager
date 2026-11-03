import { Worker } from 'bullmq';
import { ChannelType, type NewsChannel, type TextChannel } from 'discord.js';
import { prisma } from '@nexus/db';
import { QUEUES, renderTemplate, type ManageJob } from '@nexus/shared';
import { connection, publish } from '../redis';
import { logger } from '../logger';
import { getClient } from '../manager';
import { inspect } from '../discordError';

/** Edit (content) or delete every SENT message of an announcement, across all runs. */
async function manage(job: ManageJob): Promise<void> {
  const a = await prisma.announcement.findUniqueOrThrow({ where: { id: job.announcementId } });
  const client = getClient(a.botId);
  const deliveries = await prisma.delivery.findMany({
    where: { status: 'SENT', messageId: { not: null }, target: { announcementId: a.id } },
    include: { target: { include: { guild: true } } },
  });
  let ok = 0;
  let failed = 0;
  for (const d of deliveries) {
    const dg = client.guilds.cache.get(d.target.guild.guildId);
    const ch = dg?.channels.cache.get(d.target.channelId);
    try {
      if (!dg || !ch || (ch.type !== ChannelType.GuildText && ch.type !== ChannelType.GuildAnnouncement)) throw new Error('channel unavailable');
      const channel = ch as TextChannel | NewsChannel;
      const messageId = d.messageId!;
      if (job.action === 'edit') {
        const prefix = [d.target.pingRoleId ? `<@&${d.target.pingRoleId}>` : '', d.target.extraText ?? ''].filter(Boolean).join(' ');
        const body = renderTemplate(job.content ?? '', {
          server: { name: dg.name, memberCount: dg.memberCount },
          channel: { name: channel.name },
          date: new Date(),
          custom: (d.target.guild.customVars ?? {}) as Record<string, string>,
        });
        const content = [prefix, body].filter(Boolean).join('\n').slice(0, 2000);
        const allowedMentions = { parse: [] as never[], roles: [], users: [] }; // edits never re-ping
        if (d.webhookId) await (await client.fetchWebhook(d.webhookId)).editMessage(messageId, { content, allowedMentions });
        else await channel.messages.edit(messageId, { content, allowedMentions });
      } else {
        if (d.webhookId) await (await client.fetchWebhook(d.webhookId)).deleteMessage(messageId);
        else await channel.messages.delete(messageId);
        await prisma.delivery.update({ where: { id: d.id }, data: { status: 'DELETED' } });
      }
      ok++;
    } catch (err) {
      const { reason } = inspect(err);
      // A message already gone counts as deleted.
      if (job.action === 'delete' && /10008|ไม่พบข้อความ/.test(reason)) {
        await prisma.delivery.update({ where: { id: d.id }, data: { status: 'DELETED' } });
        ok++;
        continue;
      }
      failed++;
      await prisma.delivery.update({ where: { id: d.id }, data: { error: `${job.action} failed: ${reason}` } });
    }
    publish({ type: 'delivery', announcementId: a.id, deliveryId: d.id, status: job.action });
  }
  if (job.action === 'delete') await prisma.announcement.update({ where: { id: a.id }, data: { status: 'DELETED' } });
  if (job.action === 'edit' && job.content !== undefined) {
    const payload = { ...(a.payload as Record<string, unknown>), content: job.content };
    await prisma.announcement.update({ where: { id: a.id }, data: { payload } });
  }
  await prisma.auditLog.create({ data: { actor: 'system', action: `announcement.${job.action}.result`, targets: { announcementId: a.id }, result: failed ? 'partial' : 'success', detail: { ok, failed } } });
  logger.info({ announcementId: a.id, action: job.action, ok, failed }, 'manage done');
}

export function startManageWorker(): Worker<ManageJob> {
  return new Worker<ManageJob>(QUEUES.manage, async (job) => manage(job.data), { connection, concurrency: 1 });
}
