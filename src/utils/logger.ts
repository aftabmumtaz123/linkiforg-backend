import pino from 'pino';
import { env } from '../config/env.js';

const isDev = env.NODE_ENV === 'development';

export const logger = pino({
  level: env.LOG_LEVEL,
  transport: isDev
    ? {
        target: 'pino-pretty',
        options: {
          colorize: true,
          translateTime: 'SYS:standard',
          ignore: 'pid,hostname',
        },
      }
    : undefined,
  redact: {
    paths: [
      'req.headers.authorization',
      'req.headers.cookie',
      'password',
      'token',
      'apiKey',
      'accessKey',
      'secretKey',
      'STORAGE_ACCESS_KEY',
      'STORAGE_SECRET_KEY',
      'downloadUrl',
      'signedUrl',
    ],
    censor: '[REDACTED]',
  },
});
