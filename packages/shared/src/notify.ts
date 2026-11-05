import type { TeamRole } from './team';

/** Things a team member can be notified about. */
export const NOTIFY_KINDS = {
  delivery_failed: { label: 'ประกาศส่งล้มเหลว / สำเร็จบางส่วน', hint: 'ประกาศที่คุณส่ง และของทุกคนสำหรับ Admin ขึ้นไป', web: true, push: true },
  schedule_sent: { label: 'ประกาศที่ตั้งเวลาไว้ ส่งแล้ว', hint: 'เฉพาะที่คุณตั้งเวลา', web: true, push: false },
  bot_status: { label: 'Bot offline / กลับมาออนไลน์', hint: 'แจ้งเมื่อหลุดเกิน 5 นาที · Admin ขึ้นไป', web: true, push: true },
  join_request: { label: 'มีคนขอเข้าร่วมทีม', hint: 'เฉพาะ Owner', web: true, push: true },
  moderation: { label: 'Honeypot จับได้ / moderation case ใหม่', hint: 'Admin ขึ้นไป', web: true, push: false },
} as const;
export type NotifyKind = keyof typeof NOTIFY_KINDS;

export type NotifyPrefs = {
  web: Partial<Record<NotifyKind, boolean>>;
  push: Partial<Record<NotifyKind, boolean>>;
  quiet: { on: boolean; start: string; end: string; urgentAlways: boolean };
};

export function resolvePrefs(raw: unknown): NotifyPrefs {
  const r = (raw && typeof raw === 'object' ? raw : {}) as Partial<NotifyPrefs>;
  const web: NotifyPrefs['web'] = {};
  const push: NotifyPrefs['push'] = {};
  for (const k of Object.keys(NOTIFY_KINDS) as NotifyKind[]) {
    web[k] = r.web?.[k] ?? NOTIFY_KINDS[k].web;
    push[k] = r.push?.[k] ?? NOTIFY_KINDS[k].push;
  }
  const q = r.quiet ?? ({} as Partial<NotifyPrefs['quiet']>);
  return { web, push, quiet: { on: q.on ?? false, start: q.start ?? '00:00', end: q.end ?? '08:00', urgentAlways: q.urgentAlways ?? true } };
}

/** True when `now` (Asia/Bangkok) falls inside the member's quiet hours. */
export function inQuietHours(p: NotifyPrefs, now = new Date()): boolean {
  if (!p.quiet.on) return false;
  const hm = new Intl.DateTimeFormat('en-GB', { hour: '2-digit', minute: '2-digit', hour12: false, timeZone: 'Asia/Bangkok' }).format(now);
  const { start, end } = p.quiet;
  return start <= end ? hm >= start && hm < end : hm >= start || hm < end;
}

export interface NotifyJob {
  kind: NotifyKind;
  title: string;
  body?: string;
  link?: string;
  /** Members with at least one of these roles, plus these emails. */
  roles?: TeamRole[];
  emails?: string[];
  /** Same key within 5 minutes is sent once. */
  dedupeKey?: string;
  /** Ignores quiet hours when the member allows urgent alerts. */
  urgent?: boolean;
  /** Push-only test to one member's devices. */
  test?: boolean;
}
