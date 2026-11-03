import { z } from 'zod';
import { route, body } from '@/lib/server/route';
import { queues } from '@/lib/server/queue';
import { audit } from '@/lib/server/audit';

export const POST = route(async (req, { actor }) => {
  const { botId } = z.object({ botId: z.string().min(1) }).parse(await body(req));
  await queues.control().add('refresh', { botId, action: 'refresh' });
  await audit(actor, 'guilds.healthcheck', { botId }, 'queued');
  return { queued: true };
});
