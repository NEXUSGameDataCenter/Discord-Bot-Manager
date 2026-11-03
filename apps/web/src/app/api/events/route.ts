import { Redis } from 'ioredis';
import { EVENTS_CHANNEL } from '@nexus/shared';
import { requireAdmin } from '@/lib/server/route';
import { serverEnv } from '@/lib/server/env';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** Redis pub/sub -> Server-Sent Events. One subscriber connection per open tab. */
export async function GET(req: Request) {
  try {
    await requireAdmin();
  } catch {
    return new Response('Unauthorized', { status: 401 });
  }
  const sub = new Redis(serverEnv().REDIS_URL);
  const enc = new TextEncoder();
  let heartbeat: ReturnType<typeof setInterval> | undefined;
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const close = () => {
        clearInterval(heartbeat);
        sub.disconnect();
        try {
          controller.close();
        } catch {}
      };
      req.signal.addEventListener('abort', close);
      sub.on('message', (_ch, msg) => controller.enqueue(enc.encode(`data: ${msg}\n\n`)));
      await sub.subscribe(EVENTS_CHANNEL);
      controller.enqueue(enc.encode(': connected\n\n'));
      heartbeat = setInterval(() => controller.enqueue(enc.encode(': ping\n\n')), 25_000);
    },
    cancel() {
      clearInterval(heartbeat);
      sub.disconnect();
    },
  });
  return new Response(stream, { headers: { 'content-type': 'text/event-stream', 'cache-control': 'no-cache, no-transform', connection: 'keep-alive' } });
}
