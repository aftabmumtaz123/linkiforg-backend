import type { NextFunction, Request, Response } from 'express';
import { z } from 'zod';
import { createJob, getJob as readJob, getJobDownloadUrl } from '../services/jobStore.js';
import { getInfo } from '../services/downloader/index.js';
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
  next: NextFunction
): Promise<void> {
  try {
    const data = createSchema.parse(req.body);
    const result = getPlatform(data.url);

    const job = await createJob(result.normalizedUrl!, result.platform!, {
      format: data.quality ?? data.format,
      audioOnly: data.audioOnly,
    });

    res.status(202).json({
      success: true,
      jobId: job.id,
      job,
    });
  } catch (error) {
    next(error);
  }
}

export async function getJob(
  req: Request,
  res: Response,
  next: NextFunction
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
  next: NextFunction
): Promise<void> {
  try {
    const url = await getJobDownloadUrl(req.params.jobId);
    res.json({ success: true, url });
  } catch (error) {
    next(error);
  }
}

export async function mediaInfo(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const data = infoSchema.parse(req.body);
    const result = getPlatform(data.url);
    const info = await getInfo(result.normalizedUrl!, result.platform!);

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
