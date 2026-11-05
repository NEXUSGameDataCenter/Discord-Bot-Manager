import { z } from 'zod';
import { prisma, type Prisma } from '@nexus/db';
import { NOTIFY_KINDS, resolvePrefs, type NotifyKind } from '@nexus/shared';
import { routeAs, body } from '@/lib/server/route';
import { serverEnv } from '@/lib/server/env';

export const dynamic = 'force-dynamic';

export const GET = routeAs('EDITOR', async (_req, { member }) => {
  const devices = await prisma.pushSubscription.findMany({ where: { email: member.email }, select: { id: true, endpoint: true, userAgent: true, createdAt: true }, orderBy: { createdAt: 'desc' } });
  return { prefs: resolvePrefs(member.notifyPrefs), devices, vapidPublicKey: serverEnv().VAPID_PUBLIC_KEY ?? null };
});

const flags = z.object(Object.fromEntries(Object.keys(NOTIFY_KINDS).map((k) => [k, z.boolean().optional()])) as Record<NotifyKind, z.ZodOptional<z.ZodBoolean>>);
const hhmm = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/);
const prefsSchema = z.object({ web: flags, push: flags, quiet: z.object({ on: z.boolean(), start: hhmm, end: hhmm, urgentAlways: z.boolean() }) });

export const PUT = routeAs('EDITOR', async (req, { member }) => {
  const prefs = prefsSchema.parse(await body(req));
  await prisma.teamMember.update({ where: { id: member.id }, data: { notifyPrefs: prefs as unknown as Prisma.InputJsonValue } });
  return { prefs: resolvePrefs(prefs) };
});
