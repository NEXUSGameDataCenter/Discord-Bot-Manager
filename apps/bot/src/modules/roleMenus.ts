import {
  ButtonStyle,
  ComponentType,
  EmbedBuilder,
  type ButtonInteraction,
  type Client,
  type MessageReaction,
  type PartialMessageReaction,
  type PartialUser,
  type User,
  type APIActionRowComponent,
  type APIButtonComponent,
} from 'discord.js';
import { prisma } from '@nexus/db';
import { resolveRoleMenu, roleMenuOptionSchema, type RoleMenuMode, type RoleMenuOption } from '@nexus/shared';
import { z } from 'zod';
import { logger } from '../logger';

const STYLE: Record<RoleMenuOption['style'], ButtonStyle> = { PRIMARY: ButtonStyle.Primary, SECONDARY: ButtonStyle.Secondary, SUCCESS: ButtonStyle.Success, DANGER: ButtonStyle.Danger };
const opts = (j: unknown) => z.array(roleMenuOptionSchema).parse(j);

/** Matches "<:name:id>" / "<a:name:id>" custom emoji; otherwise unicode. */
function emojiKey(e: string): string {
  return e.match(/^<a?:\w+:(\d+)>$/)?.[1] ?? e;
}
function parseEmoji(e?: string) {
  if (!e) return undefined;
  const m = e.match(/^<(a)?:(\w+):(\d+)>$/);
  return m ? { id: m[3]!, name: m[2]!, animated: !!m[1] } : { name: e };
}

/** Post or update the menu message. Reaction menus get their emojis added. */
export async function publishRoleMenu(client: Client<true>, menuId: string): Promise<void> {
  const menu = await prisma.roleMenu.findUniqueOrThrow({ where: { id: menuId }, include: { guild: true } });
  try {
    const g = client.guilds.cache.get(menu.guild.guildId);
    const ch = g?.channels.cache.get(menu.channelId);
    if (!g || !ch?.isTextBased() || !('send' in ch)) throw new Error('ไม่พบห้องปลายทาง');
    const options = opts(menu.options);
    const embed = new EmbedBuilder().setTitle(menu.title).setColor(menu.color);
    const lines = options.map((o) => `${o.emoji ?? '•'} <@&${o.roleId}> — ${o.label}`).join('\n');
    embed.setDescription([menu.description, lines].filter(Boolean).join('\n\n').slice(0, 4096));
    const components: APIActionRowComponent<APIButtonComponent>[] = [];
    if (menu.type === 'BUTTON') {
      for (let i = 0; i < options.length; i += 5)
        components.push({
          type: ComponentType.ActionRow,
          components: options.slice(i, i + 5).map((o) => ({ type: ComponentType.Button, style: STYLE[o.style], label: o.label, emoji: parseEmoji(o.emoji), custom_id: `rr:${menu.id}:${o.roleId}` })),
        });
    }
    const payload = { embeds: [embed], components, allowedMentions: { parse: [] as never[] } };
    let msg = menu.messageId ? await ch.messages.fetch(menu.messageId).catch(() => null) : null;
    if (msg) await msg.edit(payload);
    else msg = await ch.send(payload);
    if (menu.type === 'REACTION') {
      await msg.reactions.removeAll().catch(() => undefined);
      for (const o of options) await msg.react(o.emoji!).catch((err) => logger.warn({ err: err.message, emoji: o.emoji }, 'react failed'));
    }
    await prisma.roleMenu.update({ where: { id: menu.id }, data: { messageId: msg.id, status: 'PUBLISHED', lastError: null } });
  } catch (err) {
    await prisma.roleMenu.update({ where: { id: menu.id }, data: { status: 'FAILED', lastError: err instanceof Error ? err.message : String(err) } });
    throw err;
  }
}

async function apply(guildId: string, client: Client<true>, userId: string, menuMode: string, menuRoles: string[], pressed: string, added?: boolean) {
  const g = client.guilds.cache.get(guildId);
  if (!g) return { text: 'ไม่พบเซิร์ฟเวอร์' };
  const m = await g.members.fetch(userId);
  const botTop = g.members.me?.roles.highest.position ?? 0;
  const role = g.roles.cache.get(pressed);
  if (!role || role.managed || role.position >= botTop) return { text: 'Bot ไม่สามารถจัดการ role นี้ได้ (ตรวจลำดับ role ของ Bot)' };
  const { add, remove } = resolveRoleMenu(menuMode as RoleMenuMode, menuRoles, [...m.roles.cache.keys()], pressed, added);
  if (remove.length) await m.roles.remove(remove, 'Nexus role menu');
  if (add.length) await m.roles.add(add, 'Nexus role menu');
  const t = [...add.map((r) => `✅ ได้รับ <@&${r}>`), ...remove.map((r) => `➖ นำออก <@&${r}>`)].join('\n');
  return { text: t || 'ไม่มีการเปลี่ยนแปลง' };
}

export async function onRoleButton(i: ButtonInteraction): Promise<void> {
  const [, menuId, roleId] = i.customId.split(':');
  const menu = await prisma.roleMenu.findUnique({ where: { id: menuId! } });
  if (!menu || !i.guildId) return void i.reply({ content: 'เมนูนี้ถูกลบแล้ว', ephemeral: true });
  await i.deferReply({ ephemeral: true });
  try {
    const res = await apply(i.guildId, i.client, i.user.id, menu.mode, opts(menu.options).map((o) => o.roleId), roleId!);
    await i.editReply({ content: res.text, allowedMentions: { parse: [] } });
  } catch (err) {
    logger.warn({ err: (err as Error).message }, 'role button failed');
    await i.editReply('เปลี่ยน role ไม่สำเร็จ — แจ้งแอดมินตรวจสิทธิ์ Manage Roles ของ Bot');
  }
}

export async function onReaction(r: MessageReaction | PartialMessageReaction, u: User | PartialUser, added: boolean): Promise<void> {
  if (u.bot) return;
  const menu = await prisma.roleMenu.findFirst({ where: { messageId: r.message.id, type: 'REACTION' } });
  if (!menu || !r.message.guildId) return;
  const key = r.emoji.id ?? r.emoji.name ?? '';
  const options = opts(menu.options);
  const opt = options.find((o) => o.emoji && emojiKey(o.emoji) === key);
  if (!opt) return;
  try {
    await apply(r.message.guildId, r.client, u.id, menu.mode, options.map((o) => o.roleId), opt.roleId, added);
    // UNIQUE: drop the user's other reactions so the menu reflects the single choice.
    if (added && menu.mode === 'UNIQUE') {
      const msg = r.message.partial ? await r.message.fetch() : r.message;
      for (const other of msg.reactions.cache.values()) if ((other.emoji.id ?? other.emoji.name) !== key) await other.users.remove(u.id).catch(() => undefined);
    }
  } catch (err) {
    logger.warn({ err: (err as Error).message }, 'reaction role failed');
  }
}
