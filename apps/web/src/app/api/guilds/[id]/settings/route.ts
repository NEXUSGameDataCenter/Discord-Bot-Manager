import { prisma } from '@nexus/db';
import { CONFIG_CHANNEL, guildSettingsSchema } from '@nexus/shared';
import { route, body, notFound, HttpError } from '@/lib/server/route';
import { redis } from '@/lib/server/queue';
import { audit } from '@/lib/server/audit';

export const dynamic = 'force-dynamic';

export const GET = route(async (_req, { params }) => {
  const g = (await prisma.guild.findUnique({ where: { id: params.id! }, include: { settings: true } })) ?? notFound('Server not found');
  return { settings: g.settings, guild: { id: g.id, name: g.name, missingPerms: g.missingPerms } };
});

export const PUT = route(async (req, { params, actor }) => {
  const input = guildSettingsSchema.parse(await body(req));
  const g = (await prisma.guild.findUnique({ where: { id: params.id! }, include: { channels: true, roles: true } })) ?? notFound('Server not found');
  // Every chosen channel/role must exist in this server (never trust the browser).
  const chIds = new Set(g.channels.map((c) => c.channelId));
  for (const [k, v] of Object.entries({ welcome: input.welcomeChannelId, goodbye: input.goodbyeChannelId, modlog: input.modLogChannelId, honeypot: input.honeypotChannelId }))
    if (v && !chIds.has(v)) throw new HttpError(400, `ห้อง ${k} ไม่พบหรือ Bot มองไม่เห็น`);
  const roleMap = new Map(g.roles.map((r) => [r.roleId, r]));
  for (const ar of input.autoRoles) {
    const r = roleMap.get(ar.roleId);
    if (!r) throw new HttpError(400, 'ไม่พบ role ที่เลือก');
    if (!r.assignable) throw new HttpError(400, `Bot แจก role "${r.name}" ไม่ได้ — ลาก role ของ Bot ให้อยู่สูงกว่า`);
  }
  for (const id of input.honeypotExemptRoleIds) if (!roleMap.has(id)) throw new HttpError(400, 'ไม่พบ exempt role');
  await prisma.guildSettings.upsert({ where: { guildRefId: g.id }, create: { guildRefId: g.id, ...input }, update: input });
  await redis().publish(CONFIG_CHANNEL, g.id); // bot drops its cached settings
  await audit(actor, 'guild.settings', { servers: 1, guildRefId: g.id, name: g.name }, 'success', {
    welcome: input.welcomeEnabled, goodbye: input.goodbyeEnabled, autoRoles: input.autoRoles.length, honeypot: input.honeypotEnabled ? input.honeypotAction : 'off',
  });
  return { ok: true };
});
