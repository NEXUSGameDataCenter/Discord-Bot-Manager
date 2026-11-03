import { prisma } from '@nexus/db';
import { route, notFound } from '@/lib/server/route';
import { assetStore } from '@/lib/server/env';

export const runtime = 'nodejs';

export const GET = route(async (_req, { params }) => {
  const a = (await prisma.asset.findUnique({ where: { id: params.id! } })) ?? notFound('Asset not found');
  const buf = await assetStore().get(a.storedAs);
  const inline = a.kind === 'image';
  return new Response(new Uint8Array(buf), {
    headers: {
      'content-type': inline ? a.mime : 'application/octet-stream',
      'content-disposition': `${inline ? 'inline' : 'attachment'}; filename="${a.fileName.replace(/"/g, '')}"`,
      'x-content-type-options': 'nosniff',
      'cache-control': 'private, max-age=3600',
    },
  });
});
