import { prisma } from '@nexus/db';
import { roleMenuSchema } from '@nexus/shared';
import { route, body, notFound } from '@/lib/server/route';
import { queues } from '@/lib/server/queue';
import { audit } from '@/lib/server/audit';
import { validateMenu } from '@/lib/server/roleMenus';

export const PUT = route(async (req, { params, actor }) => {
  const input = roleMenuSchema.parse(await body(req));
  const old = (await prisma.roleMenu.findUnique({ where: { id: params.id! }, include: { guild: true } })) ?? notFound('Menu not found');
  const g = await validateMenu(input);
  // Moving to another channel: delete the old message, post a new one.
  if (old.messageId && old.channelId !== input.channelId)
    await queues.control().add('deleteRoleMenu', { botId: g.botId, action: 'deleteRoleMenu', guildId: old.guild.guildId, channelId: old.channelId, messageId: old.messageId });
  const menu = await prisma.roleMenu.update({
    where: { id: old.id },
    data: { ...input, messageId: old.channelId === input.channelId ? old.messageId : null, status: 'DRAFT' },
  });
  await queues.control().add('publishRoleMenu', { botId: g.botId, action: 'publishRoleMenu', menuId: menu.id });
  await audit(actor, 'roleMenu.update', { servers: 1, menuId: menu.id }, 'queued');
  return { menu };
});

export const DELETE = route(async (_req, { params, actor }) => {
  const m = (await prisma.roleMenu.findUnique({ where: { id: params.id! }, include: { guild: true } })) ?? notFound('Menu not found');
  if (m.messageId) await queues.control().add('deleteRoleMenu', { botId: m.guild.botId, action: 'deleteRoleMenu', guildId: m.guild.guildId, channelId: m.channelId, messageId: m.messageId });
  await prisma.roleMenu.delete({ where: { id: m.id } });
  await audit(actor, 'roleMenu.delete', { servers: 1, menuId: m.id }, 'success');
  return { ok: true };
});
