import 'server-only';
import { prisma, type Prisma, type RoleMenu } from '@nexus/db';
import { legacyRoleMenu, menuRoleIds, reactionRoleSchema, type ReactionRoleInput } from '@nexus/shared';
import { HttpError } from './route';

export async function validateMenu(input: ReactionRoleInput) {
  const g = await prisma.guild.findUnique({ where: { id: input.guildRefId }, include: { channels: true, roles: true } });
  if (!g || !g.present) throw new HttpError(400, 'Server not found');
  const ch = g.channels.find((c) => c.channelId === input.channelId);
  if (!ch?.canSend) throw new HttpError(400, 'Bot ส่งข้อความในห้องนี้ไม่ได้');
  for (const id of menuRoleIds(input)) {
    const r = g.roles.find((x) => x.roleId === id);
    if (!r) throw new HttpError(400, 'ไม่พบ role ที่เลือก');
    if (!r.assignable) throw new HttpError(400, `Bot แจก role "${r.name}" ไม่ได้ — ลาก role ของ Bot ให้อยู่สูงกว่า`);
  }
  return g;
}

/** Columns for a v2 menu; legacy columns get neutral values. */
export function toRow(input: ReactionRoleInput) {
  const { guildRefId, name, enabled, channelId, ...config } = input;
  return { guildRefId, channelId, title: name, enabled, config: config as unknown as Prisma.InputJsonValue, type: input.kind, mode: input.mode, options: [] as Prisma.InputJsonValue, description: '' };
}

/** A stored menu as the editor's input shape (legacy menus converted). */
export function toInput(m: RoleMenu): ReactionRoleInput & { id: string; status: string; lastError: string | null; messageId: string | null } {
  const base = { guildRefId: m.guildRefId, name: m.title, enabled: m.enabled, channelId: m.channelId };
  const parsed = m.config ? reactionRoleSchema.safeParse({ ...(m.config as object), ...base }) : null;
  const data = parsed?.success ? parsed.data : { ...base, ...legacyRoleMenu(m) };
  return { ...data, id: m.id, status: m.status, lastError: m.lastError, messageId: m.messageId };
}
