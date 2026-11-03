import 'server-only';
import { prisma } from '@nexus/db';
import type { RoleMenuInput } from '@nexus/shared';
import { HttpError } from './route';

export async function validateMenu(input: RoleMenuInput) {
  const g = await prisma.guild.findUnique({ where: { id: input.guildRefId }, include: { channels: true, roles: true } });
  if (!g || !g.present) throw new HttpError(400, 'Server not found');
  const ch = g.channels.find((c) => c.channelId === input.channelId);
  if (!ch?.canSend) throw new HttpError(400, 'Bot ส่งข้อความในห้องนี้ไม่ได้');
  for (const o of input.options) {
    const r = g.roles.find((x) => x.roleId === o.roleId);
    if (!r) throw new HttpError(400, 'ไม่พบ role ที่เลือก');
    if (!r.assignable) throw new HttpError(400, `Bot แจก role "${r.name}" ไม่ได้ — ลาก role ของ Bot ให้อยู่สูงกว่า`);
  }
  return g;
}
