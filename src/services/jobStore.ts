import { randomUUID } from 'node:crypto';
import { unlink } from 'node:fs/promises';
import { getDownloadUrl as getSignedDownloadUrl, getJson, uploadFile, uploadJson } from '../config/storage.js';
import { config } from '../config/index.js';
import { getMedia } from "./downloader/index.js";
import type { DownloadOptions, MediaInfo } from './downloader/index.js';
import type { SupportedPlatform } from '../utils/urlValidator.js';
import { AppError, NotFoundError } from '../utils/errors.js';
import { logger } from '../utils/logger.js';

export type JobStatus = 'pending' | 'processing' | 'completed' | 'failed';

export interface Job {
  id: string;
  status: JobStatus;
  url: string;
  platform: SupportedPlatform;
  quality?: string;
  progress: number;
  title?: string;
  thumbnail?: string;
  duration?: number;
  format?: string;
  fileSize?: number;
  fileName?: string;
  downloadKey?: string;
  error?: string;
  createdAt: string;
  updatedAt: string;
}

interface PersistedJob extends Job {}

const jobKey = (id: string) => `jobs/${id}.json`;

async function saveJob(job: Job): Promise<void> {
  await uploadJson(jobKey(job.id), job);
}

export async function createJob(
  url: string,
  platform: SupportedPlatform,
  options: DownloadOptions = {}
): Promise<Job> {
  const id = randomUUID();
  const now = new Date().toISOString();

  const job: Job = {
    id,
    status: 'processing',
    url,
    platform,
    quality: options.format,
    progress: 5,
    createdAt: now,
    updatedAt: now,
  };

  await saveJob(job);

  try {
    const info: MediaInfo = await getInfo(url, platform);
    job.title = info.title;
    job.thumbnail = info.thumbnail;
    job.duration = info.duration;
    job.progress = 20;
    job.updatedAt = new Date().toISOString();
    await saveJob(job);

    const result = await getMedia(url, platform, options);
    job.progress = 80;
    job.updatedAt = new Date().toISOString();
    await saveJob(job);

    const key = `downloads/${job.id}.${result.format}`;
    await uploadFile(
      key,
      result.filePath,
      result.format === 'mp3' ? 'audio/mpeg' : 'video/mp4'
    );

    await unlink(result.filePath).catch(() => undefined);

    job.status = 'completed';
    job.progress = 100;
    job.format = result.format;
    job.fileSize = result.filesize;
    job.fileName = `${sanitizeFileName(result.title)}.${result.format}`;
    job.downloadKey = key;
    job.updatedAt = new Date().toISOString();
    await saveJob(job);

    return job;
  } catch (error) {
    job.status = 'failed';
    job.progress = 0;
    job.error =
      error instanceof AppError
        ? error.message
        : error instanceof Error
          ? error.message
          : 'Download failed';
    job.updatedAt = new Date().toISOString();
    await saveJob(job);

    logger.error({ err: error, jobId: job.id }, 'Download job failed');
    return job;
  }
}

export async function getJob(id: string): Promise<Job> {
  const job = await getJson<PersistedJob>(jobKey(id));
  if (!job) throw new NotFoundError('Job not found');
  return job;
}

export async function getJobDownloadUrl(id: string): Promise<string> {
  const job = await getJob(id);
  if (job.status !== 'completed' || !job.downloadKey) {
    throw new AppError('Download is not ready yet.', 409, 'DOWNLOAD_NOT_READY');
  }
  return getSignedDownloadUrl(job.downloadKey);
}

function sanitizeFileName(value: string): string {
  const cleaned = value
    .replace(/[<>:"/\\|?*\u0000-\u001F]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 100);
  return cleaned || 'download';
}
