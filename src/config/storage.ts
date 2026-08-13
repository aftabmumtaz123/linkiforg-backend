import { GetObjectCommand, PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { createReadStream } from 'node:fs';
import { config } from './index.js';

export const s3Client = new S3Client({
  endpoint: config.storage.endpoint,
  region: config.storage.region,
  credentials: {
    accessKeyId: config.storage.accessKey,
    secretAccessKey: config.storage.secretKey,
  },
  forcePathStyle: config.storage.forcePathStyle,
});

export const BUCKET = config.storage.bucket;

export async function uploadFile(
  key: string,
  filePath: string,
  contentType: string
): Promise<void> {
  await s3Client.send(
    new PutObjectCommand({
      Bucket: BUCKET,
      Key: key,
      Body: createReadStream(filePath),
      ContentType: contentType,
    })
  );
}

export async function uploadJson(key: string, value: unknown): Promise<void> {
  await s3Client.send(
    new PutObjectCommand({
      Bucket: BUCKET,
      Key: key,
      Body: JSON.stringify(value),
      ContentType: 'application/json',
    })
  );
}

export async function getJson<T>(key: string): Promise<T | null> {
  try {
    const result = await s3Client.send(
      new GetObjectCommand({ Bucket: BUCKET, Key: key })
    );
    if (!result.Body) return null;
    const text = await result.Body.transformToString();
    return JSON.parse(text) as T;
  } catch (error) {
    const code = (error as { name?: string })?.name;
    if (code === 'NoSuchKey' || code === 'NotFound') return null;
    throw error;
  }
}

export async function getDownloadUrl(key: string, expiresIn = 900): Promise<string> {
  return getSignedUrl(
    s3Client,
    new GetObjectCommand({ Bucket: BUCKET, Key: key }),
    { expiresIn }
  );
}
