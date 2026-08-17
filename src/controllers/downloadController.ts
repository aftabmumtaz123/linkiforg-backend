import type { NextFunction, Request, Response } from 'express';
import { promises as fs, createReadStream } from 'node:fs';
import { pipeline } from 'node:stream/promises';
import { z } from 'zod';
import {
  createJob,
  getJob as readJob,
  getJobDownloadUrl,
  getJobFile,
} from '../services/jobStore.js';
import { getInfo } from '../services/downloader/index.js';
import { streamDownload } from '../services/downloadService.js';
import { validateMediaUrl } from '../utils/urlValidator.js';
import { ValidationError } from '../utils/errors.js';

const urlSchema = z.string().trim().min(10).max(2048).url('Please enter a valid media URL.');

const createSchema = z.object({
  url: urlSchema,
  quality: z.string().max(120).optional(),
  format: z.string().max(120).optional(),
  audioOnly: z.boolean().optional(),
});

const infoSchema = z.object({ url: urlSchema });

function getPlatform(url: string) {
  const result = validateMediaUrl(url);
  if (!result.valid || !result.platform || !result.normalizedUrl) {
    throw new ValidationError(result.error || 'Unsupported source.');
  }
  return result;
}

export async function createDownloadJob(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const data = createSchema.parse(req.body);
    const result = getPlatform(data.url);

    const job = await createJob(result.normalizedUrl, result.platform, {
      format: data.quality ?? data.format,
      audioOnly: data.audioOnly,
    });

    res.status(202).json({ success: true, jobId: job.id, job });
  } catch (error) {
    next(error);
  }
}

export async function getJob(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const job = await readJob(req.params.jobId);
    res.json({ success: true, job });
  } catch (error) {
    next(error);
  }
}

export async function getDownloadUrl(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const url = await getJobDownloadUrl(req.params.jobId);
    res.json({ success: true, url });
  } catch (error) {
    next(error);
  }
}

export async function downloadJobFile(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const job = await getJobFile(req.params.jobId);
    const stat = await fs.stat(job.filePath!);

    res.setHeader('Content-Type', job.format === 'mp3' ? 'audio/mpeg' : 'video/mp4');
    res.setHeader('Content-Length', stat.size);
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="${(job.fileName || 'download').replace(/"/g, '')}"`,
    );

    await pipeline(createReadStream(job.filePath!), res);

    // The file is no longer needed after the browser has received it.
    await fs.unlink(job.filePath!).catch(() => undefined);
  } catch (error) {
    if (!res.headersSent) next(error);
    else res.end();
  }
}

/** Direct, no-job endpoint: POST a URL and the server streams the media to the browser. */
export async function directDownload(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const data = createSchema.parse(req.body);
    await streamDownload(data.url, res, {
      format: data.quality ?? data.format,
      audioOnly: data.audioOnly,
    });
  } catch (error) {
    if (!res.headersSent) next(error);
    else res.end();
  }
}

export async function mediaInfo(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const data = infoSchema.parse(req.body);
    const result = getPlatform(data.url);
    const info = await getInfo(result.normalizedUrl, result.platform);

    res.json({
      success: true,
      platform: result.platform,
      title: info.title,
      thumbnail: info.thumbnail,
      duration: info.duration,
      uploader: info.uploader,
      formats: info.formats,
    });
  } catch (error) {
    next(error);
  }
}
