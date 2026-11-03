import { prisma } from '@nexus/db';
import { bulkApplySchema } from '@nexus/shared';
import { route, body, HttpError, notFound } from '@/lib/server/route';
import { queues, RETRY_OPTS } from '@/lib/server/queue';
import { audit } from '@/lib/server/audit';

/** Bulk apply = one desired-state write + one queued job per server. */
export const POST = route(async (req, { actor }) => {
  const input = bulkApplySchema.parse(await body(req));
  const preset = (await prisma.profilePreset.findUnique({ where: { id: input.presetId } })) ?? notFound('Preset not found');
  const guilds = await prisma.guild.findMany({ where: { id: { in: input.guildRefIds }, present: true }, select: { id: true } });
  if (guilds.length !== input.guildRefIds.length) throw new HttpError(400, 'บาง Server ไม่พบหรือ Bot ออกไปแล้ว');
  const data = { nick: preset.nick, bio: preset.bio, avatarAssetId: preset.avatarAssetId, bannerAssetId: preset.bannerAssetId };
  await prisma.$transaction(
    guilds.map((g) =>
      prisma.guildProfile.upsert({ where: { guildRefId: g.id }, create: { guildRefId: g.id, ...data }, update: { ...data, status: 'PENDING', lastError: null } }),
    ),
  );
  await queues.profile().addBulk(guilds.map((g) => ({ name: 'sync', data: { guildRefId: g.id, force: true }, opts: RETRY_OPTS })));
  await audit(actor, 'preset.bulkApply', { servers: guilds.length, presetId: preset.id, name: preset.name }, 'queued');
  return { queued: guilds.length };
});
