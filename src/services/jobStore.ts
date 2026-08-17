import { randomUUID } from 'node:crypto';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { config } from '../config/index.js';
import { getInfo, getMedia } from './downloader/index.js';
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
  error?: string;
  createdAt: string;
  updatedAt: string;
}

interface StoredJob extends Job {
  filePath?: string;
}

const jobs = new Map<string, StoredJob>();

function publicJob(job: StoredJob): Job {
  const { filePath: _filePath, ...safe } = job;
  return safe;
}

function sanitizeFileName(value: string): string {
  const cleaned = value
    .replace(/[<>:"/\\|?*\u0000-\u001F]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 100);
  return cleaned || 'download';
}

function updateJob(job: StoredJob, patch: Partial<StoredJob>): void {
  Object.assign(job, patch, { updatedAt: new Date().toISOString() });
}

async function removeLocalFile(filePath?: string): Promise<void> {
  if (!filePath) return;
  await fs.unlink(filePath).catch(() => undefined);
  const parent = path.dirname(filePath);
  await fs.rm(parent, { recursive: true, force: true }).catch(() => undefined);
}

function scheduleCleanup(jobId: string, filePath?: string): void {
  setTimeout(async () => {
    const job = jobs.get(jobId);
    await removeLocalFile(filePath ?? job?.filePath);
    jobs.delete(jobId);
  }, config.jobTtlMs).unref();
}

async function processJob(job: StoredJob, options: DownloadOptions): Promise<void> {
  try {
    const info: MediaInfo = await getInfo(job.url, job.platform);
    updateJob(job, {
      title: info.title,
      thumbnail: info.thumbnail,
      duration: info.duration,
      progress: 20,
    });

    const result = await getMedia(job.url, job.platform, options);
    updateJob(job, { progress: 90 });

    job.filePath = result.filePath;
    updateJob(job, {
      status: 'completed',
      progress: 100,
      format: result.format,
      fileSize: result.filesize,
      fileName: `${sanitizeFileName(result.title)}.${result.format}`,
    });

    logger.info({ jobId: job.id, filePath: result.filePath }, 'Local download completed');
    scheduleCleanup(job.id, result.filePath);
  } catch (error) {
    job.filePath = undefined;
    updateJob(job, {
      status: 'failed',
      progress: 0,
      error:
        error instanceof AppError
          ? error.message
          : error instanceof Error
            ? error.message
            : 'Download failed',
    });

    logger.error({ err: error, jobId: job.id }, 'Download job failed');
  }
}

export async function createJob(
  url: string,
  platform: SupportedPlatform,
  options: DownloadOptions = {},
): Promise<Job> {
  const now = new Date().toISOString();
  const job: StoredJob = {
    id: randomUUID(),
    status: 'pending',
    url,
    platform,
    quality: options.format,
    progress: 0,
    createdAt: now,
    updatedAt: now,
  };

  jobs.set(job.id, job);

  // Start immediately, but return the job so the frontend can poll it.
  job.status = 'processing';
  job.progress = 5;
  job.updatedAt = new Date().toISOString();
  void processJob(job, options);

  return publicJob(job);
}

export async function getJob(id: string): Promise<Job> {
  const job = jobs.get(id);
  if (!job) throw new NotFoundError('Job not found');
  return publicJob(job);
}

export async function getJobFile(id: string): Promise<StoredJob> {
  const job = jobs.get(id);
  if (!job) throw new NotFoundError('Job not found');
  if (job.status !== 'completed' || !job.filePath) {
    throw new AppError('Download is not ready yet.', 409, 'DOWNLOAD_NOT_READY');
  }

  try {
    await fs.access(job.filePath);
  } catch {
    throw new NotFoundError('Downloaded file is no longer available.');
  }

  return job;
}

export async function getJobDownloadUrl(id: string): Promise<string> {
  const job = await getJobFile(id);
  return `${config.publicBaseUrl}/api/jobs/${job.id}/file`;
}

export async function cleanupAllJobs(): Promise<void> {
  for (const job of jobs.values()) {
    await removeLocalFile(job.filePath);
  }
  jobs.clear();
}
