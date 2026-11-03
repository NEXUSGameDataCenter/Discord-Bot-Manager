import 'server-only';
import { createHash, randomBytes } from 'node:crypto';
import { prisma } from '@nexus/db';

const hash = (t: string) => createHash('sha256').update(t).digest('hex');
const TTL = { LOGIN: 15 * 60_000, INVITE: 7 * 86_400_000 } as const;

/** Returns the raw token (only ever sent in the email / shown once to the owner). Only its hash is stored. */
export async function createToken(email: string, purpose: keyof typeof TTL): Promise<string> {
  const token = randomBytes(32).toString('base64url');
  await prisma.magicToken.create({ data: { tokenHash: hash(token), email, purpose, expiresAt: new Date(Date.now() + TTL[purpose]) } });
  return token;
}

/** Single use, race-safe. Activates an invited member. Returns null for any invalid/expired/used/disabled case. */
export async function consumeToken(token: string) {
  if (!/^[A-Za-z0-9_-]{40,64}$/.test(token)) return null;
  const row = await prisma.magicToken.findUnique({ where: { tokenHash: hash(token) } });
  if (!row || row.usedAt || row.expiresAt < new Date()) return null;
  const claimed = await prisma.magicToken.updateMany({ where: { id: row.id, usedAt: null }, data: { usedAt: new Date() } });
  if (claimed.count !== 1) return null;
  const member = await prisma.teamMember.findUnique({ where: { email: row.email } });
  if (!member || member.status === 'DISABLED') return null;
  return prisma.teamMember.update({ where: { id: member.id }, data: { status: 'ACTIVE', lastLogin: new Date() } });
}

export async function recentTokens(email: string, minutes = 15): Promise<number> {
  return prisma.magicToken.count({ where: { email, createdAt: { gte: new Date(Date.now() - minutes * 60_000) } } });
}
