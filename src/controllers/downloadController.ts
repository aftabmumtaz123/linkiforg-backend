import { Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { streamDownload, fetchMediaInfo } from '../services/downloadService.js';

const urlSchema = z
  .string()
  .min(10, 'URL is required')
  .max(2048, 'URL is too long')
  .url('Please enter a valid media URL.');

const downloadSchema = z.object({
  url: urlSchema,
  format: z.string().max(120).optional(),
  audioOnly: z.boolean().optional(),
});

const infoSchema = z.object({
  url: urlSchema,
});

export async function downloadController(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const parsed = downloadSchema.safeParse(req.body);
    if (!parsed.success) {
      throw parsed.error;
    }

    await streamDownload(parsed.data.url, res, {
      format: parsed.data.format,
      audioOnly: parsed.data.audioOnly,
    });
  } catch (err) {
    if (res.headersSent) {
      res.end();
      return;
    }
    next(err);
  }
}

export async function infoController(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const parsed = infoSchema.safeParse(req.body);
    if (!parsed.success) {
      throw parsed.error;
    }

    const info = await fetchMediaInfo(parsed.data.url);
    res.json({
      success: true,
      platform: info.platform,
      title: info.title,
      thumbnail: info.thumbnail,
      duration: info.duration,
      uploader: info.uploader,
      formats: info.formats,
    });
  } catch (err) {
    next(err);
  }
}
