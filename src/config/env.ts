import { z } from 'zod';
import dotenv from 'dotenv';

dotenv.config();

const envSchema = z
  .object({
    PORT: z.coerce.number().default(5000),
    FRONTEND_URL: z.string().url().default('http://localhost:3000'),
    NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
    LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace']).default('info'),

    // "s3" (default when credentials present) or "local" (filesystem, for dev)
    STORAGE_MODE: z.enum(['s3', 'local']).optional(),

    STORAGE_ENDPOINT: z.string().optional(),
    STORAGE_REGION: z.string().default('auto'),
    STORAGE_BUCKET: z.string().optional(),
    STORAGE_ACCESS_KEY: z.string().optional(),
    STORAGE_SECRET_KEY: z.string().optional(),
    STORAGE_FORCE_PATH_STYLE: z
      .string()
      .optional()
      .transform((v) => v === 'true'),

    // Base URL used when serving local files (dev only)
    LOCAL_STORAGE_PUBLIC_URL: z.string().url().optional(),

    MAX_FILE_SIZE_MB: z.coerce.number().default(500),
    RATE_LIMIT_WINDOW_MS: z.coerce.number().default(900000),
    RATE_LIMIT_MAX_REQUESTS: z.coerce.number().default(20),

    YTDLP_PATH: z.string().optional(),
    FFMPEG_PATH: z.string().optional(),
  })
  .superRefine((data, ctx) => {
    const mode =
      data.STORAGE_MODE ??
      (data.STORAGE_BUCKET && data.STORAGE_ACCESS_KEY && data.STORAGE_SECRET_KEY
        ? 's3'
        : data.NODE_ENV === 'production'
          ? 's3'
          : 'local');

    if (mode === 's3') {
      if (!data.STORAGE_BUCKET) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['STORAGE_BUCKET'],
          message: 'Required when STORAGE_MODE=s3',
        });
      }
      if (!data.STORAGE_ACCESS_KEY) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['STORAGE_ACCESS_KEY'],
          message: 'Required when STORAGE_MODE=s3',
        });
      }
      if (!data.STORAGE_SECRET_KEY) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['STORAGE_SECRET_KEY'],
          message: 'Required when STORAGE_MODE=s3',
        });
      }
    }
  })
  .transform((data) => {
    const mode =
      data.STORAGE_MODE ??
      (data.STORAGE_BUCKET && data.STORAGE_ACCESS_KEY && data.STORAGE_SECRET_KEY
        ? 's3'
        : 'local');

    return {
      ...data,
      STORAGE_MODE: mode as 's3' | 'local',
    };
  });

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  console.error('Invalid environment variables:', parsed.error.flatten().fieldErrors);
  process.exit(1);
}

export const env = parsed.data;
