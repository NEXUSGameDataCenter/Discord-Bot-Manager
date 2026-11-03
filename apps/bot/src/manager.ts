import { Client, Events, GatewayIntentBits, Partials, type Guild as DGuild } from 'discord.js';
import { prisma } from '@nexus/db';
import { decrypt } from '@nexus/shared/crypto';
import { env } from './env';
import { logger } from './logger';
import { publish } from './redis';
import { refreshChannels, syncAllGuilds, upsertGuild } from './guilds';
import { profileQueue, RETRY_OPTS } from './queues';
import { onMemberAdd, onMemberRemove } from './modules/welcome';
import { onReaction, onRoleButton } from './modules/roleMenus';
import { onMessage } from './modules/honeypot';
import { onCommand, onReasonAutocomplete, registerCommands } from './modules/moderation';

const clients = new Map<string, Client>();
const refreshTimers = new Map<string, NodeJS.Timeout>();

export function getClient(botId: string): Client<true> {
  const c = clients.get(botId);
  if (!c || !c.isReady()) throw new Error('BOT_OFFLINE');
  return c;
}

export function runningBots() {
  return [...clients.entries()].map(([botId, c]) => ({ botId, ready: c.isReady(), ping: c.ws.ping, guilds: c.guilds.cache.size }));
}

async function setStatus(botId: string, status: 'OFFLINE' | 'STARTING' | 'ONLINE' | 'ERROR', extra: Record<string, unknown> = {}) {
  await prisma.bot.updateMany({ where: { id: botId }, data: { status, ...extra } });
  publish({ type: 'bot', botId, status });
}

/** Queue a sync for every profile of this bot that is not SYNCED or whose live nick drifted. */
export async function enqueueOutOfSyncProfiles(botId: string, guildRefId?: string): Promise<void> {
  const profiles = await prisma.guildProfile.findMany({
    where: { guild: { botId, present: true, ...(guildRefId ? { id: guildRefId } : {}) } },
    include: { guild: true },
  });
  for (const p of profiles) {
    const drift = p.status !== 'SYNCED' || (p.nick ?? null) !== (p.guild.liveNick ?? null);
    if (drift) await profileQueue.add('sync', { guildRefId: p.guildRefId, force: p.status === 'SYNCED' }, RETRY_OPTS);
  }
}

/** Debounce channel/permission refreshes: role edits fire many events at once. */
function scheduleRefresh(botId: string, g: DGuild) {
  const key = `${botId}:${g.id}`;
  clearTimeout(refreshTimers.get(key));
  refreshTimers.set(
    key,
    setTimeout(() => {
      refreshTimers.delete(key);
      upsertGuild(botId, g)
        .then(() => publish({ type: 'guilds', botId }))
        .catch((err) => logger.error({ err, guildId: g.id }, 'refresh failed'));
    }, 2000),
  );
}

export async function startBot(botId: string): Promise<void> {
  if (clients.has(botId)) return;
  const bot = await prisma.bot.findUnique({ where: { id: botId } });
  if (!bot) return;
  const token = decrypt(bot.tokenEnc, env.ENCRYPTION_KEY);
  // Guilds: core. GuildMembers (privileged): welcome/autorole. GuildMessages: honeypot (no MessageContent needed).
  // GuildMessageReactions: reaction roles. Partials let reactions on old (uncached) menu messages fire.
  const client = new Client({
    intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMembers, GatewayIntentBits.GuildMessages, GatewayIntentBits.GuildMessageReactions],
    partials: [Partials.Message, Partials.Channel, Partials.Reaction, Partials.User, Partials.GuildMember],
  });
  clients.set(botId, client);
  await setStatus(botId, 'STARTING', { lastError: null });

  client.once(Events.ClientReady, async (c) => {
    logger.info({ botId, user: c.user.tag, guilds: c.guilds.cache.size }, 'bot ready');
    await setStatus(botId, 'ONLINE', {
      startedAt: new Date(),
      username: c.user.username,
      avatarUrl: c.user.displayAvatarURL({ size: 128 }),
      pingMs: c.ws.ping >= 0 ? Math.round(c.ws.ping) : null,
    });
    await syncAllGuilds(botId, c.guilds.cache.values());
    await enqueueOutOfSyncProfiles(botId);
    await registerCommands(c).catch((err) => logger.error({ err: err.message }, 'command registration failed'));
  });
  const safe = (label: string, fn: () => Promise<void>) => void fn().catch((err) => logger.error({ err: err instanceof Error ? err.message : err, botId }, label));
  client.on(Events.GuildMemberAdd, (m) => safe('memberAdd', () => onMemberAdd(botId, m)));
  client.on(Events.GuildMemberRemove, (m) => safe('memberRemove', () => onMemberRemove(botId, m)));
  client.on(Events.MessageCreate, (m) => safe('honeypot', () => onMessage(botId, m)));
  client.on(Events.MessageReactionAdd, (r, u) => safe('reactionAdd', () => onReaction(r, u, true)));
  client.on(Events.MessageReactionRemove, (r, u) => safe('reactionRemove', () => onReaction(r, u, false)));
  client.on(Events.InteractionCreate, (i) =>
    safe('interaction', async () => {
      if (i.isButton() && i.customId.startsWith('rr:')) return onRoleButton(i);
      if (i.isAutocomplete()) return onReasonAutocomplete(botId, i);
      if (i.isChatInputCommand()) return onCommand(botId, i);
    }),
  );
  client.on(Events.GuildRoleCreate, (r) => scheduleRefresh(botId, r.guild));
  // The bot's own roles changed (granted/revoked) → recompute channel perms + assignable roles.
  client.on(Events.GuildMemberUpdate, (_o, m) => {
    if (m.id === client.user?.id) scheduleRefresh(botId, m.guild);
  });
  client.on(Events.GuildCreate, async (g) => {
    try {
      const id = await upsertGuild(botId, g);
      publish({ type: 'guilds', botId });
      await enqueueOutOfSyncProfiles(botId, id);
    } catch (err) {
      logger.error({ err }, 'guildCreate handling failed');
    }
  });
  client.on(Events.GuildDelete, (g) => {
    if (!g.available) return; // outage, not a removal
    prisma.guild
      .updateMany({ where: { botId, guildId: g.id }, data: { present: false } })
      .then(() => publish({ type: 'guilds', botId }))
      .catch((err) => logger.error({ err }, 'guildDelete failed'));
  });
  client.on(Events.GuildUpdate, (_o, g) => scheduleRefresh(botId, g));
  client.on(Events.ChannelCreate, (ch) => scheduleRefresh(botId, ch.guild));
  client.on(Events.ChannelUpdate, (_o, ch) => {
    if ('guild' in ch && ch.guild) scheduleRefresh(botId, ch.guild);
  });
  client.on(Events.ChannelDelete, (ch) => {
    if ('guild' in ch && ch.guild) scheduleRefresh(botId, ch.guild);
  });
  client.on(Events.GuildRoleUpdate, (_o, r) => scheduleRefresh(botId, r.guild));
  client.on(Events.GuildRoleDelete, (r) => scheduleRefresh(botId, r.guild));
  client.on(Events.Error, (err) => logger.error({ err, botId }, 'client error'));
  client.on(Events.ShardDisconnect, () => publish({ type: 'bot', botId, status: 'RECONNECTING' }));

  try {
    await client.login(token);
  } catch (err) {
    clients.delete(botId);
    await client.destroy().catch(() => undefined);
    const msg = err instanceof Error ? err.message : String(err);
    const intentHint = /disallowed intents/i.test(msg) ? 'เปิด Server Members Intent ใน Developer Portal → Bot → Privileged Gateway Intents' : null;
    logger.error({ botId, msg }, 'login failed');
    await setStatus(botId, 'ERROR', { lastError: intentHint ?? (/token/i.test(msg) ? 'Token ไม่ถูกต้องหรือถูก reset แล้ว' : msg) });
  }
}

export async function stopBot(botId: string): Promise<void> {
  const c = clients.get(botId);
  clients.delete(botId);
  if (c) await c.destroy();
  await setStatus(botId, 'OFFLINE', { pingMs: null, startedAt: null });
}

export async function refreshBot(botId: string): Promise<void> {
  const c = getClient(botId);
  await syncAllGuilds(botId, c.guilds.cache.values());
}

export async function refreshGuild(botId: string, guildId: string): Promise<void> {
  const g = getClient(botId).guilds.cache.get(guildId);
  const row = await prisma.guild.findUnique({ where: { botId_guildId: { botId, guildId } } });
  if (g && row) await refreshChannels(row.id, g, row.defaultChannelId);
}

export function startPingLoop(): NodeJS.Timeout {
  return setInterval(() => {
    for (const [botId, c] of clients) {
      if (!c.isReady()) continue;
      const ping = c.ws.ping >= 0 ? Math.round(c.ws.ping) : null;
      prisma.bot.update({ where: { id: botId }, data: { pingMs: ping } }).catch(() => undefined);
      publish({ type: 'bot', botId, status: 'ONLINE', pingMs: ping });
    }
  }, 30_000);
}

export async function stopAll(): Promise<void> {
  await Promise.allSettled([...clients.keys()].map((id) => stopBot(id)));
}
