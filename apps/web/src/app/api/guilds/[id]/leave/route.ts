import { z } from 'zod';
import { prisma } from '@nexus/db';
import { route, body, HttpError, notFound } from '@/lib/server/route';
import { queues } from '@/lib/server/queue';
import { audit } from '@/lib/server/audit';

export const POST = route(async (req, { params, actor }) => {
  const { confirmName } = z.object({ confirmName: z.string() }).parse(await body(req));
  const g = (await prisma.guild.findUnique({ where: { id: params.id! } })) ?? notFound('Server not found');
  if (confirmName !== g.name) throw new HttpError(400, 'ชื่อ Server ที่พิมพ์ยืนยันไม่ตรงกัน');
  await queues.control().add('leave', { botId: g.botId, action: 'leave', guildId: g.guildId });
  await audit(actor, 'guild.leave', { servers: 1, guildRefId: g.id, name: g.name }, 'queued');
  return { queued: true };
});
