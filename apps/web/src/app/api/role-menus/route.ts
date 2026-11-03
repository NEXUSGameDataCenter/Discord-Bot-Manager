import { prisma } from '@nexus/db';
import { roleMenuSchema } from '@nexus/shared';
import { body, route, routeAs } from '@/lib/server/route';
import { validateMenu } from '@/lib/server/roleMenus';
import { queues } from '@/lib/server/queue';
import { audit } from '@/lib/server/audit';

export const dynamic = 'force-dynamic';

export const GET = routeAs('EDITOR', async (req) => {
  const guildRefId = new URL(req.url).searchParams.get('guildRefId');
  return { menus: guildRefId ? await prisma.roleMenu.findMany({ where: { guildRefId }, orderBy: { createdAt: 'desc' } }) : [] };
});

export const POST = route(async (req, { actor }) => {
  const input = roleMenuSchema.parse(await body(req));
  const g = await validateMenu(input);
  const menu = await prisma.roleMenu.create({ data: { ...input, status: 'DRAFT' } });
  await queues.control().add('publishRoleMenu', { botId: g.botId, action: 'publishRoleMenu', menuId: menu.id });
  await audit(actor, 'roleMenu.create', { servers: 1, guildRefId: g.id, menuId: menu.id }, 'queued');
  return { menu };
});
