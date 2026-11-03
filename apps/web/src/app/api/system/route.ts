import { prisma } from '@nexus/db';
import { route } from '@/lib/server/route';
import { redis } from '@/lib/server/queue';
import { serverEnv } from '@/lib/server/env';

export const dynamic = 'force-dynamic';

export const GET = route(async () => {
  const check = async (fn: () => Promise<unknown>) => {
    try {
      await fn();
      return true;
    } catch {
      return false;
    }
  };
  const db = await check(() => prisma.$queryRaw`SELECT 1`);
  const cache = await check(async () => {
    if ((await redis().ping()) !== 'PONG') throw new Error();
  });
  let worker: unknown = null;
  const url = serverEnv().BOT_HEALTH_URL;
  if (url) {
    try {
      const r = await fetch(url, { cache: 'no-store', signal: AbortSignal.timeout(3000) });
      worker = await r.json();
    } catch {
      worker = null;
    }
  }
  return { db, redis: cache, worker };
});
