import { createReadStream, promises as fs } from 'fs';
import { Response } from 'express';
import { getMedia, getInfo, DownloadOptions, MediaInfo } from './downloader/index.js';
import { processMedia } from './media/mediaProcessor.js';
import { cleanupFile } from './downloader/btch.js';
import { validateMediaUrl, SupportedPlatform } from '../utils/urlValidator.js';
import { logger } from '../utils/logger.js';
import { AppError } from '../middleware/errorHandler.js';
import { MAX_FILE_SIZE_BYTES } from '../config/storage.js';

export interface MediaMeta {
  platform: SupportedPlatform;
  title: string;
  thumbnail?: string;
  duration?: number;
  format: string;
  fileSize: number;
  fileName: string;
}

export interface StreamDownloadOptions {
  format?: string;
  audioOnly?: boolean;
}

/**
 * Return available formats and metadata without downloading.
 */
export async function fetchMediaInfo(rawUrl: string): Promise<MediaInfo & { platform: SupportedPlatform }> {
  const validation = validateMediaUrl(rawUrl);
  if (!validation.valid || !validation.platform || !validation.normalizedUrl) {
    throw new AppError(validation.error || 'Invalid URL', 400, 'INVALID_URL');
  }

  const { platform, normalizedUrl } = validation;
  logger.info({ platform, host: new URL(normalizedUrl).hostname }, 'Media info requested');

  const info = await getInfo(normalizedUrl, platform);
  return { ...info, platform };
}

/**
 * Process media and stream it directly to the client.
 * Nothing is stored permanently — temp files are deleted after the stream ends.
 */
export async function streamDownload(
  rawUrl: string,
  res: Response,
  options: StreamDownloadOptions = {}
): Promise<void> {
  const validation = validateMediaUrl(rawUrl);
  if (!validation.valid || !validation.platform || !validation.normalizedUrl) {
    throw new AppError(validation.error || 'Invalid URL', 400, 'INVALID_URL');
  }

  const { platform, normalizedUrl } = validation;
  const urlHost = new URL(normalizedUrl).hostname;

  logger.info({ platform, urlHost, options }, 'Media processing started');

  let localPath: string | null = null;
  let processedPath: string | null = null;

  try {
    const downloadOpts: DownloadOptions = {
      format: options.format,
      audioOnly: options.audioOnly,
    };

    const media = await getMedia(normalizedUrl, platform, downloadOpts);
    localPath = media.filePath;

    // Only run FFmpeg when we need audio extraction and the file is not already audio
    const alreadyAudio = ['mp3', 'm4a', 'opus', 'aac'].includes(
      (media.format || '').toLowerCase()
    );
    const processOpts =
      options.audioOnly && !alreadyAudio
        ? { extractAudio: true as const }
        : {};

    const processed = await processMedia(localPath, processOpts);
    processedPath = processed.filePath;

    const stats = await fs.stat(processedPath);
    if (stats.size > MAX_FILE_SIZE_BYTES) {
      throw new AppError(
        `File exceeds maximum allowed size of ${MAX_FILE_SIZE_BYTES / (1024 * 1024)} MB`,
        413,
        'FILE_TOO_LARGE'
      );
    }

    const safeTitle = (media.title || 'media')
      .replace(/[<>:"/\\|?*\x00-\x1f]/g, '')
      .trim()
      .slice(0, 120) || 'media';

    const fileName = `${safeTitle}.${processed.format}`;
    const contentType =
      processed.format === 'mp3' || processed.format === 'm4a' || processed.format === 'opus'
        ? 'audio/mpeg'
        : 'video/mp4';

    res.setHeader('X-Media-Platform', platform);
    res.setHeader('X-Media-Title', encodeURIComponent(media.title || 'Untitled'));
    res.setHeader('X-Media-Format', processed.format);
    res.setHeader('X-Media-Size', String(stats.size));
    if (media.duration != null) {
      res.setHeader('X-Media-Duration', String(Math.round(media.duration)));
    }
    if (media.thumbnail) {
      res.setHeader('X-Media-Thumbnail', encodeURIComponent(media.thumbnail));
    }

    res.setHeader('Content-Type', contentType);
    res.setHeader('Content-Length', String(stats.size));
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="${fileName.replace(/"/g, '')}"; filename*=UTF-8''${encodeURIComponent(fileName)}`
    );
    res.setHeader(
      'Access-Control-Expose-Headers',
      'X-Media-Platform, X-Media-Title, X-Media-Format, X-Media-Size, X-Media-Duration, X-Media-Thumbnail, Content-Disposition, Content-Length'
    );

    logger.info(
      { platform, title: media.title, size: stats.size },
      'Streaming media to client'
    );

    await new Promise<void>((resolve, reject) => {
      const stream = createReadStream(processedPath!);

      stream.on('error', (err) => {
        logger.error({ err }, 'Read stream error');
        reject(new AppError('Failed to read processed media.', 500, 'PROCESSING_FAILURE'));
      });

      res.on('close', () => {
        stream.destroy();
      });

      stream.on('end', () => resolve());
      stream.pipe(res);
    });
  } finally {
    if (localPath) await cleanupFile(localPath);
    if (processedPath && processedPath !== localPath) {
      await cleanupFile(processedPath);
    }
  }
}
