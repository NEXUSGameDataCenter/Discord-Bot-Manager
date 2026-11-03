import { prisma } from '@nexus/db';
import { PERMISSION_FIX, type PermName } from '@nexus/shared';
import { route } from '@/lib/server/route';

export const dynamic = 'force-dynamic';

export const GET = route(async (req) => {
  const url = new URL(req.url);
  const botId = url.searchParams.get('botId') ?? undefined;
  const guilds = await prisma.guild.findMany({
    where: { present: true, ...(botId ? { botId } : {}) },
    orderBy: { name: 'asc' },
    include: {
      profile: { select: { status: true, lastError: true, lastAppliedAt: true } },
      channels: { where: { canSend: true }, select: { channelId: true, name: true, type: true }, orderBy: { position: 'asc' } },
    },
  });
  return {
    guilds: guilds.map((g) => ({
      id: g.id,
      botId: g.botId,
      guildId: g.guildId,
      name: g.name,
      iconUrl: g.iconUrl,
      memberCount: g.memberCount,
      joinedAt: g.joinedAt,
      defaultChannelId: g.defaultChannelId,
      customVars: g.customVars,
      profileStatus: g.profile?.status ?? null,
      profileError: g.profile?.lastError ?? null,
      missingPerms: g.missingPerms.map((p) => ({ name: p, fix: PERMISSION_FIX[p as PermName] ?? '' })),
      sendableChannels: g.channels,
    })),
  };
});
