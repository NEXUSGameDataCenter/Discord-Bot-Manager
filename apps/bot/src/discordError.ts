import { DiscordAPIError, HTTPError } from 'discord.js';
import { classifyStatus, humanReason, type ErrorClass } from '@nexus/shared';

/** Thrown for permanent failures that must not be retried. */
export class FatalError extends Error {}

export function inspect(err: unknown): { cls: ErrorClass; reason: string } {
  if (err instanceof FatalError) return { cls: 'fatal', reason: err.message };
  if (err instanceof DiscordAPIError) {
    const code = typeof err.code === 'number' ? err.code : undefined;
    return { cls: classifyStatus(err.status), reason: humanReason(err.status, code, err.message) };
  }
  if (err instanceof HTTPError) return { cls: classifyStatus(err.status), reason: humanReason(err.status, undefined, err.message) };
  if (err instanceof Error && err.message === 'BOT_OFFLINE') return { cls: 'retry', reason: 'Bot offline — เริ่ม Bot ก่อนแล้วกด Retry' };
  return { cls: 'retry', reason: err instanceof Error ? err.message : String(err) };
}
