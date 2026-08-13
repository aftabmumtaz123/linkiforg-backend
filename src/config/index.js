import dotenv from 'dotenv';
import { z } from 'zod';

dotenv.config();

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  PORT: z.coerce.number().default(4000),
  CORS_ORIGIN: z.string().default('http://localhost:3000'),

  REDIS_HOST: z.string().default('localhost'),
  REDIS_PORT: z.coerce.number().default(6379),
  REDIS_PASSWORD: z.string().optional().default(''),

  STORAGE_ENDPOINT: z.string().url(),
  STORAGE_REGION: z.string().default('us-east-1'),
  STORAGE_BUCKET: z.string().min(1),
  STORAGE_ACCESS_KEY: z.string().min(1),
  STORAGE_SECRET_KEY: z.string().min(1),
  STORAGE_PUBLIC_URL: z.string().optional().default(''),
  STORAGE_FORCE_PATH_STYLE: z
    .string()
    .optional()
    .transform((v) => v === 'true')
    .default('false'),

  JOB_TTL_HOURS: z.coerce.number().min(1).default(24),
  MAX_FILE_SIZE_MB: z.coerce.number().min(1).default(500),
  MAX_CONCURRENT_JOBS: z.coerce.number().min(1).default(3),
  PROCESSING_TIMEOUT_MS: z.coerce.number().min(10000).default(600000),
  RATE_LIMIT_WINDOW_MS: z.coerce.number().default(60000),
  RATE_LIMIT_MAX: z.coerce.number().default(30),

  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace']).default('info'),
});

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  console.error('Invalid environment variables:', parsed.error.flatten().fieldErrors);
  // In development allow missing storage credentials so the API can still start
  // and return clear errors; production should fail fast.
  if (process.env.NODE_ENV === 'production') {
    process.exit(1);
  }
}

const env = parsed.success ? parsed.data : {
  NODE_ENV: process.env.NODE_ENV || 'development',
  PORT: Number(process.env.PORT) || 4000,
  CORS_ORIGIN: process.env.CORS_ORIGIN || 'http://localhost:3000',
  REDIS_HOST: process.env.REDIS_HOST || 'localhost',
  REDIS_PORT: Number(process.env.REDIS_PORT) || 6379,
  REDIS_PASSWORD: process.env.REDIS_PASSWORD || '',
  STORAGE_ENDPOINT: process.env.STORAGE_ENDPOINT || 'http://localhost:9000',
  STORAGE_REGION: process.env.STORAGE_REGION || 'us-east-1',
  STORAGE_BUCKET: process.env.STORAGE_BUCKET || 'videos',
  STORAGE_ACCESS_KEY: process.env.STORAGE_ACCESS_KEY || 'minio',
  STORAGE_SECRET_KEY: process.env.STORAGE_SECRET_KEY || 'minio123',
  STORAGE_PUBLIC_URL: process.env.STORAGE_PUBLIC_URL || '',
  STORAGE_FORCE_PATH_STYLE: process.env.STORAGE_FORCE_PATH_STYLE === 'true',
  JOB_TTL_HOURS: Number(process.env.JOB_TTL_HOURS) || 24,
  MAX_FILE_SIZE_MB: Number(process.env.MAX_FILE_SIZE_MB) || 500,
  MAX_CONCURRENT_JOBS: Number(process.env.MAX_CONCURRENT_JOBS) || 3,
  PROCESSING_TIMEOUT_MS: Number(process.env.PROCESSING_TIMEOUT_MS) || 600000,
  RATE_LIMIT_WINDOW_MS: Number(process.env.RATE_LIMIT_WINDOW_MS) || 60000,
  RATE_LIMIT_MAX: Number(process.env.RATE_LIMIT_MAX) || 30,
  LOG_LEVEL: process.env.LOG_LEVEL || 'info',
};

export const config = {
  env: env.NODE_ENV,
  port: env.PORT,
  corsOrigin: env.CORS_ORIGIN,
  redis: {
    host: env.REDIS_HOST,
    port: env.REDIS_PORT,
    password: env.REDIS_PASSWORD || undefined,
  },
  storage: {
    endpoint: env.STORAGE_ENDPOINT,
    region: env.STORAGE_REGION,
    bucket: env.STORAGE_BUCKET,
    accessKey: env.STORAGE_ACCESS_KEY,
    secretKey: env.STORAGE_SECRET_KEY,
    publicUrl: env.STORAGE_PUBLIC_URL,
    forcePathStyle: env.STORAGE_FORCE_PATH_STYLE,
  },
  job: {
    ttlHours: env.JOB_TTL_HOURS,
    ttlMs: env.JOB_TTL_HOURS * 60 * 60 * 1000,
    maxFileSizeMb: env.MAX_FILE_SIZE_MB,
    maxFileSizeBytes: env.MAX_FILE_SIZE_MB * 1024 * 1024,
    maxConcurrent: env.MAX_CONCURRENT_JOBS,
    processingTimeoutMs: env.PROCESSING_TIMEOUT_MS,
  },
  rateLimit: {
    windowMs: env.RATE_LIMIT_WINDOW_MS,
    max: env.RATE_LIMIT_MAX,
  },
  logLevel: env.LOG_LEVEL,
};

export default config;
