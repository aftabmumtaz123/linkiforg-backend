import 'dotenv/config';
import { z } from 'zod';

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  PORT: z.coerce.number().int().positive().default(4000),
  CORS_ORIGIN: z.string().default('http://localhost:3000'),

 
  STORAGE_PUBLIC_URL: z.string().url().optional().or(z.literal('')).default(''),
  STORAGE_FORCE_PATH_STYLE: z
    .string()
    .optional()
    .transform((value) => value === 'true')
    .default('false'),

  MAX_FILE_SIZE_MB: z.coerce.number().positive().default(500),
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
  storage: {
   
    publicUrl: env.STORAGE_PUBLIC_URL || undefined,
    forcePathStyle: env.STORAGE_FORCE_PATH_STYLE,
  },
  maxFileSizeBytes: env.MAX_FILE_SIZE_MB * 1024 * 1024,
  rateLimit: {
    windowMs: env.RATE_LIMIT_WINDOW_MS,
    max: env.RATE_LIMIT_MAX,
  },
  logLevel: env.LOG_LEVEL,
};

export default config;
