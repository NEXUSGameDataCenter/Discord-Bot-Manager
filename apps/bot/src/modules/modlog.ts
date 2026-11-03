import { EmbedBuilder, type Guild, type User } from 'discord.js';
import { prisma } from '@nexus/db';
import { logger } from '../logger';
import { getSettings } from './settings';

const COLORS: Record<string, number> = { BAN: 0xef4444, SOFTBAN: 0xf97316, KICK: 0xf59e0b, TIMEOUT: 0xeab308, WARN: 0xfacc15, HONEYPOT: 0xdc2626, UNBAN: 0x22c55e, UNTIMEOUT: 0x22c55e, PURGE: 0x64748b, LOCK: 0x64748b, UNLOCK: 0x64748b };

/** Creates a numbered case and posts it to the server's mod-log channel (if set). */
export async function recordCase(p: {
  botId: string;
  guild: Guild;
  action: string;
  target?: User | null;
  moderator: User;
  reason?: string;
  durationSec?: number;
  extra?: string;
}): Promise<number | null> {
  const { guildRefId, settings } = await getSettings(p.botId, p.guild.id);
  if (!guildRefId) return null;
  // Retry on the (rare) caseNo race between two simultaneous actions.
  let caseNo = 0;
  for (let i = 0; i < 3; i++) {
    const last = await prisma.modCase.aggregate({ _max: { caseNo: true }, where: { guildRefId } });
    caseNo = (last._max.caseNo ?? 0) + 1;
    try {
      await prisma.modCase.create({
        data: {
          guildRefId, caseNo, action: p.action,
          targetUserId: p.target?.id ?? null, targetTag: p.target?.tag ?? null,
          moderatorId: p.moderator.id, moderatorTag: p.moderator.tag,
          reason: p.reason ?? '', durationSec: p.durationSec ?? null,
        },
      });
      break;
    } catch (e) {
      if (i === 2) throw e;
    }
  }
  const chId = settings?.modLogChannelId;
  if (chId) {
    const ch = p.guild.channels.cache.get(chId);
    if (ch?.isTextBased()) {
      const e = new EmbedBuilder()
        .setTitle(`Case #${caseNo} · ${p.action}`)
        .setColor(COLORS[p.action] ?? 0x6366f1)
        .addFields(
          ...(p.target ? [{ name: 'Member', value: `${p.target.tag} (<@${p.target.id}>)`, inline: true }] : []),
          { name: 'Moderator', value: `${p.moderator.tag}`, inline: true },
          ...(p.durationSec ? [{ name: 'Duration', value: `${Math.round(p.durationSec / 60)} min`, inline: true }] : []),
          { name: 'Reason', value: p.reason || '—' },
          ...(p.extra ? [{ name: 'Detail', value: p.extra }] : []),
        )
        .setTimestamp();
      await ch.send({ embeds: [e], allowedMentions: { parse: [] } }).catch((err) => logger.warn({ err: err.message }, 'mod log send failed'));
    }
  }
  return caseNo;
}
