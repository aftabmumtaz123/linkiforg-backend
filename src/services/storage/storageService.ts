import {
  PutObjectCommand,
  GetObjectCommand,
  DeleteObjectCommand,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { createReadStream, promises as fs } from 'fs';
import path from 'path';
import { v4 as uuidv4 } from 'uuid';
import {
  s3Client,
  BUCKET,
  MAX_FILE_SIZE_BYTES,
  STORAGE_MODE,
  LOCAL_STORAGE_DIR,
  LOCAL_PUBLIC_URL,
} from '../../config/storage.js';
import { logger } from '../../utils/logger.js';
import { AppError } from '../../middleware/errorHandler.js';

export interface UploadResult {
  key: string;
  signedUrl: string;
  expiresIn: number;
  size: number;
  contentType: string;
}

const SIGNED_URL_EXPIRES = 60 * 15; // 15 minutes

async function uploadToS3(
  localPath: string,
  key: string,
  contentType: string,
  size: number
): Promise<UploadResult> {
  if (!s3Client) {
    throw new AppError('S3 client is not configured.', 500, 'STORAGE_FAILURE');
  }

  const stream = createReadStream(localPath);

  await s3Client.send(
    new PutObjectCommand({
      Bucket: BUCKET,
      Key: key,
      Body: stream,
      ContentType: contentType,
      ContentLength: size,
    })
  );

  const signedUrl = await getSignedUrl(
    s3Client,
    new GetObjectCommand({
      Bucket: BUCKET,
      Key: key,
    }),
    { expiresIn: SIGNED_URL_EXPIRES }
  );

  return {
    key,
    signedUrl,
    expiresIn: SIGNED_URL_EXPIRES,
    size,
    contentType,
  };
}

async function uploadToLocal(
  localPath: string,
  key: string,
  contentType: string,
  size: number
): Promise<UploadResult> {
  const destDir = path.join(LOCAL_STORAGE_DIR, path.dirname(key));
  await fs.mkdir(destDir, { recursive: true });

  const destPath = path.join(LOCAL_STORAGE_DIR, key);
  await fs.copyFile(localPath, destPath);

  // In local mode we serve files via Express static route.
  // Not a real signed URL, but works for development.
  const signedUrl = `${LOCAL_PUBLIC_URL}/${key}`;

  return {
    key,
    signedUrl,
    expiresIn: SIGNED_URL_EXPIRES,
    size,
    contentType,
  };
}

export async function uploadFile(
  localPath: string,
  options: {
    contentType?: string;
    extension?: string;
    prefix?: string;
  } = {}
): Promise<UploadResult> {
  const stats = await fs.stat(localPath);
  if (stats.size > MAX_FILE_SIZE_BYTES) {
    throw new AppError(
      `File exceeds maximum allowed size of ${MAX_FILE_SIZE_BYTES / (1024 * 1024)} MB`,
      413,
      'FILE_TOO_LARGE'
    );
  }

  const ext = options.extension || path.extname(localPath) || '.mp4';
  const key = `${options.prefix || 'videos'}/${uuidv4()}${ext}`;
  const contentType = options.contentType || 'video/mp4';

  try {
    const result =
      STORAGE_MODE === 'local'
        ? await uploadToLocal(localPath, key, contentType, stats.size)
        : await uploadToS3(localPath, key, contentType, stats.size);

    logger.info(
      { key, size: stats.size, mode: STORAGE_MODE },
      'File uploaded to storage'
    );

    return result;
  } catch (err) {
    if (err instanceof AppError) throw err;
    logger.error({ err }, 'Storage upload failed');
    throw new AppError('Failed to store processed media.', 500, 'STORAGE_FAILURE');
  }
}

export async function deleteObject(key: string): Promise<void> {
  try {
    if (STORAGE_MODE === 'local') {
      const filePath = path.join(LOCAL_STORAGE_DIR, key);
      await fs.unlink(filePath).catch(() => undefined);
      return;
    }

    if (!s3Client) return;

    await s3Client.send(
      new DeleteObjectCommand({
        Bucket: BUCKET,
        Key: key,
      })
    );
  } catch (err) {
    logger.warn({ err, key }, 'Failed to delete object (non-fatal)');
  }
}
