import { z } from 'zod';
import { prisma } from '@nexus/db';
import { reactionRoleSchema } from '@nexus/shared';
import { route, body, notFound } from '@/lib/server/route';
import { queues } from '@/lib/server/queue';
import { audit } from '@/lib/server/audit';
import { toInput, toRow, validateMenu } from '@/lib/server/roleMenus';

const ownsMessage = (m: { config: unknown }) => (m.config as { messageSource?: string } | null)?.messageSource !== 'EXISTING';

export const PUT = route(async (req, { params, actor }) => {
  const input = reactionRoleSchema.parse(await body(req));
  const old = (await prisma.roleMenu.findUnique({ where: { id: params.id! }, include: { guild: true } })) ?? notFound('Menu not found');
  const g = await validateMenu(input);
  const sameTarget = old.channelId === input.channelId && ownsMessage(old) === (input.messageSource === 'NEW');
  // Moving to another channel (or to an existing message): remove the old message we posted.
  if (old.messageId && !sameTarget && ownsMessage(old))
    await queues.control().add('deleteRoleMenu', { botId: g.botId, action: 'deleteRoleMenu', guildId: old.guild.guildId, channelId: old.channelId, messageId: old.messageId });
  const menu = await prisma.roleMenu.update({ where: { id: old.id }, data: { ...toRow(input), messageId: sameTarget ? old.messageId : null, status: 'DRAFT' } });
  await queues.control().add('publishRoleMenu', { botId: g.botId, action: 'publishRoleMenu', menuId: menu.id });
  await audit(actor, 'roleMenu.update', { servers: 1, menuId: menu.id, name: input.name }, 'queued');
  return { menu: toInput(menu) };
});

/** Quick enable/disable from the list. */
export const PATCH = route(async (req, { params, actor }) => {
  const { enabled } = z.object({ enabled: z.boolean() }).parse(await body(req));
  const menu = await prisma.roleMenu.update({ where: { id: params.id! }, data: { enabled } }).catch(() => notFound('Menu not found'));
  await audit(actor, 'roleMenu.update', { servers: 1, menuId: menu.id, name: menu.title }, 'success', { enabled });
  return { menu: toInput(menu) };
});

export const DELETE = route(async (_req, { params, actor }) => {
  const m = (await prisma.roleMenu.findUnique({ where: { id: params.id! }, include: { guild: true } })) ?? notFound('Menu not found');
  // Never delete a message the menu was only attached to.
  if (m.messageId && ownsMessage(m)) await queues.control().add('deleteRoleMenu', { botId: m.guild.botId, action: 'deleteRoleMenu', guildId: m.guild.guildId, channelId: m.channelId, messageId: m.messageId });
  await prisma.roleMenu.delete({ where: { id: m.id } });
  await audit(actor, 'roleMenu.delete', { servers: 1, menuId: m.id, name: m.title }, 'success');
  return { ok: true };
});
