import {
  S3Client,
  PutObjectCommand,
  DeleteObjectCommand,
  HeadObjectCommand,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { GetObjectCommand } from '@aws-sdk/client-s3';
import { config } from '../../config/index.js';
import { logger } from '../../utils/logger.js';
import { AppError } from '../../utils/errors.js';

let client = null;

function getClient() {
  if (client) return client;

  client = new S3Client({
    region: config.storage.region,
    endpoint: config.storage.endpoint,
    credentials: {
      accessKeyId: config.storage.accessKey,
      secretAccessKey: config.storage.secretKey,
    },
    forcePathStyle: config.storage.forcePathStyle,
  });

  return client;
}

/**
 * Upload a buffer or readable stream to object storage.
 * @param {string} key - e.g. videos/job_xxx.mp4
 * @param {Buffer|import('stream').Readable} body
 * @param {string} contentType
 * @param {number} [contentLength]
 */
export async function uploadObject(key, body, contentType, contentLength) {
  const s3 = getClient();
  try {
    const cmd = new PutObjectCommand({
      Bucket: config.storage.bucket,
      Key: key,
      Body: body,
      ContentType: contentType,
      ...(contentLength ? { ContentLength: contentLength } : {}),
    });
    await s3.send(cmd);
    logger.info({ key }, 'Object uploaded');
    return { key, bucket: config.storage.bucket };
  } catch (err) {
    logger.error({ err, key }, 'Upload failed');
    throw new AppError('Failed to upload file to storage', 500, 'STORAGE_UPLOAD_FAILED');
  }
}

/**
 * Generate a short-lived signed download URL.
 * Default expiry: 15 minutes.
 */
export async function getSignedDownloadUrl(key, expiresInSeconds = 900) {
  const s3 = getClient();
  try {
    const cmd = new GetObjectCommand({
      Bucket: config.storage.bucket,
      Key: key,
    });
    const url = await getSignedUrl(s3, cmd, { expiresIn: expiresInSeconds });
    return url;
  } catch (err) {
    logger.error({ err, key }, 'Failed to create signed URL');
    throw new AppError('Failed to generate download URL', 500, 'STORAGE_SIGN_FAILED');
  }
}

export async function deleteObject(key) {
  const s3 = getClient();
  try {
    await s3.send(
      new DeleteObjectCommand({
        Bucket: config.storage.bucket,
        Key: key,
      })
    );
    logger.info({ key }, 'Object deleted');
  } catch (err) {
    logger.warn({ err, key }, 'Failed to delete object (may already be gone)');
  }
}

export async function objectExists(key) {
  const s3 = getClient();
  try {
    await s3.send(
      new HeadObjectCommand({
        Bucket: config.storage.bucket,
        Key: key,
      })
    );
    return true;
  } catch {
    return false;
  }
}

export function videoKey(jobId, ext = 'mp4') {
  return `videos/${jobId}.${ext}`;
}

export function thumbnailKey(jobId, ext = 'jpg') {
  return `thumbnails/${jobId}.${ext}`;
}
