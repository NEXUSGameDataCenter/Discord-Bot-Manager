import { prisma } from '@nexus/db';
import { createAssetStore } from '@nexus/shared/storage';
import { env } from './env';

export const store = createAssetStore(env);

export async function assetBuffer(assetId: string): Promise<{ data: Buffer; mime: string; fileName: string }> {
  const a = await prisma.asset.findUnique({ where: { id: assetId } });
  if (!a) throw new Error(`Asset ${assetId} not found`);
  return { data: await store.get(a.storedAs), mime: a.mime, fileName: a.fileName };
}

export async function assetDataUri(assetId: string | null): Promise<string | null> {
  if (!assetId) return null;
  const { data, mime } = await assetBuffer(assetId);
  return `data:${mime};base64,${data.toString('base64')}`;
}
