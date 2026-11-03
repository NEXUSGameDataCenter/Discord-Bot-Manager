import { ChannelType, PermissionFlagsBits, type Message } from 'discord.js';
import { prisma } from '@nexus/db';
import { honeypotTriggers } from '@nexus/shared';
import { logger } from '../logger';
import { getSettings } from './settings';
import { recordCase } from './modlog';

const recent = new Set<string>(); // de-dupe a burst of messages from the same spammer

export async function onMessage(botId: string, msg: Message): Promise<void> {
  if (!msg.inGuild()) return;
  const { settings } = await getSettings(botId, msg.guildId);
  if (!settings) return;
  const member = msg.member;
  const trig = honeypotTriggers({
    enabled: settings.honeypotEnabled,
    honeypotChannelId: settings.honeypotChannelId,
    channelId: msg.channelId,
    authorIsBot: msg.author.bot || !!msg.webhookId,
    authorIsOwner: msg.author.id === msg.guild.ownerId,
    authorIsAdmin: !!member?.permissions.has(PermissionFlagsBits.Administrator) || !!member?.permissions.has(PermissionFlagsBits.ManageGuild),
    authorRoleIds: member ? [...member.roles.cache.keys()] : [],
    exemptRoleIds: settings.honeypotExemptRoleIds,
  });
  if (!trig) return;
  const key = `${msg.guildId}:${msg.author.id}`;
  await msg.delete().catch(() => undefined);
  if (recent.has(key)) return;
  recent.add(key);
  setTimeout(() => recent.delete(key), 60_000);

  const reason = 'Honeypot: โพสต์ในห้องกับดัก';
  const action = settings.honeypotAction;
  const me = msg.guild.members.me!;
  let done = 'alert only';
  try {
    if (action === 'timeout' && member?.moderatable) {
      await member.timeout(24 * 3600_000, reason);
      done = 'timeout 24h';
    } else if (action === 'kick' && member?.kickable) {
      await member.kick(reason);
      done = 'kicked';
    } else if ((action === 'ban' || action === 'softban') && (member ? member.bannable : true)) {
      // Delete the last 24h of messages (spam across channels), softban = ban + immediate unban.
      await msg.guild.members.ban(msg.author.id, { reason, deleteMessageSeconds: 86_400 });
      if (action === 'softban') await msg.guild.members.unban(msg.author.id, 'Honeypot softban');
      done = action === 'softban' ? 'softbanned (messages purged)' : 'banned';
    } else if (action !== 'alert') {
      done = `could not ${action} — hierarchy/permission`;
    }
  } catch (err) {
    done = `failed: ${(err as Error).message}`;
    logger.warn({ err: (err as Error).message, guild: msg.guildId }, 'honeypot action failed');
  }
  await recordCase({ botId, guild: msg.guild, action: 'HONEYPOT', target: msg.author, moderator: me.user, reason, extra: `${done} · "${msg.content.slice(0, 200) || '(no text content)'}"` });
}

/** Creates a honeypot channel that is visible to everyone, with a warning. */
export async function createHoneypotChannel(guildRefId: string, client: import('discord.js').Client<true>, name: string): Promise<string> {
  const row = await prisma.guild.findUniqueOrThrow({ where: { id: guildRefId } });
  const g = client.guilds.cache.get(row.guildId);
  if (!g) throw new Error('Bot is not in this server');
  const ch = await g.channels.create({
    name,
    type: ChannelType.GuildText,
    topic: '⚠️ ห้ามโพสต์ในห้องนี้ — ระบบจะลงโทษอัตโนมัติ / Do NOT post here.',
    reason: 'Nexus honeypot',
  });
  await ch.send({ content: '⚠️ **ห้ามส่งข้อความในห้องนี้** ห้องนี้ใช้ดักบอทสแปม การโพสต์จะถูกลงโทษอัตโนมัติ\n⚠️ **Do not post in this channel.** It is a spam trap and posting is punished automatically.' });
  return ch.id;
}
