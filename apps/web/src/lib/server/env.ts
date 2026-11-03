import 'server-only';
import { z } from 'zod';

const schema = z.object({
  DATABASE_URL: z.string().min(1),
  REDIS_URL: z.string().min(1),
  ENCRYPTION_KEY: z.string().regex(/^[0-9a-fA-F]{64}$/, 'ENCRYPTION_KEY must be 64 hex chars'),
  UPLOAD_DIR: z.string().default('./uploads'),
  SUPABASE_URL: z.string().url().optional(),
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(20).optional(),
  ASSET_BUCKET: z.string().default('nexus-assets'),
  ADMIN_DISCORD_IDS: z.string().min(1, 'ADMIN_DISCORD_IDS is required'),
  BOT_HEALTH_URL: z.string().url().optional(),
  AUTH_SECRET: z.string().min(16),
});

let cached: z.infer<typeof schema> | undefined;
/** Parsed lazily so `next build` works without runtime secrets. */
export function serverEnv() {
  return (cached ??= schema.parse(process.env));
}

export function adminIds(): Set<string> {
  return new Set(serverEnv().ADMIN_DISCORD_IDS.split(',').map((s) => s.trim()).filter(Boolean));
}

import { createAssetStore, type AssetStore } from '@nexus/shared/storage';
let store: AssetStore | undefined;
export function assetStore(): AssetStore {
  return (store ??= createAssetStore(serverEnv()));
}
