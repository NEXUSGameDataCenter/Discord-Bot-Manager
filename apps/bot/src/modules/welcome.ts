import type { GuildMember, PartialGuildMember } from 'discord.js';
import { autoRolesFor, renderMemberTemplate, type MemberContext } from '@nexus/shared';
import { logger } from '../logger';
import { controlQueue } from '../queues';
import { getSettings } from './settings';

const ctx = (m: GuildMember | PartialGuildMember): MemberContext => ({
  userId: m.id,
  username: m.user?.username ?? 'unknown',
  displayName: m.displayName ?? m.user?.username ?? 'unknown',
  serverName: m.guild.name,
  memberCount: m.guild.memberCount,
});

export async function onMemberAdd(botId: string, m: GuildMember): Promise<void> {
  const { settings } = await getSettings(botId, m.guild.id);
  if (!settings) return;
  // Auto roles: immediate ones now, delayed ones via a delayed queue job (survives restarts).
  const roles = autoRolesFor(settings.autoRoleList, m.user.bot);
  const now = roles.filter((r) => r.delaySec === 0).map((r) => r.roleId);
  if (now.length) await giveRoles(m, now);
  const byDelay = new Map<number, string[]>();
  for (const r of roles.filter((r) => r.delaySec > 0)) byDelay.set(r.delaySec, [...(byDelay.get(r.delaySec) ?? []), r.roleId]);
  for (const [delay, roleIds] of byDelay)
    await controlQueue.add('autorole', { botId, action: 'autorole', guildId: m.guild.id, userId: m.id, roleIds }, { delay: delay * 1000, removeOnComplete: true, removeOnFail: 100 });

  if (m.user.bot) return;
  if (settings.welcomeEnabled && settings.welcomeChannelId) {
    const ch = m.guild.channels.cache.get(settings.welcomeChannelId);
    if (ch?.isTextBased())
      await ch
        .send({ content: renderMemberTemplate(settings.welcomeMessage, ctx(m)).slice(0, 2000), allowedMentions: { users: [m.id], parse: [] } })
        .catch((err) => logger.warn({ err: err.message, guild: m.guild.id }, 'welcome send failed'));
  }
  if (settings.welcomeDmEnabled && settings.welcomeDmMessage.trim()) {
    // Members with DMs closed throw 50007 — expected, not an error.
    await m.send({ content: renderMemberTemplate(settings.welcomeDmMessage, ctx(m)).slice(0, 2000) }).catch(() => undefined);
  }
}

export async function onMemberRemove(botId: string, m: GuildMember | PartialGuildMember): Promise<void> {
  const { settings } = await getSettings(botId, m.guild.id);
  if (!settings?.goodbyeEnabled || !settings.goodbyeChannelId || m.user?.bot) return;
  const ch = m.guild.channels.cache.get(settings.goodbyeChannelId);
  if (ch?.isTextBased())
    await ch
      .send({ content: renderMemberTemplate(settings.goodbyeMessage, ctx(m)).slice(0, 2000), allowedMentions: { parse: [] } })
      .catch((err) => logger.warn({ err: err.message }, 'goodbye send failed'));
}

export async function giveRoles(m: GuildMember, roleIds: string[]): Promise<void> {
  const botTop = m.guild.members.me?.roles.highest.position ?? 0;
  const ok = roleIds.filter((id) => {
    const r = m.guild.roles.cache.get(id);
    return r && !r.managed && r.position < botTop && !m.roles.cache.has(id);
  });
  if (ok.length !== roleIds.length) logger.warn({ guild: m.guild.id, skipped: roleIds.filter((r) => !ok.includes(r)) }, 'autorole: some roles not assignable (hierarchy/missing)');
  if (ok.length) await m.roles.add(ok, 'Nexus auto role').catch((err) => logger.warn({ err: err.message }, 'autorole failed'));
}
