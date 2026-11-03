import { z } from 'zod';

export const TEAM_ROLES = ['OWNER', 'ADMIN', 'EDITOR'] as const;
export type TeamRole = (typeof TEAM_ROLES)[number];
const RANK: Record<TeamRole, number> = { EDITOR: 1, ADMIN: 2, OWNER: 3 };

/** true when `have` is at least `need` (OWNER > ADMIN > EDITOR). */
export function hasRole(have: TeamRole, need: TeamRole): boolean {
  return RANK[have] >= RANK[need];
}

export const ROLE_LABEL: Record<TeamRole, string> = {
  OWNER: 'Owner — ทำได้ทุกอย่าง รวมถึงเชิญ/ลบสมาชิกทีม',
  ADMIN: 'Admin — จัดการ Bot, Server, โมดูล และประกาศ (ยกเว้นจัดการทีม)',
  EDITOR: 'Editor — สร้าง/ส่ง/ตั้งเวลาประกาศ และดูข้อมูล (จัดการ Bot หรือลงโทษสมาชิกไม่ได้)',
};

export const emailSchema = z.string().trim().toLowerCase().email('อีเมลไม่ถูกต้อง').max(254);

export const inviteSchema = z.object({ email: emailSchema, role: z.enum(['ADMIN', 'EDITOR']) });

export const memberPatchSchema = z
  .object({ role: z.enum(['ADMIN', 'EDITOR']).optional(), status: z.enum(['ENABLED', 'DISABLED']).optional() })
  .refine((p) => p.role || p.status, 'Nothing to change');

export const meSchema = z.object({
  name: z.string().trim().min(1, 'ใส่ชื่อที่แสดง').max(40).nullable(),
  avatarAssetId: z.string().min(1).nullable(),
});
