import { ChannelType, type Guild as DGuild } from 'discord.js';
import { prisma } from '@nexus/db';
import { missingPermissions, REQUIRED_PERMISSIONS, PERMS } from '@nexus/shared';
import { publish } from './redis';
import { logger } from './logger';

const SENDABLE_TYPES = new Set<number>([ChannelType.GuildText, ChannelType.GuildAnnouncement]);

function has(bits: bigint, p: keyof typeof PERMS): boolean {
  return (bits & PERMS[p]) === PERMS[p];
}

/** Upserts a guild + its channel cache. Returns the Guild row id. */
export async function upsertGuild(botId: string, g: DGuild): Promise<string> {
  const me = g.members.me;
  const guildBits = me?.permissions.bitfield ?? 0n;
  const need = REQUIRED_PERMISSIONS.filter((p) => p.name !== 'MentionEveryone').map((p) => p.name);
  const data = {
    name: g.name,
    iconUrl: g.iconURL({ size: 128 }),
    memberCount: g.memberCount,
    joinedAt: me?.joinedAt ?? null,
    present: true,
    missingPerms: missingPermissions(guildBits, need),
    liveNick: me?.nickname ?? null,
  };
  const row = await prisma.guild.upsert({
    where: { botId_guildId: { botId, guildId: g.id } },
    create: { botId, guildId: g.id, ...data },
    update: data,
  });
  await refreshChannels(row.id, g, row.defaultChannelId);
  await refreshRoles(row.id, g);
  return row.id;
}

/** Role cache for dashboard dropdowns. assignable = below the bot's top role, not managed, not @everyone. */
export async function refreshRoles(guildRefId: string, g: DGuild): Promise<void> {
  const botTop = g.members.me?.roles.highest.position ?? 0;
  const rows = [...g.roles.cache.values()].map((r) => ({
    roleId: r.id,
    name: r.name,
    color: r.color,
    position: r.position,
    managed: r.managed,
    assignable: !r.managed && r.id !== g.id && r.position < botTop,
  }));
  await prisma.$transaction([
    prisma.role.deleteMany({ where: { guildRefId, roleId: { notIn: rows.map((r) => r.roleId) } } }),
    ...rows.map((r) => prisma.role.upsert({ where: { guildRefId_roleId: { guildRefId, roleId: r.roleId } }, create: { guildRefId, ...r }, update: r })),
  ]);
}

export async function refreshChannels(guildRefId: string, g: DGuild, currentDefault?: string | null): Promise<void> {
  const me = g.members.me;
  if (!me) return;
  const rows = [...g.channels.cache.values()]
    .filter((c) => SENDABLE_TYPES.has(c.type))
    .map((c) => {
      const bits = c.permissionsFor(me)?.bitfield ?? 0n;
      const canSend = has(bits, 'ViewChannel') && has(bits, 'SendMessages') && has(bits, 'EmbedLinks');
      return {
        channelId: c.id,
        name: c.name,
        type: c.type as number,
        position: 'rawPosition' in c && typeof c.rawPosition === 'number' ? c.rawPosition : 0,
        parentName: c.parent?.name ?? null,
        canSend,
        canAttach: canSend && has(bits, 'AttachFiles'),
        canWebhook: canSend && has(bits, 'ManageWebhooks'),
        canMentionEveryone: canSend && has(bits, 'MentionEveryone'),
      };
    });
  await prisma.$transaction([
    prisma.channel.deleteMany({ where: { guildRefId, channelId: { notIn: rows.map((r) => r.channelId) } } }),
    ...rows.map((r) =>
      prisma.channel.upsert({
        where: { guildRefId_channelId: { guildRefId, channelId: r.channelId } },
        create: { guildRefId, ...r },
        update: r,
      }),
    ),
  ]);
  // Pick a default announcement channel once, or again if the old one disappeared / lost access.
  if (!rows.some((r) => r.channelId === currentDefault && r.canSend)) {
    const sys = rows.find((r) => r.channelId === g.systemChannelId && r.canSend);
    const pick = rows.find((r) => r.type === ChannelType.GuildAnnouncement && r.canSend) ?? sys ?? rows.find((r) => r.canSend);
    await prisma.guild.update({ where: { id: guildRefId }, data: { defaultChannelId: pick?.channelId ?? null } });
  }
}

export async function syncAllGuilds(botId: string, guilds: Iterable<DGuild>): Promise<void> {
  const seen: string[] = [];
  for (const g of guilds) {
    try {
      await upsertGuild(botId, g);
      seen.push(g.id);
    } catch (err) {
      logger.error({ err, guildId: g.id }, 'guild sync failed');
    }
  }
  await prisma.guild.updateMany({ where: { botId, guildId: { notIn: seen } }, data: { present: false } });
  publish({ type: 'guilds', botId });
}
