import 'server-only';
import { prisma } from '@nexus/db';
import { accessRequestSchema, emailSchema } from '@nexus/shared';
import { baseUrl, serverEnv } from './env';
import { createToken, recentTokens } from './magic';
import { hashPassword } from './password';
import { allow } from './ratelimit';
import { logger } from './logger';

export type ActionResult = { ok: true } | { ok: false; error: string };

/**
 * Public "Request access" form. Creates a PENDING member with a password; the Owner approves it on the Team page.
 * The reply is the same whether or not the email is already known, so the form cannot be used to probe the team.
 */
export async function requestAccess(raw: unknown, ip: string): Promise<ActionResult> {
  const parsed = accessRequestSchema.safeParse(raw);
  if (!parsed.success) return { ok: false, error: parsed.error.issues.map((i) => i.message).join(' · ') };
  if (!(await allow(`req:${ip}`, 5, 3600))) return { ok: false, error: 'ส่งคำขอบ่อยเกินไป ลองใหม่ภายหลัง' };
  const { name, email, password, note } = parsed.data;
  const existing = await prisma.teamMember.findUnique({ where: { email } });
  if (!existing) {
    await prisma.teamMember.create({ data: { email, name, passwordHash: await hashPassword(password), requestNote: note ?? null, status: 'PENDING', role: 'EDITOR' } });
  } else if (existing.status === 'PENDING') {
    await prisma.teamMember.update({ where: { id: existing.id }, data: { name, passwordHash: await hashPassword(password), requestNote: note ?? null } });
  }
  return { ok: true };
}

/**
 * Owner recovery without email: writes a single-use sign-in link to the web service log
 * (visible only to people with access to the Railway project).
 */
export async function ownerRecovery(rawEmail: string): Promise<void> {
  const parsed = emailSchema.safeParse(rawEmail);
  const owner = serverEnv().OWNER_EMAIL;
  if (!parsed.success || !owner || parsed.data !== owner) return;
  let m = await prisma.teamMember.findUnique({ where: { email: owner } });
  m ??= await prisma.teamMember.create({ data: { email: owner, role: 'OWNER', status: 'ACTIVE' } });
  if (m.role !== 'OWNER' || (await recentTokens(owner)) >= 5) return;
  const url = `${baseUrl()}/auth/verify?token=${await createToken(owner, 'LOGIN')}`;
  logger.warn({ email: owner, url }, 'OWNER sign-in link (recovery)');
}
