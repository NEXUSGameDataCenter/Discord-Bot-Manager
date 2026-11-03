import { Redis } from 'ioredis';
import { prisma, type GuildSettings } from '@nexus/db';
import { CONFIG_CHANNEL, autoRoleSchema, type AutoRole } from '@nexus/shared';
import { z } from 'zod';
import { env } from '../env';
import { logger } from '../logger';

/** Settings cache keyed by `${botId}:${guildId}`; invalidated by the web app over Redis pub/sub. */
type Cached = { settings: (GuildSettings & { autoRoleList: AutoRole[] }) | null; guildRefId: string | null; at: number };
const cache = new Map<string, Cached>();
const TTL = 5 * 60_000;

export async function getSettings(botId: string, guildId: string): Promise<Cached> {
  const key = `${botId}:${guildId}`;
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < TTL) return hit;
  const g = await prisma.guild.findUnique({ where: { botId_guildId: { botId, guildId } }, include: { settings: true } });
  const s = g?.settings;
  const parsed = z.array(autoRoleSchema).safeParse(s?.autoRoles ?? []);
  const val: Cached = { settings: s ? { ...s, autoRoleList: parsed.success ? parsed.data : [] } : null, guildRefId: g?.id ?? null, at: Date.now() };
  cache.set(key, val);
  return val;
}

export function startConfigListener(): Redis {
  const sub = new Redis(env.REDIS_URL);
  sub.subscribe(CONFIG_CHANNEL).catch((err) => logger.error({ err }, 'config subscribe failed'));
  sub.on('message', (_c, guildRefId: string) => {
    for (const [k, v] of cache) if (v.guildRefId === guildRefId) cache.delete(k);
  });
  return sub;
}
