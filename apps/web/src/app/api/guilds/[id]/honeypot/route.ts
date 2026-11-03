import { z } from 'zod';
import { prisma } from '@nexus/db';
import { route, body, notFound } from '@/lib/server/route';
import { queues } from '@/lib/server/queue';
import { audit } from '@/lib/server/audit';

/** Create a new honeypot channel with a custom name (bot needs Manage Channels). */
export const POST = route(async (req, { params, actor }) => {
  const { name } = z.object({ name: z.string().trim().toLowerCase().regex(/^[a-z0-9ก-๙_-]{1,90}$/, 'ชื่อห้องใช้ได้เฉพาะ a-z, 0-9, ภาษาไทย, - และ _') }).parse(await body(req));
  const g = (await prisma.guild.findUnique({ where: { id: params.id! } })) ?? notFound('Server not found');
  await queues.control().add('createHoneypot', { botId: g.botId, action: 'createHoneypot', guildRefId: g.id, name });
  await audit(actor, 'honeypot.createChannel', { servers: 1, guildRefId: g.id, name: g.name }, 'queued', { channel: name });
  return { queued: true };
});
