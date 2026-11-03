import { z } from 'zod';
import { snowflake } from './schemas';

/* ------------------------------ Welcome / autorole ------------------------------ */

export const autoRoleSchema = z.object({
  roleId: snowflake,
  target: z.enum(['human', 'bot', 'all']).default('human'),
  /** Koya-style optional delay before the role is given (0 = immediately), max 24h */
  delaySec: z.number().int().min(0).max(86_400).default(0),
});
export type AutoRole = z.infer<typeof autoRoleSchema>;

export const HONEYPOT_ACTIONS = ['alert', 'timeout', 'kick', 'softban', 'ban'] as const;
export type HoneypotAction = (typeof HONEYPOT_ACTIONS)[number];

export const guildSettingsSchema = z.object({
  welcomeEnabled: z.boolean(),
  welcomeChannelId: snowflake.nullable(),
  welcomeMessage: z.string().max(1500),
  welcomeDmEnabled: z.boolean(),
  welcomeDmMessage: z.string().max(1500),
  goodbyeEnabled: z.boolean(),
  goodbyeChannelId: snowflake.nullable(),
  goodbyeMessage: z.string().max(1500),
  autoRoles: z.array(autoRoleSchema).max(10),
  modLogChannelId: snowflake.nullable(),
  reasonPresets: z.array(z.string().trim().min(1).max(200)).max(20),
  honeypotEnabled: z.boolean(),
  honeypotChannelId: snowflake.nullable(),
  honeypotAction: z.enum(HONEYPOT_ACTIONS),
  honeypotExemptRoleIds: z.array(snowflake).max(25),
}).superRefine((s, ctx) => {
  if (s.welcomeEnabled && !s.welcomeChannelId) ctx.addIssue({ code: 'custom', message: 'เลือกห้องต้อนรับก่อนเปิด Welcome', path: ['welcomeChannelId'] });
  if (s.goodbyeEnabled && !s.goodbyeChannelId) ctx.addIssue({ code: 'custom', message: 'เลือกห้องก่อนเปิด Goodbye', path: ['goodbyeChannelId'] });
  if (s.honeypotEnabled && !s.honeypotChannelId) ctx.addIssue({ code: 'custom', message: 'เลือกห้อง Honeypot ก่อนเปิดใช้งาน', path: ['honeypotChannelId'] });
  if (s.honeypotChannelId && (s.honeypotChannelId === s.welcomeChannelId || s.honeypotChannelId === s.modLogChannelId))
    ctx.addIssue({ code: 'custom', message: 'ห้อง Honeypot ต้องเป็นห้องแยก ไม่ซ้ำกับห้องต้อนรับหรือ mod log', path: ['honeypotChannelId'] });
  const ids = s.autoRoles.map((r) => r.roleId);
  if (new Set(ids).size !== ids.length) ctx.addIssue({ code: 'custom', message: 'Auto role ซ้ำกัน', path: ['autoRoles'] });
});
export type GuildSettingsInput = z.infer<typeof guildSettingsSchema>;

export interface MemberContext {
  userId: string;
  username: string;
  displayName: string;
  serverName: string;
  memberCount: number;
}

export const MEMBER_VARIABLES = ['{user.mention}', '{user.name}', '{user}', '{server.name}', '{memberCount}'] as const;

/** Single-pass, like renderTemplate: substituted values are never re-scanned. */
export function renderMemberTemplate(input: string, m: MemberContext): string {
  return input.replace(/\{([a-zA-Z.]+)\}/g, (match, key: string) => {
    switch (key) {
      case 'user.mention':
        return `<@${m.userId}>`;
      case 'user':
      case 'user.name':
        return m.displayName || m.username;
      case 'server.name':
        return m.serverName;
      case 'memberCount':
        return m.memberCount.toLocaleString('en-US');
      default:
        return match;
    }
  });
}

/** Which auto roles apply to a joining member. */
export function autoRolesFor(roles: AutoRole[], isBot: boolean): AutoRole[] {
  return roles.filter((r) => r.target === 'all' || (isBot ? r.target === 'bot' : r.target === 'human'));
}

/* --------------------------------- Reaction roles --------------------------------- */

export const ROLE_MENU_MODES = ['TOGGLE', 'UNIQUE', 'ADD_ONLY', 'REMOVE_ONLY'] as const;
export type RoleMenuMode = (typeof ROLE_MENU_MODES)[number];

export const roleMenuOptionSchema = z.object({
  roleId: snowflake,
  label: z.string().trim().min(1).max(80),
  /** Unicode emoji or custom <:name:id> */
  emoji: z.string().trim().max(64).optional(),
  style: z.enum(['PRIMARY', 'SECONDARY', 'SUCCESS', 'DANGER']).default('SECONDARY'),
});
export type RoleMenuOption = z.infer<typeof roleMenuOptionSchema>;

export const roleMenuSchema = z
  .object({
    guildRefId: z.string().min(1),
    channelId: snowflake,
    title: z.string().trim().min(1).max(256),
    description: z.string().max(2000).default(''),
    color: z.number().int().min(0).max(0xffffff).default(0x6366f1),
    type: z.enum(['BUTTON', 'REACTION']),
    mode: z.enum(ROLE_MENU_MODES),
    options: z.array(roleMenuOptionSchema).min(1).max(20),
  })
  .superRefine((m, ctx) => {
    const ids = m.options.map((o) => o.roleId);
    if (new Set(ids).size !== ids.length) ctx.addIssue({ code: 'custom', message: 'มี role ซ้ำในเมนู', path: ['options'] });
    if (m.type === 'REACTION') {
      if (m.options.some((o) => !o.emoji)) ctx.addIssue({ code: 'custom', message: 'โหมด Reaction ต้องใส่ emoji ทุกตัวเลือก', path: ['options'] });
      const em = m.options.map((o) => o.emoji);
      if (new Set(em).size !== em.length) ctx.addIssue({ code: 'custom', message: 'emoji ซ้ำกัน', path: ['options'] });
    }
    if (m.type === 'BUTTON' && m.options.length > 25) ctx.addIssue({ code: 'custom', message: 'ปุ่มได้สูงสุด 25', path: ['options'] });
  });
export type RoleMenuInput = z.infer<typeof roleMenuSchema>;

/**
 * Pure decision for a role-menu interaction.
 * `pressed` = the option clicked (button) or reacted; `added` = reaction added (true) / removed (false), undefined for buttons.
 */
export function resolveRoleMenu(
  mode: RoleMenuMode,
  menuRoleIds: string[],
  memberRoleIds: string[],
  pressed: string,
  added?: boolean,
): { add: string[]; remove: string[] } {
  const has = memberRoleIds.includes(pressed);
  // Reactions: "added" says what the user wants. Buttons: toggle semantics.
  const wantsRole = added ?? !has;
  switch (mode) {
    case 'ADD_ONLY':
      return { add: wantsRole && !has ? [pressed] : [], remove: [] };
    case 'REMOVE_ONLY':
      return { add: [], remove: (added === undefined ? has : added && has) ? [pressed] : [] };
    case 'UNIQUE':
      if (!wantsRole) return { add: [], remove: has ? [pressed] : [] };
      return { add: has ? [] : [pressed], remove: menuRoleIds.filter((r) => r !== pressed && memberRoleIds.includes(r)) };
    case 'TOGGLE':
    default:
      if (wantsRole) return { add: has ? [] : [pressed], remove: [] };
      return { add: [], remove: has ? [pressed] : [] };
  }
}

/* ------------------------------------ Moderation ------------------------------------ */

/** "10m", "2h", "1d", "1h30m" → seconds. Discord timeout max = 28 days. */
export function parseDuration(input: string): number | null {
  const s = input.trim().toLowerCase();
  if (!/^(\d+\s*[smhdw]\s*)+$/.test(s)) return null;
  const mult: Record<string, number> = { s: 1, m: 60, h: 3600, d: 86400, w: 604800 };
  let total = 0;
  for (const m of s.matchAll(/(\d+)\s*([smhdw])/g)) total += Number(m[1]) * mult[m[2]!]!;
  return total > 0 ? total : null;
}
export const MAX_TIMEOUT_SEC = 28 * 86400;

/**
 * Role hierarchy rule Discord enforces: you can only act on members strictly below you.
 * Returns a human reason when not allowed, or null when allowed.
 */
export function hierarchyBlock(p: {
  actorId: string;
  actorTop: number;
  botTop: number;
  targetId: string;
  targetTop: number;
  ownerId: string;
}): string | null {
  if (p.targetId === p.ownerId) return 'ไม่สามารถดำเนินการกับเจ้าของเซิร์ฟเวอร์ได้';
  if (p.targetId === p.actorId) return 'ไม่สามารถดำเนินการกับตัวเองได้';
  if (p.actorId !== p.ownerId && p.targetTop >= p.actorTop) return 'role ของเป้าหมายสูงกว่าหรือเท่ากับของคุณ';
  if (p.targetTop >= p.botTop) return 'role ของเป้าหมายสูงกว่าหรือเท่ากับ role ของ Bot — ลาก role ของ Bot ขึ้นไปให้สูงกว่า';
  return null;
}

/** Honeypot: should this message trigger? Bots, admins, owner and exempt roles never trigger. */
export function honeypotTriggers(p: {
  enabled: boolean;
  honeypotChannelId: string | null;
  channelId: string;
  authorIsBot: boolean;
  authorIsOwner: boolean;
  authorIsAdmin: boolean;
  authorRoleIds: string[];
  exemptRoleIds: string[];
}): boolean {
  if (!p.enabled || !p.honeypotChannelId || p.channelId !== p.honeypotChannelId) return false;
  if (p.authorIsBot || p.authorIsOwner || p.authorIsAdmin) return false;
  return !p.authorRoleIds.some((r) => p.exemptRoleIds.includes(r));
}
