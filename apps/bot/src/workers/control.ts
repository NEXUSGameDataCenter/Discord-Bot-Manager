import { Worker } from 'bullmq';
import { prisma } from '@nexus/db';
import { QUEUES, type ControlJob } from '@nexus/shared';
import { connection } from '../redis';
import { logger } from '../logger';
import { assetDataUri } from '../assets';
import { getClient, refreshBot, startBot, stopBot } from '../manager';

async function handle(job: ControlJob): Promise<void> {
  switch (job.action) {
    case 'start':
      await prisma.bot.updateMany({ where: { id: job.botId }, data: { desiredRunning: true } });
      return startBot(job.botId);
    case 'stop':
      await prisma.bot.updateMany({ where: { id: job.botId }, data: { desiredRunning: false } });
      return stopBot(job.botId);
    case 'restart':
      await stopBot(job.botId);
      return startBot(job.botId);
    case 'refresh':
      return refreshBot(job.botId);
    case 'leave': {
      const g = getClient(job.botId).guilds.cache.get(job.guildId);
      if (g) await g.leave();
      await prisma.guild.updateMany({ where: { botId: job.botId, guildId: job.guildId }, data: { present: false } });
      return;
    }
    case 'editGlobal': {
      const c = getClient(job.botId);
      const avatar = job.avatarAssetId ? await assetDataUri(job.avatarAssetId) : undefined;
      // Global edits are heavily rate-limited by Discord (~2 username changes/hour).
      const user = await c.user.edit({ username: job.username, avatar: avatar ?? undefined });
      await prisma.bot.update({ where: { id: job.botId }, data: { username: user.username, avatarUrl: user.displayAvatarURL({ size: 128 }) } });
      return;
    }
  }
}

export function startControlWorker(): Worker<ControlJob> {
  const w = new Worker<ControlJob>(QUEUES.control, async (job) => handle(job.data), { connection, concurrency: 1 });
  w.on('failed', (job, err) => {
    logger.error({ action: job?.data.action, botId: job?.data.botId, err: err.message }, 'control job failed');
    if (job) void prisma.bot.update({ where: { id: job.data.botId }, data: { lastError: `${job.data.action}: ${err.message}` } }).catch(() => undefined);
  });
  return w;
}
