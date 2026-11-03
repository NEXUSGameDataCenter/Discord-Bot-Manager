import { prisma } from '@nexus/db';
import { addBotSchema, inviteUrl, inviteBitfield, REQUIRED_PERMISSIONS } from '@nexus/shared';
import { encrypt } from '@nexus/shared/crypto';
import { HttpError, body, route, routeAs } from '@/lib/server/route';
import { queues } from '@/lib/server/queue';
import { serverEnv } from '@/lib/server/env';
import { audit } from '@/lib/server/audit';

export const dynamic = 'force-dynamic';

/** tokenEnc is never selected for responses. */
const botSelect = {
  id: true,
  applicationId: true,
  username: true,
  avatarUrl: true,
  status: true,
  pingMs: true,
  startedAt: true,
  lastError: true,
  desiredRunning: true,
  createdAt: true,
  _count: { select: { guilds: { where: { present: true } } } },
} as const;

export const GET = routeAs('EDITOR', async () => {
  const bots = await prisma.bot.findMany({ select: botSelect, orderBy: { createdAt: 'asc' } });
  return {
    bots: bots.map((b) => ({ ...b, guildCount: b._count.guilds, inviteUrl: inviteUrl(b.applicationId) })),
    permissions: { bitfield: inviteBitfield().toString(), list: REQUIRED_PERMISSIONS },
  };
});

export const POST = route(async (req, { actor }) => {
  const { token } = addBotSchema.parse(await body(req));
  // Validate with GET /users/@me before storing anything.
  const res = await fetch('https://discord.com/api/v10/users/@me', { headers: { Authorization: `Bot ${token}` }, cache: 'no-store' });
  if (res.status === 401) throw new HttpError(400, 'Token ไม่ถูกต้อง (Discord ตอบ 401)');
  if (!res.ok) throw new HttpError(502, `Discord ตอบกลับ ${res.status}`);
  const me = (await res.json()) as { id: string; username: string; bot?: boolean; avatar?: string | null };
  if (!me.bot) throw new HttpError(400, 'Token นี้ไม่ใช่ Bot account — ระบบรองรับเฉพาะ Bot token เท่านั้น');
  const avatarUrl = me.avatar ? `https://cdn.discordapp.com/avatars/${me.id}/${me.avatar}.png?size=128` : null;
  const tokenEnc = encrypt(token, serverEnv().ENCRYPTION_KEY);
  const bot = await prisma.bot.upsert({
    where: { applicationId: me.id },
    create: { applicationId: me.id, username: me.username, avatarUrl, tokenEnc },
    update: { username: me.username, avatarUrl, tokenEnc, lastError: null },
    select: { id: true, username: true },
  });
  await queues.control().add('start', { botId: bot.id, action: 'start' });
  await audit(actor, 'bot.add', { botId: bot.id, username: bot.username }, 'success');
  return { bot };
});
