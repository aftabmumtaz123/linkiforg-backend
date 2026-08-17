import 'dotenv/config';
import { z } from 'zod';

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  PORT: z.coerce.number().int().positive().default(4000),
  CORS_ORIGIN: z.string().default('http://localhost:3000'),
  PUBLIC_BASE_URL: z.string().url().optional().or(z.literal('')).default(''),
  MAX_FILE_SIZE_MB: z.coerce.number().positive().default(500),
  JOB_TTL_HOURS: z.coerce.number().positive().default(24),
  RATE_LIMIT_WINDOW_MS: z.coerce.number().positive().default(60_000),
  RATE_LIMIT_MAX: z.coerce.number().positive().default(30),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace']).default('info'),
});

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  console.error('Invalid environment variables:', parsed.error.flatten().fieldErrors);
  throw new Error('Invalid environment variables. Check the backend environment configuration.');
}

const env = parsed.data;

export const config = {
  env: env.NODE_ENV,
  port: env.PORT,
  corsOrigin: env.CORS_ORIGIN,
  publicBaseUrl: env.PUBLIC_BASE_URL || `http://localhost:${env.PORT}`,
  maxFileSizeBytes: env.MAX_FILE_SIZE_MB * 1024 * 1024,
  jobTtlMs: env.JOB_TTL_HOURS * 60 * 60 * 1000,
  rateLimit: {
    windowMs: env.RATE_LIMIT_WINDOW_MS,
    max: env.RATE_LIMIT_MAX,
  },
  logLevel: env.LOG_LEVEL,
};

export default config;
