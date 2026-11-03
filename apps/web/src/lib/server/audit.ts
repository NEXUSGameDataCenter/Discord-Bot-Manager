import 'server-only';
import { prisma, type Prisma } from '@nexus/db';

export async function audit(actor: string, action: string, targets: Prisma.InputJsonValue, result: 'success' | 'queued' | 'failed' | 'partial', detail?: Prisma.InputJsonValue) {
  await prisma.auditLog.create({ data: { actor, action, targets, result, detail } });
}
