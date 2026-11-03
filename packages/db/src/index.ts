import { PrismaClient } from '@prisma/client';

export * from '@prisma/client';

const g = globalThis as unknown as { __nexusPrisma?: PrismaClient };

/** Single client per process (Next.js dev hot-reload safe). */
export const prisma = g.__nexusPrisma ?? new PrismaClient();
if (process.env.NODE_ENV !== 'production') g.__nexusPrisma = prisma;
