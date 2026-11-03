export type ErrorClass = 'retry' | 'fatal';

/** 5xx, 429 and network errors (no status) are retried. 4xx are permanent. */
export function classifyStatus(status: number | undefined): ErrorClass {
  if (status === undefined || status === 429 || status >= 500) return 'retry';
  return 'fatal';
}

/** Exponential backoff with "equal jitter": delay in [exp/2, exp]. attempt starts at 1. */
export function backoffDelay(attempt: number, base = 2000, max = 60_000, rand: () => number = Math.random): number {
  const exp = Math.min(max, base * 2 ** Math.max(0, attempt - 1));
  return Math.round(exp / 2 + rand() * (exp / 2));
}

export const MAX_DELIVERY_ATTEMPTS = 5;

const CODE_REASONS: Record<number, string> = {
  10003: 'ไม่พบห้องนี้แล้ว (ถูกลบ)',
  10004: 'Bot ไม่ได้อยู่ใน Server นี้แล้ว',
  10008: 'ไม่พบข้อความ (อาจถูกลบไปแล้ว)',
  10015: 'ไม่พบ Webhook (อาจถูกลบไปแล้ว)',
  30007: 'ห้องนี้มี Webhook ครบ 15 ตัวแล้ว',
  50001: 'Bot ไม่มีสิทธิ์เข้าถึงห้องนี้ (Missing Access)',
  50013: 'Bot ขาด Permission ที่จำเป็น (Missing Permissions)',
  50035: 'ข้อมูลข้อความไม่ถูกต้องตามรูปแบบของ Discord',
  40005: 'ไฟล์แนบใหญ่เกินกว่าที่ Server นี้อนุญาต',
};

export function humanReason(status: number | undefined, code: number | undefined, message?: string): string {
  if (code !== undefined && CODE_REASONS[code]) return `${CODE_REASONS[code]} [${status ?? '-'}/${code}]`;
  if (status === 403) return `403 Forbidden: ไม่มีสิทธิ์ ${message ?? ''}`.trim();
  if (status === 404) return `404 Not Found: ${message ?? 'ไม่พบปลายทาง'}`;
  if (status !== undefined && status >= 500) return `Discord error ${status} (ลองใหม่ครบแล้ว)`;
  return message ?? 'Unknown error';
}
