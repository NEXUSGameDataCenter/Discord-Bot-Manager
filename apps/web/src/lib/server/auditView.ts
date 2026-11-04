import { prisma, type AuditLog } from '@nexus/db';

export type DeliveryStats = { title: string; status: string; total: number; sent: number; failed: number; queued: number; deleted: number };
export type AuditView = AuditLog & { actorName: string | null; actorEmail: string | null; ann: DeliveryStats | null };

/** Latest-run delivery counts per announcement. */
export async function deliveryStats(ids: string[]): Promise<Record<string, DeliveryStats>> {
  if (!ids.length) return {};
  const anns = await prisma.announcement.findMany({
    where: { id: { in: ids } },
    select: { id: true, title: true, status: true, targets: { select: { skip: true, deliveries: { select: { status: true, run: true } } } } },
  });
  return Object.fromEntries(
    anns.map((a) => {
      const run = Math.max(0, ...a.targets.flatMap((t) => t.deliveries.map((d) => d.run)));
      const latest = a.targets.flatMap((t) => t.deliveries.filter((d) => d.run === run));
      const n = (s: string) => latest.filter((d) => d.status === s).length;
      return [a.id, { title: a.title, status: a.status, total: a.targets.filter((t) => !t.skip).length, sent: n('SENT'), failed: n('FAILED'), queued: n('QUEUED'), deleted: n('DELETED') }];
    }),
  );
}

/** Adds the actor's display name/email and the live result of announcements, so rows never stay "queued". */
export async function enrichAudit(logs: AuditLog[]): Promise<AuditView[]> {
  const emails = [...new Set(logs.map((l) => l.actor.toLowerCase()).filter((a) => a.includes('@')))];
  const annIds = [...new Set(logs.map((l) => (l.targets as Record<string, unknown> | null)?.announcementId).filter((v): v is string => typeof v === 'string'))];
  const [members, stats] = await Promise.all([
    emails.length ? prisma.teamMember.findMany({ where: { email: { in: emails } }, select: { email: true, name: true } }) : [],
    deliveryStats(annIds),
  ]);
  const names = new Map(members.map((m) => [m.email, m.name]));
  return logs.map((l) => {
    const email = l.actor.includes('@') ? l.actor.toLowerCase() : null;
    const id = (l.targets as Record<string, unknown> | null)?.announcementId;
    return { ...l, actorEmail: email, actorName: email ? (names.get(email) ?? null) : l.actor, ann: typeof id === 'string' ? (stats[id] ?? null) : null };
  });
}
