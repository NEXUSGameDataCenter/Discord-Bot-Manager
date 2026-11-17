import {
  ButtonStyle,
  ComponentType,
  type APIActionRowComponent,
  type APIMessageActionRowComponent,
  type ButtonInteraction,
  type Client,
  type GuildMember,
  type MessageReaction,
  type PartialMessageReaction,
  type PartialUser,
  type StringSelectMenuInteraction,
  type User,
} from 'discord.js';
import { prisma, type RoleMenu } from '@nexus/db';
import { gateReason, legacyRoleMenu, menuRoleIds, reactionRoleSchema, resolveOption, resolveSelect, type ReactionRoleConfig, type RoleChange } from '@nexus/shared';
import { logger } from '../logger';
import { toApiEmbed } from '../workers/delivery';

const STYLE = { PRIMARY: ButtonStyle.Primary, SECONDARY: ButtonStyle.Secondary, SUCCESS: ButtonStyle.Success, DANGER: ButtonStyle.Danger } as const;

/** The menu's v2 config, converting menus saved before v2. */
export function configOf(m: RoleMenu): ReactionRoleConfig {
  if (m.config) {
    const parsed = reactionRoleSchema.safeParse({ ...(m.config as object), guildRefId: m.guildRefId, name: m.title, enabled: m.enabled, channelId: m.channelId });
    if (parsed.success) return parsed.data;
  }
  return legacyRoleMenu(m);
}

/** "<:name:id>" / "<a:name:id>" → custom emoji; anything else is unicode. */
function parseEmoji(e?: string) {
  if (!e) return undefined;
  const m = e.match(/^<(a)?:(\w+):(\d+)>$/);
  return m ? { id: m[3]!, name: m[2]!, animated: !!m[1] } : { name: e };
}
const emojiKey = (e: string) => e.match(/^<a?:\w+:(\d+)>$/)?.[1] ?? e;

function components(menuId: string, c: ReactionRoleConfig): APIActionRowComponent<APIMessageActionRowComponent>[] {
  if (c.kind === 'BUTTONS')
    return c.rows.map((row, r) => ({
      type: ComponentType.ActionRow,
      components: row.map((b, i) => ({ type: ComponentType.Button, style: STYLE[b.style], label: b.label || undefined, emoji: parseEmoji(b.emoji), custom_id: `rr:${menuId}:b:${r}:${i}` })),
    }));
  if (c.kind === 'SELECT')
    return [
      {
        type: ComponentType.ActionRow,
        components: [
          {
            type: ComponentType.StringSelect,
            custom_id: `rr:${menuId}:s`,
            placeholder: c.select.placeholder,
            min_values: Math.min(c.select.minValues, c.select.options.length),
            max_values: Math.min(c.mode === 'UNIQUE' ? 1 : c.select.maxValues, c.select.options.length),
            options: c.select.options.map((o, i) => ({ label: o.label, description: o.description || undefined, emoji: parseEmoji(o.emoji), value: String(i) })),
          },
        ],
      },
    ];
  return [];
}

/** Post or update the menu message (or attach to an existing one), then add reactions. */
export async function publishRoleMenu(client: Client<true>, menuId: string): Promise<void> {
  const menu = await prisma.roleMenu.findUniqueOrThrow({ where: { id: menuId }, include: { guild: true } });
  try {
    const c = configOf(menu);
    const g = client.guilds.cache.get(menu.guild.guildId);
    const ch = g?.channels.cache.get(menu.channelId);
    if (!g || !ch?.isTextBased() || !('send' in ch)) throw new Error('ไม่พบห้องปลายทาง');
    const comps = components(menu.id, c);
    let msg;
    if (c.messageSource === 'EXISTING') {
      msg = await ch.messages.fetch(c.existingMessageId!).catch(() => null);
      if (!msg) throw new Error('ไม่พบข้อความตาม Message ID ในห้องนี้');
      if (c.kind !== 'REACTIONS') {
        if (msg.author.id !== client.user.id) throw new Error('ปุ่มและ select menu ใส่ได้เฉพาะข้อความที่ Bot ส่งเอง — ใช้ Reactions หรือโพสต์ข้อความใหม่');
        await msg.edit({ components: comps });
      }
    } else {
      const payload = {
        content: c.message.content || undefined,
        embeds: c.message.embeds.map((e) => toApiEmbed(e, new Date())),
        components: comps,
        allowedMentions: { parse: [] as never[] },
      };
      msg = menu.messageId ? await ch.messages.fetch(menu.messageId).catch(() => null) : null;
      if (msg) await msg.edit({ ...payload, content: payload.content ?? '' });
      else msg = await ch.send(payload);
    }
    if (c.kind === 'REACTIONS') {
      const keep = new Set(c.reactions.map((r) => emojiKey(r.emoji)));
      for (const r of msg.reactions.cache.values()) if (!keep.has(r.emoji.id ?? r.emoji.name ?? '')) await r.users.remove(client.user.id).catch(() => undefined);
      for (const r of c.reactions) await msg.react(r.emoji).catch((err) => logger.warn({ err: err.message, emoji: r.emoji }, 'react failed'));
    }
    await prisma.roleMenu.update({ where: { id: menu.id }, data: { messageId: msg.id, status: 'PUBLISHED', lastError: null } });
  } catch (err) {
    await prisma.roleMenu.update({ where: { id: menu.id }, data: { status: 'FAILED', lastError: err instanceof Error ? err.message : String(err) } });
    throw err;
  }
}

/** Applies a change; refuses roles the bot cannot manage. */
async function apply(member: GuildMember, change: RoleChange): Promise<string> {
  if (change.blocked) return change.blocked;
  const botTop = member.guild.members.me?.roles.highest.position ?? 0;
  const bad = [...change.add, ...change.remove].map((id) => member.guild.roles.cache.get(id)).filter((r) => !r || r.managed || r.position >= botTop);
  if (bad.length) return 'Bot จัดการ role นี้ไม่ได้ — ลาก role ของ Bot ให้อยู่สูงกว่า role ที่แจก';
  if (change.remove.length) await member.roles.remove(change.remove, 'Nexus reaction role');
  if (change.add.length) await member.roles.add(change.add, 'Nexus reaction role');
  return [...change.add.map((r) => `ได้รับ <@&${r}>`), ...change.remove.map((r) => `นำออก <@&${r}>`)].join('\n');
}

async function loadMenu(menuId: string) {
  const menu = await prisma.roleMenu.findUnique({ where: { id: menuId } });
  return menu ? { menu, c: configOf(menu) } : null;
}

export async function onRoleButton(i: ButtonInteraction): Promise<void> {
  const [, menuId, kind, r, b] = i.customId.split(':');
  const found = await loadMenu(menuId!);
  if (!found || !i.inCachedGuild()) return void i.reply({ content: 'เมนูนี้ถูกลบแล้ว', ephemeral: true });
  const { menu, c } = found;
  if (!menu.enabled) return void i.reply({ content: 'เมนูนี้ปิดใช้งานอยู่', ephemeral: true });
  // Menus from before v2 used "rr:<menu>:<roleId>".
  const btn = kind === 'b' ? c.rows[Number(r)]?.[Number(b)] : c.rows.flat().find((x) => x.roleIds.includes(kind!));
  if (!btn) return void i.reply({ content: 'ปุ่มนี้ไม่มีแล้ว', ephemeral: true });
  await i.deferReply({ ephemeral: true });
  try {
    const has = [...i.member.roles.cache.keys()];
    const gate = gateReason(c.allowedRoles, c.deniedRoles, has);
    if (gate) return void i.editReply(gate);
    const changed = btn.roleIds.length ? await apply(i.member, resolveOption(c.mode, menuRoleIds(c), btn.roleIds, has)) : '';
    const text = [btn.reply, changed].filter(Boolean).join('\n\n') || 'ไม่มีการเปลี่ยนแปลง';
    await i.editReply({ content: text.slice(0, 2000), allowedMentions: { parse: [] } });
  } catch (err) {
    logger.warn({ err: (err as Error).message }, 'role button failed');
    await i.editReply('เปลี่ยน role ไม่สำเร็จ — แจ้งแอดมินตรวจสิทธิ์ Manage Roles ของ Bot');
  }
}

export async function onRoleSelect(i: StringSelectMenuInteraction): Promise<void> {
  const [, menuId] = i.customId.split(':');
  const found = await loadMenu(menuId!);
  if (!found || !i.inCachedGuild()) return void i.reply({ content: 'เมนูนี้ถูกลบแล้ว', ephemeral: true });
  const { menu, c } = found;
  if (!menu.enabled) return void i.reply({ content: 'เมนูนี้ปิดใช้งานอยู่', ephemeral: true });
  await i.deferReply({ ephemeral: true });
  try {
    const has = [...i.member.roles.cache.keys()];
    const gate = gateReason(c.allowedRoles, c.deniedRoles, has);
    if (gate) return void i.editReply(gate);
    const text = await apply(i.member, resolveSelect(c.mode, c.select.options.map((o) => o.roleIds), i.values.map(Number), has));
    await i.editReply({ content: text || 'ไม่มีการเปลี่ยนแปลง', allowedMentions: { parse: [] } });
  } catch (err) {
    logger.warn({ err: (err as Error).message }, 'role select failed');
    await i.editReply('เปลี่ยน role ไม่สำเร็จ — แจ้งแอดมินตรวจสิทธิ์ Manage Roles ของ Bot');
  }
}

export async function onReaction(r: MessageReaction | PartialMessageReaction, u: User | PartialUser, added: boolean): Promise<void> {
  if (u.bot || !r.message.guildId) return;
  const menu = await prisma.roleMenu.findFirst({ where: { messageId: r.message.id } });
  if (!menu || !menu.enabled) return;
  const c = configOf(menu);
  if (c.kind !== 'REACTIONS') return;
  const key = r.emoji.id ?? r.emoji.name ?? '';
  const opt = c.reactions.find((o) => emojiKey(o.emoji) === key);
  if (!opt) return;
  try {
    const g = r.client.guilds.cache.get(r.message.guildId);
    const member = await g?.members.fetch(u.id);
    if (!member) return;
    const has = [...member.roles.cache.keys()];
    if (gateReason(c.allowedRoles, c.deniedRoles, has)) {
      if (added) await r.users.remove(u.id).catch(() => undefined);
      return;
    }
    const change = resolveOption(c.mode, menuRoleIds(c), opt.roleIds, has, added);
    if (change.blocked) {
      if (added) await r.users.remove(u.id).catch(() => undefined);
      return;
    }
    await apply(member, change);
    // Unique/binding: drop the member's other reactions so the message shows one choice.
    if (added && (c.mode === 'UNIQUE' || c.mode === 'BINDING')) {
      const msg = r.message.partial ? await r.message.fetch() : r.message;
      for (const other of msg.reactions.cache.values()) if ((other.emoji.id ?? other.emoji.name) !== key) await other.users.remove(u.id).catch(() => undefined);
    }
  } catch (err) {
    logger.warn({ err: (err as Error).message }, 'reaction role failed');
  }
}
