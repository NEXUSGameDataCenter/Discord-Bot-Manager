import { prisma } from '@nexus/db';
import { profileSchema } from '@nexus/shared';
import { route, body, notFound, HttpError } from '@/lib/server/route';
import { queues, RETRY_OPTS } from '@/lib/server/queue';
import { audit } from '@/lib/server/audit';

export const dynamic = 'force-dynamic';

export const GET = route(async (_req, { params }) => {
  const g = (await prisma.guild.findUnique({ where: { id: params.guildRefId! }, include: { profile: true } })) ?? notFound('Server not found');
  return { guild: { id: g.id, name: g.name, liveNick: g.liveNick, missingPerms: g.missingPerms }, profile: g.profile };
});

export const PUT = route(async (req, { params, actor }) => {
  const input = profileSchema.parse(await body(req));
  const g = (await prisma.guild.findUnique({ where: { id: params.guildRefId! } })) ?? notFound('Server not found');
  for (const id of [input.avatarAssetId, input.bannerAssetId]) {
    if (id && !(await prisma.asset.findFirst({ where: { id, kind: 'image' } }))) throw new HttpError(400, 'Image asset not found');
  }
  await prisma.guildProfile.upsert({
    where: { guildRefId: g.id },
    create: { guildRefId: g.id, ...input, status: 'PENDING' },
    update: { ...input, status: 'PENDING', lastError: null },
  });
  await queues.profile().add('sync', { guildRefId: g.id, force: true }, RETRY_OPTS);
  await audit(actor, 'profile.update', { servers: 1, guildRefId: g.id, name: g.name }, 'queued', input);
  return { queued: true };
});
