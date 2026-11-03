import 'server-only';
import { pino } from 'pino';

export const logger = pino({
  level: process.env.LOG_LEVEL ?? 'info',
  redact: { paths: ['token', '*.token', 'tokenEnc', '*.tokenEnc', 'headers.authorization', 'headers.cookie'], censor: '[redacted]' },
});
