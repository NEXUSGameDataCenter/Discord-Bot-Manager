import { prisma, type Prisma } from '@nexus/db';
import { guildPatchSchema } from '@nexus/shared';
import { route, body, HttpError, notFound } from '@/lib/server/route';
import { audit } from '@/lib/server/audit';

export const PATCH = route(async (req, { params, actor }) => {
  const input = guildPatchSchema.parse(await body(req));
  const g = (await prisma.guild.findUnique({ where: { id: params.id! } })) ?? notFound('Server not found');
  if (input.defaultChannelId) {
    const ch = await prisma.channel.findUnique({ where: { guildRefId_channelId: { guildRefId: g.id, channelId: input.defaultChannelId } } });
    if (!ch?.canSend) throw new HttpError(400, 'Bot ส่งข้อความในห้องนี้ไม่ได้');
  }
  const data: Prisma.GuildUpdateInput = {};
  if (input.defaultChannelId !== undefined) data.defaultChannelId = input.defaultChannelId;
  if (input.customVars) data.customVars = input.customVars;
  await prisma.guild.update({ where: { id: g.id }, data });
  await audit(actor, 'guild.update', { guildRefId: g.id, name: g.name }, 'success', input);
  return { ok: true };
});
