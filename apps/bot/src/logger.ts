import { pino } from 'pino';
import { env } from './env';

export const logger = pino({
  level: env.LOG_LEVEL,
  redact: { paths: ['token', '*.token', 'tokenEnc', '*.tokenEnc', 'headers.authorization', '*.headers.authorization'], censor: '[redacted]' },
});
