import 'server-only';
import { z } from 'zod';
import { createAssetStore, type AssetStore } from '@nexus/shared/storage';

const schema = z.object({
  DATABASE_URL: z.string().min(1),
  REDIS_URL: z.string().min(1),
  ENCRYPTION_KEY: z.string().regex(/^[0-9a-fA-F]{64}$/, 'ENCRYPTION_KEY must be 64 hex chars'),
  UPLOAD_DIR: z.string().default('./uploads'),
  SUPABASE_URL: z.string().url().optional(),
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(20).optional(),
  ASSET_BUCKET: z.string().default('nexus-assets'),
  BOT_HEALTH_URL: z.string().url().optional(),
  AUTH_SECRET: z.string().min(16),
  /** Public base URL, used in email links */
  AUTH_URL: z.string().url(),
  /** First owner. Can always request a sign-in link, even before anyone is invited. */
  OWNER_EMAIL: z.string().trim().toLowerCase().email().optional(),
  /** Email: set RESEND_API_KEY or SMTP_URL (e.g. smtps://user:app-password@smtp.gmail.com:465) */
  RESEND_API_KEY: z.string().min(10).optional(),
  SMTP_URL: z.string().min(10).optional(),
  EMAIL_FROM: z.string().default('Nexus Bot Control <onboarding@resend.dev>'),
});

let cached: z.infer<typeof schema> | undefined;
/** Parsed lazily so `next build` works without runtime secrets. Empty strings count as unset. */
export function serverEnv() {
  if (!cached) {
    const raw = Object.fromEntries(Object.entries(process.env).filter(([, v]) => v !== ''));
    cached = schema.parse(raw);
  }
  return cached;
}

export function baseUrl(): string {
  return serverEnv().AUTH_URL.replace(/\/+$/, '');
}

let store: AssetStore | undefined;
export function assetStore(): AssetStore {
  return (store ??= createAssetStore(serverEnv()));
}
