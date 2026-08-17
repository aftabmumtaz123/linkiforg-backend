import type { Response } from 'express';
import { createReadStream, promises as fs } from 'node:fs';
import { pipeline } from 'node:stream/promises';
import { getBtchInfo, runBtchDownload, type DownloadOptions, type MediaInfo } from './downloader/btch.js';
import { validateMediaUrl, type SupportedPlatform } from '../utils/urlValidator.js';
import { AppError } from '../utils/errors.js';

export async function fetchMediaInfo(
  rawUrl: string,
): Promise<MediaInfo & { platform: SupportedPlatform }> {
  const validated = validateMediaUrl(rawUrl);
  if (!validated.valid || !validated.platform || !validated.normalizedUrl) {
    throw new AppError(validated.error ?? 'Unsupported source.', 400, 'INVALID_URL');
  }

  const info = await getBtchInfo(validated.normalizedUrl, validated.platform);
  return { ...info, platform: validated.platform };
}

export async function streamDownload(
  rawUrl: string,
  res: Response,
  options: DownloadOptions = {},
): Promise<void> {
  const validated = validateMediaUrl(rawUrl);
  if (!validated.valid || !validated.platform || !validated.normalizedUrl) {
    throw new AppError(validated.error ?? 'Unsupported source.', 400, 'INVALID_URL');
  }

  const result = await runBtchDownload(validated.normalizedUrl, validated.platform, options);
  const filename = sanitizeFileName(result.title) + `.${result.format}`;
  const contentType = result.format === 'mp3' ? 'audio/mpeg' : 'video/mp4';

  try {
    const stat = await fs.stat(result.filePath);
    res.setHeader('Content-Type', contentType);
    res.setHeader('Content-Length', stat.size);
    res.setHeader('Content-Disposition', `attachment; filename="${filename.replace(/"/g, '')}"`);
    await pipeline(createReadStream(result.filePath), res);
  } finally {
    await fs.unlink(result.filePath).catch(() => undefined);
  }
}

function sanitizeFileName(value: string): string {
  const cleaned = value
    .replace(/[<>:"/\\|?*\u0000-\u001F]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 100);
  return cleaned || 'download';
}
