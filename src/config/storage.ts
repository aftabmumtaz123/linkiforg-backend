import { S3Client } from '@aws-sdk/client-s3';
import path from 'path';
import { env } from './env.js';

export const STORAGE_MODE = env.STORAGE_MODE;

export const s3Client =
  STORAGE_MODE === 's3'
    ? new S3Client({
        endpoint: env.STORAGE_ENDPOINT || undefined,
        region: env.STORAGE_REGION,
        credentials: {
          accessKeyId: env.STORAGE_ACCESS_KEY!,
          secretAccessKey: env.STORAGE_SECRET_KEY!,
        },
        forcePathStyle: env.STORAGE_FORCE_PATH_STYLE ?? Boolean(env.STORAGE_ENDPOINT),
      })
    : null;

export const BUCKET = env.STORAGE_BUCKET || 'local';
export const MAX_FILE_SIZE_BYTES = env.MAX_FILE_SIZE_MB * 1024 * 1024;

/** Directory used when STORAGE_MODE=local */
export const LOCAL_STORAGE_DIR = path.join(process.cwd(), 'local-storage');

export const LOCAL_PUBLIC_URL =
  env.LOCAL_STORAGE_PUBLIC_URL || `http://localhost:${env.PORT}/local-files`;
