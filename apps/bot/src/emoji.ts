import { emojify } from 'node-emoji';
import type { Guild, GuildMember } from 'discord.js';

/**
 * Discord only turns ":name:" into emoji when a person types it; bot text stays literal.
 * Converts server custom emoji by name first, then standard shortcodes (:tickets: → 🎟️).
 */
export function shortcodes(text: string, guild?: Guild | null): string {
  if (!text || !text.includes(':')) return text;
  const custom = guild
    ? text.replace(/(^|[^<a\w]):([\w~]{2,32}):/g, (m, pre: string, name: string) => {
        const e = guild.emojis.cache.find((x) => x.name === name);
        return e ? `${pre}${e.toString()}` : m;
      })
    : text;
  // Keep "<:name:id>" untouched while converting the rest.
  return custom.split(/(<a?:\w+:\d+>)/).map((part, i) => (i % 2 ? part : emojify(part))).join('');
}

/** A single emoji field that may hold ":name:", unicode or "<:name:id>". */
export function emojiField(e: string | undefined, guild?: Guild | null): string | undefined {
  if (!e) return e;
  const t = e.trim();
  return /^:[\w~]+:$/.test(t) ? shortcodes(t, guild) : t;
}

/** {user} {user.name} {username} {user.id} {server} {server.memberCount} {channel} */
export function fillMemberVars(text: string, m: GuildMember, channelName?: string): string {
  const vars: Record<string, string> = {
    user: `<@${m.id}>`, 'user.mention': `<@${m.id}>`, 'user.name': m.displayName, username: m.user.username, 'user.id': m.id,
    server: m.guild.name, 'server.name': m.guild.name, 'server.memberCount': m.guild.memberCount.toLocaleString('en-US'), channel: channelName ? `#${channelName}` : '',
  };
  return text.replace(/\{([\w.]+)\}/g, (all, k: string) => (k in vars ? vars[k]! : all));
}
