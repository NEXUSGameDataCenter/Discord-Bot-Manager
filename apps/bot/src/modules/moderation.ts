import {
  ChannelType,
  PermissionFlagsBits,
  SlashCommandBuilder,
  type ChatInputCommandInteraction,
  type Client,
  type GuildMember,
  type TextChannel,
} from 'discord.js';
import { prisma } from '@nexus/db';
import { hierarchyBlock, parseDuration, MAX_TIMEOUT_SEC } from '@nexus/shared';
import { logger } from '../logger';
import { recordCase } from './modlog';
import { getSettings } from './settings';

const P = PermissionFlagsBits;
const reasonOpt = (b: SlashCommandBuilder) => b.addStringOption((o) => o.setName('reason').setDescription('เหตุผล').setMaxLength(400).setAutocomplete(true));
const userOpt = (b: SlashCommandBuilder, d = 'สมาชิก') => b.addUserOption((o) => o.setName('user').setDescription(d).setRequired(true));

/** Slash commands. default_member_permissions hides them from members without the permission. */
export const COMMANDS = [
  reasonOpt(userOpt(new SlashCommandBuilder().setName('ban').setDescription('แบนสมาชิก').setDefaultMemberPermissions(P.BanMembers)))
    .addIntegerOption((o) => o.setName('delete_days').setDescription('ลบข้อความย้อนหลัง (วัน)').setMinValue(0).setMaxValue(7)),
  reasonOpt(new SlashCommandBuilder().setName('unban').setDescription('ปลดแบน').setDefaultMemberPermissions(P.BanMembers).addStringOption((o) => o.setName('user_id').setDescription('User ID').setRequired(true))),
  reasonOpt(userOpt(new SlashCommandBuilder().setName('softban').setDescription('แบนแล้วปลดทันที เพื่อลบข้อความ').setDefaultMemberPermissions(P.BanMembers))),
  reasonOpt(userOpt(new SlashCommandBuilder().setName('kick').setDescription('เตะสมาชิก').setDefaultMemberPermissions(P.KickMembers))),
  reasonOpt(
    userOpt(new SlashCommandBuilder().setName('timeout').setDescription('ห้ามพูดชั่วคราว').setDefaultMemberPermissions(P.ModerateMembers)).addStringOption((o) =>
      o.setName('duration').setDescription('เช่น 10m, 1h, 1d (สูงสุด 28d)').setRequired(true),
    ),
  ),
  reasonOpt(userOpt(new SlashCommandBuilder().setName('untimeout').setDescription('ยกเลิก timeout').setDefaultMemberPermissions(P.ModerateMembers))),
  reasonOpt(userOpt(new SlashCommandBuilder().setName('warn').setDescription('เตือนสมาชิก').setDefaultMemberPermissions(P.ModerateMembers))),
  userOpt(new SlashCommandBuilder().setName('warnings').setDescription('ดูประวัติของสมาชิก').setDefaultMemberPermissions(P.ModerateMembers)),
  new SlashCommandBuilder()
    .setName('purge')
    .setDescription('ลบข้อความล่าสุด')
    .setDefaultMemberPermissions(P.ManageMessages)
    .addIntegerOption((o) => o.setName('count').setDescription('จำนวน 1-100').setMinValue(1).setMaxValue(100).setRequired(true))
    .addUserOption((o) => o.setName('user').setDescription('เฉพาะข้อความของคนนี้')),
  reasonOpt(new SlashCommandBuilder().setName('lock').setDescription('ล็อกห้องนี้ (ห้ามพิมพ์)').setDefaultMemberPermissions(P.ManageChannels)),
  reasonOpt(new SlashCommandBuilder().setName('unlock').setDescription('ปลดล็อกห้องนี้').setDefaultMemberPermissions(P.ManageChannels)),
  new SlashCommandBuilder().setName('case').setDescription('ดูรายละเอียด case').setDefaultMemberPermissions(P.ModerateMembers).addIntegerOption((o) => o.setName('number').setDescription('Case #').setRequired(true)),
].map((c) => c.setDMPermission(false).toJSON());

export async function registerCommands(client: Client<true>): Promise<void> {
  await client.application.commands.set(COMMANDS);
  logger.info({ count: COMMANDS.length }, 'slash commands registered');
}

function check(i: ChatInputCommandInteraction<'cached'>, target: GuildMember | null): string | null {
  if (!target) return null;
  return hierarchyBlock({
    actorId: i.user.id,
    actorTop: i.member.roles.highest.position,
    botTop: i.guild.members.me!.roles.highest.position,
    targetId: target.id,
    targetTop: target.roles.highest.position,
    ownerId: i.guild.ownerId,
  });
}

export async function onReasonAutocomplete(botId: string, i: import('discord.js').AutocompleteInteraction): Promise<void> {
  if (!i.guildId) return i.respond([]);
  const { settings } = await getSettings(botId, i.guildId);
  const q = String(i.options.getFocused()).toLowerCase();
  await i.respond((settings?.reasonPresets ?? []).filter((r) => r.toLowerCase().includes(q)).slice(0, 25).map((r) => ({ name: r.slice(0, 100), value: r.slice(0, 100) })));
}

export async function onCommand(botId: string, i: ChatInputCommandInteraction): Promise<void> {
  if (!i.inCachedGuild()) return void i.reply({ content: 'ใช้ได้เฉพาะในเซิร์ฟเวอร์', ephemeral: true });
  const reason = i.options.getString('reason') ?? '';
  const user = i.options.getUser('user');
  const target = user ? await i.guild.members.fetch(user.id).catch(() => null) : null;
  const block = check(i, target);
  if (block) return void i.reply({ content: `❌ ${block}`, ephemeral: true });
  const audit = `${i.user.tag}: ${reason || 'no reason'}`.slice(0, 500);
  const done = async (action: string, text: string, extra: { durationSec?: number; detail?: string } = {}) => {
    const no = await recordCase({ botId, guild: i.guild, action, target: user, moderator: i.user, reason, durationSec: extra.durationSec, extra: extra.detail });
    await i.reply({ content: `✅ ${text}${no ? ` · Case #${no}` : ''}`, ephemeral: true, allowedMentions: { parse: [] } });
  };

  try {
    switch (i.commandName) {
      case 'ban': {
        if (target && !target.bannable) return void i.reply({ content: '❌ Bot แบนคนนี้ไม่ได้', ephemeral: true });
        await i.guild.members.ban(user!.id, { reason: audit, deleteMessageSeconds: (i.options.getInteger('delete_days') ?? 0) * 86400 });
        return done('BAN', `แบน ${user!.tag} แล้ว`);
      }
      case 'unban': {
        const id = i.options.getString('user_id', true).trim();
        if (!/^\d{17,20}$/.test(id)) return void i.reply({ content: '❌ User ID ไม่ถูกต้อง', ephemeral: true });
        const u = await i.guild.members.unban(id, audit);
        await recordCase({ botId, guild: i.guild, action: 'UNBAN', target: u, moderator: i.user, reason });
        return void i.reply({ content: `✅ ปลดแบน ${u?.tag ?? id} แล้ว`, ephemeral: true });
      }
      case 'softban': {
        if (target && !target.bannable) return void i.reply({ content: '❌ Bot แบนคนนี้ไม่ได้', ephemeral: true });
        await i.guild.members.ban(user!.id, { reason: audit, deleteMessageSeconds: 7 * 86400 });
        await i.guild.members.unban(user!.id, 'softban');
        return done('SOFTBAN', `softban ${user!.tag} แล้ว (ลบข้อความ 7 วัน)`);
      }
      case 'kick': {
        if (!target?.kickable) return void i.reply({ content: '❌ Bot เตะคนนี้ไม่ได้ หรือเขาไม่อยู่ในเซิร์ฟ', ephemeral: true });
        await target.kick(audit);
        return done('KICK', `เตะ ${user!.tag} แล้ว`);
      }
      case 'timeout': {
        const sec = parseDuration(i.options.getString('duration', true));
        if (!sec || sec > MAX_TIMEOUT_SEC) return void i.reply({ content: '❌ ระยะเวลาไม่ถูกต้อง (เช่น 10m, 2h, 1d สูงสุด 28d)', ephemeral: true });
        if (!target?.moderatable) return void i.reply({ content: '❌ Bot timeout คนนี้ไม่ได้', ephemeral: true });
        await target.timeout(sec * 1000, audit);
        return done('TIMEOUT', `timeout ${user!.tag}`, { durationSec: sec });
      }
      case 'untimeout': {
        if (!target?.moderatable) return void i.reply({ content: '❌ Bot จัดการคนนี้ไม่ได้', ephemeral: true });
        await target.timeout(null, audit);
        return done('UNTIMEOUT', `ยกเลิก timeout ${user!.tag}`);
      }
      case 'warn': {
        await user!.send(`⚠️ คุณได้รับคำเตือนใน **${i.guild.name}**${reason ? `: ${reason}` : ''}`).catch(() => undefined);
        return done('WARN', `เตือน ${user!.tag} แล้ว`);
      }
      case 'warnings': {
        const { guildRefId } = await getSettings(botId, i.guildId);
        const cases = guildRefId ? await prisma.modCase.findMany({ where: { guildRefId, targetUserId: user!.id }, orderBy: { caseNo: 'desc' }, take: 15 }) : [];
        const text = cases.map((c) => `#${c.caseNo} **${c.action}** <t:${Math.floor(c.createdAt.getTime() / 1000)}:R> — ${c.reason || '—'}`).join('\n');
        return void i.reply({ content: text ? `ประวัติของ ${user!.tag}:\n${text}` : `${user!.tag} ไม่มีประวัติ`, ephemeral: true, allowedMentions: { parse: [] } });
      }
      case 'purge': {
        const n = i.options.getInteger('count', true);
        if (!i.channel || !('bulkDelete' in i.channel)) return void i.reply({ content: '❌ ใช้ในห้องนี้ไม่ได้', ephemeral: true });
        const ch = i.channel as TextChannel;
        let msgs = await ch.messages.fetch({ limit: 100 });
        if (user) msgs = msgs.filter((m) => m.author.id === user.id);
        const del = await ch.bulkDelete([...msgs.values()].slice(0, n), true); // true = skip >14d (Discord limit)
        return done('PURGE', `ลบ ${del.size} ข้อความ`, { detail: `#${ch.name}${user ? ` · only ${user.tag}` : ''}` });
      }
      case 'lock':
      case 'unlock': {
        const ch = i.channel;
        if (!ch || ch.type !== ChannelType.GuildText) return void i.reply({ content: '❌ ใช้ได้ในห้องข้อความเท่านั้น', ephemeral: true });
        await ch.permissionOverwrites.edit(i.guild.roles.everyone, { SendMessages: i.commandName === 'lock' ? false : null }, { reason: audit });
        return done(i.commandName.toUpperCase(), `${i.commandName === 'lock' ? '🔒 ล็อก' : '🔓 ปลดล็อก'} #${ch.name}`);
      }
      case 'case': {
        const { guildRefId } = await getSettings(botId, i.guildId);
        const c = guildRefId ? await prisma.modCase.findUnique({ where: { guildRefId_caseNo: { guildRefId, caseNo: i.options.getInteger('number', true) } } }) : null;
        return void i.reply({
          content: c ? `**Case #${c.caseNo} · ${c.action}**\nMember: ${c.targetTag ?? '—'}\nModerator: ${c.moderatorTag}\nReason: ${c.reason || '—'}\n<t:${Math.floor(c.createdAt.getTime() / 1000)}:F>` : 'ไม่พบ case',
          ephemeral: true,
          allowedMentions: { parse: [] },
        });
      }
    }
  } catch (err) {
    logger.warn({ err: (err as Error).message, cmd: i.commandName }, 'command failed');
    const msg = `❌ ทำไม่สำเร็จ: ${(err as Error).message}`.slice(0, 1900);
    if (i.replied || i.deferred) await i.followUp({ content: msg, ephemeral: true }).catch(() => undefined);
    else await i.reply({ content: msg, ephemeral: true }).catch(() => undefined);
  }
}
