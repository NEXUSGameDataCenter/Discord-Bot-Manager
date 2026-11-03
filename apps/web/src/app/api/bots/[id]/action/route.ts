import { prisma } from '@nexus/db';
import { botActionSchema } from '@nexus/shared';
import { route, body, notFound } from '@/lib/server/route';
import { queues } from '@/lib/server/queue';
import { audit } from '@/lib/server/audit';

export const POST = route(async (req, { params, actor }) => {
  const input = botActionSchema.parse(await body(req));
  const bot = (await prisma.bot.findUnique({ where: { id: params.id! }, select: { id: true, username: true } })) ?? notFound('Bot not found');
  if (input.action === 'editGlobal' && input.avatarAssetId) {
    (await prisma.asset.findUnique({ where: { id: input.avatarAssetId } })) ?? notFound('Avatar asset not found');
  }
  await queues.control().add(input.action, { botId: bot.id, ...input });
  await audit(actor, `bot.${input.action}`, { botId: bot.id, username: bot.username }, 'queued');
  return { queued: true };
});
