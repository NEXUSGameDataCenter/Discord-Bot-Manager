import { z } from 'zod';
import { prisma } from '@nexus/db';
import { route, body, HttpError, notFound } from '@/lib/server/route';
import { queues } from '@/lib/server/queue';
import { audit } from '@/lib/server/audit';

export const DELETE = route(async (req, { params, actor }) => {
  const { confirmName } = z.object({ confirmName: z.string() }).parse(await body(req));
  const bot = (await prisma.bot.findUnique({ where: { id: params.id! }, include: { _count: { select: { guilds: { where: { present: true } } } } } })) ?? notFound('Bot not found');
  if (confirmName !== bot.username) throw new HttpError(400, 'ชื่อยืนยันไม่ตรงกับชื่อ Bot');
  await queues.control().add('stop', { botId: bot.id, action: 'stop' });
  await prisma.bot.delete({ where: { id: bot.id } });
  await audit(actor, 'bot.remove', { botId: bot.id, username: bot.username, servers: bot._count.guilds }, 'success');
  return { ok: true };
});
