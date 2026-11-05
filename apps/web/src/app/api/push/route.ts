import { z } from 'zod';
import { prisma } from '@nexus/db';
import { routeAs, body } from '@/lib/server/route';

export const dynamic = 'force-dynamic';

const subSchema = z.object({ endpoint: z.string().url().max(1000), keys: z.object({ p256dh: z.string().min(10).max(200), auth: z.string().min(8).max(100) }) });

/** Register this browser for Web Push (re-registering moves it to the current member). */
export const POST = routeAs('EDITOR', async (req, { member }) => {
  const s = subSchema.parse(await body(req));
  const userAgent = req.headers.get('user-agent')?.slice(0, 300) ?? null;
  await prisma.pushSubscription.upsert({
    where: { endpoint: s.endpoint },
    create: { email: member.email, endpoint: s.endpoint, p256dh: s.keys.p256dh, auth: s.keys.auth, userAgent },
    update: { email: member.email, p256dh: s.keys.p256dh, auth: s.keys.auth, userAgent },
  });
  return { ok: true };
});

const delSchema = z.object({ id: z.string().optional(), endpoint: z.string().optional() });

export const DELETE = routeAs('EDITOR', async (req, { member }) => {
  const { id, endpoint } = delSchema.parse(await body(req));
  await prisma.pushSubscription.deleteMany({ where: { email: member.email, ...(id ? { id } : { endpoint: endpoint ?? '__none__' }) } });
  return { ok: true };
});
