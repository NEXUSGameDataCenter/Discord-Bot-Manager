import { prisma } from '@nexus/db';
import { notFound, routeAs } from '@/lib/server/route';

export const dynamic = 'force-dynamic';

/** Only text/announcement channels where the bot has View + Send + Embed (+ Attach / ManageWebhooks when needed). */
export const GET = routeAs('EDITOR', async (req, { params }) => {
  const url = new URL(req.url);
  const attachments = url.searchParams.get('attachments') === '1';
  const webhook = url.searchParams.get('webhook') === '1';
  const g = (await prisma.guild.findUnique({ where: { id: params.id! }, select: { id: true, defaultChannelId: true } })) ?? notFound('Server not found');
  const channels = await prisma.channel.findMany({
    where: { guildRefId: g.id, canSend: true, ...(attachments ? { canAttach: true } : {}), ...(webhook ? { canWebhook: true } : {}) },
    orderBy: [{ parentName: 'asc' }, { position: 'asc' }],
    select: { channelId: true, name: true, type: true, parentName: true, canAttach: true, canWebhook: true, canMentionEveryone: true },
  });
  return { defaultChannelId: g.defaultChannelId, channels };
});
