import { z } from 'zod';

export const env = z
  .object({
    DATABASE_URL: z.string().min(1),
    REDIS_URL: z.string().min(1),
    ENCRYPTION_KEY: z.string().regex(/^[0-9a-fA-F]{64}$/, 'ENCRYPTION_KEY must be 64 hex chars'),
    UPLOAD_DIR: z.string().default('./uploads'),
    SUPABASE_URL: z.string().url().optional(),
    SUPABASE_SERVICE_ROLE_KEY: z.string().min(20).optional(),
    ASSET_BUCKET: z.string().default('nexus-assets'),
    HEALTH_PORT: z.coerce.number().int().default(8081),
    DELIVERY_CONCURRENCY: z.coerce.number().int().min(1).max(20).default(5),
    LOG_LEVEL: z.string().default('info'),
    VAPID_PUBLIC_KEY: z.string().optional(),
    VAPID_PRIVATE_KEY: z.string().optional(),
    VAPID_SUBJECT: z.string().default('mailto:admin@example.com'),
  })
  .parse(process.env);
