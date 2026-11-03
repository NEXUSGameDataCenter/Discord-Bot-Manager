import { prisma } from '@nexus/db';
import { presetSchema } from '@nexus/shared';
import { body, route, routeAs } from '@/lib/server/route';
import { audit } from '@/lib/server/audit';

export const dynamic = 'force-dynamic';

export const GET = routeAs('EDITOR', async () => ({ presets: await prisma.profilePreset.findMany({ orderBy: { createdAt: 'asc' } }) }));

export const POST = route(async (req, { actor }) => {
  const input = presetSchema.parse(await body(req));
  const preset = await prisma.profilePreset.upsert({ where: { name: input.name }, create: input, update: input });
  await audit(actor, 'preset.save', { presetId: preset.id, name: preset.name }, 'success');
  return { preset };
});
