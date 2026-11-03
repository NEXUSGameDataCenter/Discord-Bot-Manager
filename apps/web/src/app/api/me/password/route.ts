import { prisma } from '@nexus/db';
import { changePasswordSchema } from '@nexus/shared';
import { routeAs, body, HttpError } from '@/lib/server/route';
import { hashPassword, verifyPassword } from '@/lib/server/password';
import { allow } from '@/lib/server/ratelimit';
import { audit } from '@/lib/server/audit';

/** Change own password. The current password is required once one is set. */
export const PUT = routeAs('EDITOR', async (req, { member, actor }) => {
  const { current, next } = changePasswordSchema.parse(await body(req));
  if (!(await allow(`pwchg:${member.id}`, 10, 900))) throw new HttpError(429, 'ลองบ่อยเกินไป รอสักครู่');
  if (member.passwordHash && !(await verifyPassword(current ?? '', member.passwordHash))) throw new HttpError(400, 'รหัสผ่านปัจจุบันไม่ถูกต้อง');
  await prisma.teamMember.update({ where: { id: member.id }, data: { passwordHash: await hashPassword(next) } });
  await audit(actor, 'me.changePassword', { memberId: member.id }, 'success');
  return { ok: true };
});
