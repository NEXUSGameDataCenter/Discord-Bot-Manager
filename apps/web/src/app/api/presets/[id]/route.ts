import { prisma } from '@nexus/db';
import { route } from '@/lib/server/route';
import { audit } from '@/lib/server/audit';

export const DELETE = route(async (_req, { params, actor }) => {
  const p = await prisma.profilePreset.delete({ where: { id: params.id! } });
  await audit(actor, 'preset.delete', { presetId: p.id, name: p.name }, 'success');
  return { ok: true };
});
