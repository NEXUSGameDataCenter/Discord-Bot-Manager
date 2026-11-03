import { createHash } from 'node:crypto';
import { Worker } from 'bullmq';
import { Routes, PermissionFlagsBits } from 'discord.js';
import { prisma } from '@nexus/db';
import { QUEUES, PERMISSION_FIX, backoffDelay, type ProfileJob } from '@nexus/shared';
import { connection, publish } from '../redis';
import { logger } from '../logger';
import { assetDataUri } from '../assets';
import { FatalError, inspect } from '../discordError';
import { getClient } from '../manager';

function desiredHash(p: { nick: string | null; bio: string | null; avatarAssetId: string | null; bannerAssetId: string | null }) {
  return createHash('sha256').update(JSON.stringify([p.nick, p.bio, p.avatarAssetId, p.bannerAssetId])).digest('hex');
}

async function apply(job: ProfileJob): Promise<void> {
  const g = await prisma.guild.findUniqueOrThrow({ where: { id: job.guildRefId }, include: { profile: true } });
  const p = g.profile;
  if (!p) return;
  const hash = desiredHash(p);
  if (!job.force && p.status === 'SYNCED' && p.appliedHash === hash) return;

  const client = getClient(g.botId);
  const dg = client.guilds.cache.get(g.guildId);
  if (!dg) throw new FatalError('Bot ไม่ได้อยู่ใน Server นี้แล้ว');
  if (!dg.members.me?.permissions.has(PermissionFlagsBits.ChangeNickname)) {
    throw new FatalError(`ขาด Change Nickname — ${PERMISSION_FIX.ChangeNickname}`);
  }
  // PATCH /guilds/{guild.id}/members/@me — null resets a field to the global profile.
  const body = {
    nick: p.nick,
    bio: p.bio,
    avatar: await assetDataUri(p.avatarAssetId),
    banner: await assetDataUri(p.bannerAssetId),
  };
  await client.rest.patch(Routes.guildMember(dg.id, '@me'), { body, reason: 'Nexus profile sync' });
  await prisma.$transaction([
    prisma.guildProfile.update({ where: { id: p.id }, data: { status: 'SYNCED', appliedHash: hash, lastError: null, lastAppliedAt: new Date() } }),
    prisma.guild.update({ where: { id: g.id }, data: { liveNick: p.nick } }),
  ]);
  publish({ type: 'profile', guildRefId: g.id, status: 'SYNCED' });
}

async function markFailed(guildRefId: string, reason: string) {
  await prisma.guildProfile.updateMany({ where: { guildRefId }, data: { status: 'FAILED', lastError: reason } });
  publish({ type: 'profile', guildRefId, status: 'FAILED' });
}

export function startProfileWorker(): Worker<ProfileJob> {
  const w = new Worker<ProfileJob>(
    QUEUES.profile,
    async (job) => {
      try {
        await apply(job.data);
      } catch (err) {
        const { cls, reason } = inspect(err);
        if (cls === 'fatal') return markFailed(job.data.guildRefId, reason);
        throw err;
      }
    },
    { connection, concurrency: 2, settings: { backoffStrategy: (attempts: number) => backoffDelay(attempts) } },
  );
  w.on('failed', (job, err) => {
    if (!job) return;
    logger.warn({ err: err.message, guildRefId: job.data.guildRefId }, 'profile sync attempt failed');
    if (job.attemptsMade >= (job.opts.attempts ?? 1)) void markFailed(job.data.guildRefId, inspect(err).reason);
  });
  return w;
}
