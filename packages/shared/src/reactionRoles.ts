import { z } from 'zod';
import { embedSchema, httpUrl, snowflake } from './schemas';
import { LIMITS } from './limits';

/* Reaction roles v2 (modelled on Koya.gg): a full message + reactions, button rows or a select menu. */

export const RR_MODES = {
  NORMAL: { label: 'Normal', hint: 'กดเพื่อรับ กดอีกครั้งเพื่อถอด' },
  UNIQUE: { label: 'Unique', hint: 'ถือได้ role เดียวจากเมนูนี้ เลือกอันใหม่ อันเก่าจะถูกถอด' },
  VERIFY: { label: 'Verify', hint: 'รับได้อย่างเดียว ถอดเองไม่ได้ (เช่น ยืนยันกฎ)' },
  DROP: { label: 'Drop', hint: 'ถอดได้อย่างเดียว' },
  REVERSED: { label: 'Reversed', hint: 'กดเพื่อถอด role กดอีกครั้งเพื่อรับคืน' },
  BINDING: { label: 'Binding', hint: 'เลือกได้ครั้งเดียว เลือกแล้วเปลี่ยนไม่ได้' },
} as const;
export type RrMode = keyof typeof RR_MODES;
export const RR_KINDS = { REACTIONS: 'Reactions', BUTTONS: 'Components (ปุ่ม)', SELECT: 'Select menu' } as const;
export type RrKind = keyof typeof RR_KINDS;

const emoji = z.string().trim().max(64);
const roleIds = z.array(snowflake).max(10).default([]);
const reply = z.string().trim().max(2000).optional();

export const rrReactionSchema = z.object({ emoji: emoji.min(1, 'ต้องใส่ emoji'), roleIds: roleIds });
export const rrButtonSchema = z.object({
  label: z.string().trim().max(80).default(''),
  emoji: emoji.optional(),
  style: z.enum(['PRIMARY', 'SECONDARY', 'SUCCESS', 'DANGER']).default('SECONDARY'),
  roleIds,
  /** Ephemeral text shown to the clicker; with no roles the button only sends this. */
  reply,
  /** Uploaded files (asset ids) and image links sent with the ephemeral reply. */
  replyFiles: z.array(z.string().min(1)).max(10).default([]),
  replyImageUrls: z.array(httpUrl.refine((u) => /^https:\/\//i.test(u), 'ลิงก์รูปต้องเป็น https://')).max(10).default([]),
});
export const rrSelectOptionSchema = z.object({
  label: z.string().trim().min(1, 'ต้องใส่ชื่อตัวเลือก').max(100),
  description: z.string().trim().max(100).optional(),
  emoji: emoji.optional(),
  roleIds,
});

export const reactionRoleSchema = z
  .object({
    guildRefId: z.string().min(1),
    name: z.string().trim().min(1, 'ต้องตั้งชื่อ').max(100),
    enabled: z.boolean().default(true),
    channelId: snowflake,
    mode: z.enum(Object.keys(RR_MODES) as [RrMode, ...RrMode[]]),
    messageSource: z.enum(['NEW', 'EXISTING']).default('NEW'),
    existingMessageId: snowflake.optional(),
    message: z.object({ content: z.string().max(LIMITS.content).default(''), embeds: z.array(embedSchema).max(LIMITS.embeds).default([]) }).default({}),
    kind: z.enum(Object.keys(RR_KINDS) as [RrKind, ...RrKind[]]),
    reactions: z.array(rrReactionSchema).max(20).default([]),
    rows: z.array(z.array(rrButtonSchema).min(1).max(5)).max(5).default([]),
    select: z
      .object({ placeholder: z.string().trim().max(150).default('เลือก role'), minValues: z.number().int().min(0).max(25).default(0), maxValues: z.number().int().min(1).max(25).default(1), options: z.array(rrSelectOptionSchema).max(25).default([]) })
      .default({}),
    allowedRoles: z.array(snowflake).max(25).default([]),
    deniedRoles: z.array(snowflake).max(25).default([]),
  })
  .superRefine((m, ctx) => {
    const issue = (message: string, path: (string | number)[] = []) => ctx.addIssue({ code: 'custom', message, path });
    if (m.messageSource === 'EXISTING' && !m.existingMessageId) issue('ใส่ Message ID ของข้อความที่มีอยู่', ['existingMessageId']);
    if (m.messageSource === 'NEW' && !m.message.content.trim() && !m.message.embeds.length) issue('ข้อความต้องมีเนื้อหาหรือ embed', ['message']);
    if (m.kind === 'REACTIONS') {
      if (!m.reactions.length) issue('เพิ่มอย่างน้อย 1 reaction', ['reactions']);
      const keys = m.reactions.map((r) => r.emoji);
      if (new Set(keys).size !== keys.length) issue('emoji ซ้ำกัน', ['reactions']);
      m.reactions.forEach((r, i) => !r.roleIds.length && issue(`Reaction #${i + 1} ยังไม่ได้เลือก role`, ['reactions', i]));
    }
    if (m.kind === 'BUTTONS') {
      if (!m.rows.length) issue('เพิ่มอย่างน้อย 1 ปุ่ม', ['rows']);
      m.rows.forEach((row, r) =>
        row.forEach((b, c) => {
          if (!b.label && !b.emoji) issue(`ปุ่ม แถว ${r + 1} #${c + 1} ต้องมีชื่อหรือ emoji`, ['rows', r, c]);
          if (b.replyFiles.length + b.replyImageUrls.length > 10) issue(`ปุ่ม แถว ${r + 1} #${c + 1} แนบรูปได้สูงสุด 10`, ['rows', r, c]);
          if (!b.roleIds.length && !b.reply && !b.replyFiles.length && !b.replyImageUrls.length) issue(`ปุ่ม แถว ${r + 1} #${c + 1} ต้องเลือก role หรือใส่ข้อความตอบกลับ`, ['rows', r, c]);
        }),
      );
    }
    if (m.kind === 'SELECT') {
      const s = m.select;
      if (!s.options.length) issue('เพิ่มอย่างน้อย 1 ตัวเลือก', ['select']);
      if (s.minValues > s.maxValues) issue('จำนวนเลือกขั้นต่ำมากกว่าสูงสุด', ['select']);
      if (s.maxValues > Math.max(1, s.options.length)) issue('จำนวนเลือกสูงสุดเกินจำนวนตัวเลือก', ['select']);
      s.options.forEach((o, i) => !o.roleIds.length && issue(`ตัวเลือก #${i + 1} ยังไม่ได้เลือก role`, ['select', i]));
    }
    if (m.kind !== 'REACTIONS' && m.messageSource === 'EXISTING') {
      // Components can only be attached to the bot's own message; checked again by the bot.
    }
  });
export type ReactionRoleInput = z.infer<typeof reactionRoleSchema>;
export type ReactionRoleConfig = Omit<ReactionRoleInput, 'guildRefId' | 'name' | 'enabled' | 'channelId'>;

/** Every role a menu can hand out, de-duplicated. */
export function menuRoleIds(c: ReactionRoleConfig): string[] {
  const all = c.kind === 'REACTIONS' ? c.reactions.flatMap((r) => r.roleIds) : c.kind === 'BUTTONS' ? c.rows.flat().flatMap((b) => b.roleIds) : c.select.options.flatMap((o) => o.roleIds);
  return [...new Set(all)];
}

/** Converts a menu saved before v2 (title/description/type/mode/options columns). */
export function legacyRoleMenu(m: { title: string; description: string; color: number; type: string; mode: string; options: unknown }): ReactionRoleConfig {
  const opts = (Array.isArray(m.options) ? m.options : []) as { roleId: string; label: string; emoji?: string; style?: 'PRIMARY' | 'SECONDARY' | 'SUCCESS' | 'DANGER' }[];
  const mode = ({ TOGGLE: 'NORMAL', UNIQUE: 'UNIQUE', ADD_ONLY: 'VERIFY', REMOVE_ONLY: 'DROP' } as Record<string, RrMode>)[m.mode] ?? 'NORMAL';
  const lines = opts.map((o) => `${o.emoji ?? '•'} <@&${o.roleId}> — ${o.label}`).join('\n');
  const base: ReactionRoleConfig = {
    mode, messageSource: 'NEW', message: { content: '', embeds: [{ title: m.title, description: [m.description, lines].filter(Boolean).join('\n\n').slice(0, 4096), color: m.color, fields: [] }] },
    kind: m.type === 'REACTION' ? 'REACTIONS' : 'BUTTONS', reactions: [], rows: [], select: { placeholder: 'เลือก role', minValues: 0, maxValues: 1, options: [] }, allowedRoles: [], deniedRoles: [],
  };
  if (base.kind === 'REACTIONS') base.reactions = opts.map((o) => ({ emoji: o.emoji ?? '', roleIds: [o.roleId] }));
  else for (let i = 0; i < opts.length; i += 5) base.rows.push(opts.slice(i, i + 5).map((o) => ({ label: o.label, emoji: o.emoji, style: o.style ?? 'SECONDARY', roleIds: [o.roleId], replyFiles: [], replyImageUrls: [] })));
  return base;
}

export type RoleChange = { add: string[]; remove: string[]; blocked?: string };

/**
 * What to change when a member uses one option.
 * `added`: reaction added (true) / removed (false); undefined for buttons (toggle by current state).
 */
export function resolveOption(mode: RrMode, menuRoles: string[], optionRoles: string[], has: string[], added?: boolean): RoleChange {
  const hasSet = new Set(has);
  const owned = optionRoles.filter((r) => hasSet.has(r));
  const missing = optionRoles.filter((r) => !hasSet.has(r));
  const holdsAll = !missing.length;
  const otherHeld = menuRoles.filter((r) => hasSet.has(r) && !optionRoles.includes(r));
  const on = added ?? !holdsAll; // the user wants the option "on"
  switch (mode) {
    case 'NORMAL':
      return on ? { add: missing, remove: [] } : { add: [], remove: owned };
    case 'UNIQUE':
      return on ? { add: missing, remove: otherHeld } : { add: [], remove: owned };
    case 'VERIFY':
      return { add: on ? missing : [], remove: [] };
    case 'DROP':
      return { add: [], remove: added === false ? [] : owned };
    case 'REVERSED':
      if (added === undefined) return holdsAll ? { add: [], remove: owned } : { add: missing, remove: [] };
      return added ? { add: [], remove: owned } : { add: missing, remove: [] };
    case 'BINDING':
      if (added === false) return { add: [], remove: [] };
      if (otherHeld.length || (holdsAll && optionRoles.length)) return { add: [], remove: [], blocked: 'คุณเลือกไปแล้ว เมนูนี้เปลี่ยนไม่ได้' };
      return { add: missing, remove: [] };
  }
}

/** Select menus: the member's picked options replace their previous picks within the menu. */
export function resolveSelect(mode: RrMode, options: string[][], picked: number[], has: string[]): RoleChange {
  const hasSet = new Set(has);
  const menuRoles = [...new Set(options.flat())];
  const want = new Set(picked.flatMap((i) => options[i] ?? []));
  const held = menuRoles.filter((r) => hasSet.has(r));
  const add = [...want].filter((r) => !hasSet.has(r));
  const drop = held.filter((r) => !want.has(r));
  switch (mode) {
    case 'NORMAL':
    case 'UNIQUE':
      return { add, remove: drop };
    case 'VERIFY':
      return { add, remove: [] };
    case 'DROP':
      return { add: [], remove: [...want].filter((r) => hasSet.has(r)) };
    case 'REVERSED':
      return { add: [], remove: [...want].filter((r) => hasSet.has(r)) };
    case 'BINDING':
      return held.length ? { add: [], remove: [], blocked: 'คุณเลือกไปแล้ว เมนูนี้เปลี่ยนไม่ได้' } : { add, remove: [] };
  }
}

/** Allowed/denied role gate. Returns a reason when the member may not use the menu. */
export function gateReason(allowed: string[], denied: string[], has: string[]): string | null {
  if (denied.some((r) => has.includes(r))) return 'คุณมี role ที่ไม่ได้รับอนุญาตให้ใช้เมนูนี้';
  if (allowed.length && !allowed.some((r) => has.includes(r))) return 'เมนูนี้ใช้ได้เฉพาะสมาชิกที่มี role ที่กำหนด';
  return null;
}
