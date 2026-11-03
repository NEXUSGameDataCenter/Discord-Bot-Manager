import { Redis } from 'ioredis';
import { EVENTS_CHANNEL, type NexusEvent } from '@nexus/shared';
import { env } from './env';
import { logger } from './logger';

/** BullMQ requires maxRetriesPerRequest: null on worker connections. */
export const connection = new Redis(env.REDIS_URL, { maxRetriesPerRequest: null });
const publisher = new Redis(env.REDIS_URL);

export function publish(ev: NexusEvent): void {
  publisher.publish(EVENTS_CHANNEL, JSON.stringify(ev)).catch((err) => logger.warn({ err }, 'publish failed'));
}

export async function closeRedis(): Promise<void> {
  await Promise.allSettled([connection.quit(), publisher.quit()]);
}
