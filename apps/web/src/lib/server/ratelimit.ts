import 'server-only';
import { redis } from './queue';

/** Fixed-window counter in Redis. Returns true when the call is allowed. Fails open if Redis is down. */
export async function allow(key: string, limit: number, windowSec: number): Promise<boolean> {
  try {
    const k = `rl:${key}`;
    const n = await redis().incr(k);
    if (n === 1) await redis().expire(k, windowSec);
    return n <= limit;
  } catch {
    return true;
  }
}

export async function clientIp(): Promise<string> {
  const { headers } = await import('next/headers');
  const h = await headers();
  return h.get('x-forwarded-for')?.split(',')[0]?.trim() || h.get('x-real-ip') || 'unknown';
}
