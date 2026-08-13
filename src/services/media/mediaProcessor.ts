import ffmpeg from 'fluent-ffmpeg';
import path from 'path';
import { promises as fs } from 'fs';
import { v4 as uuidv4 } from 'uuid';
import { logger } from '../../utils/logger.js';
import { AppError } from '../../middleware/errorHandler.js';
import { env } from '../../config/env.js';

if (env.FFMPEG_PATH) {
  ffmpeg.setFfmpegPath(env.FFMPEG_PATH);
}

export interface ProcessOptions {
  convertTo?: 'mp4' | 'mp3' | 'webm';
  extractAudio?: boolean;
  maxDurationSeconds?: number;
}

export interface ProcessedMedia {
  filePath: string;
  format: string;
  duration?: number;
  size: number;
}

/**
 * Only run FFmpeg when conversion or extraction is actually required.
 * Prefer keeping original containers when possible.
 */
export async function processMedia(
  inputPath: string,
  options: ProcessOptions = {}
): Promise<ProcessedMedia> {
  const needsProcessing =
    options.extractAudio ||
    options.convertTo ||
    options.maxDurationSeconds !== undefined;

  if (!needsProcessing) {
    const stats = await fs.stat(inputPath);
    return {
      filePath: inputPath,
      format: path.extname(inputPath).slice(1) || 'mp4',
      size: stats.size,
    };
  }

  const outExt = options.extractAudio ? 'mp3' : options.convertTo || 'mp4';
  const outputPath = path.join(
    path.dirname(inputPath),
    `${uuidv4()}.${outExt}`
  );

  return new Promise((resolve, reject) => {
    let command = ffmpeg(inputPath);

    if (options.maxDurationSeconds) {
      command = command.setDuration(options.maxDurationSeconds);
    }

    if (options.extractAudio) {
      command = command.noVideo().audioCodec('libmp3lame').format('mp3');
    } else if (options.convertTo === 'mp4') {
      // Stream copy when possible to avoid quality loss
      command = command
        .videoCodec('copy')
        .audioCodec('copy')
        .format('mp4')
        .outputOptions(['-movflags', '+faststart']);
    } else if (options.convertTo === 'webm') {
      command = command.videoCodec('libvpx-vp9').audioCodec('libopus').format('webm');
    }

    command
      .on('start', (cmd) => {
        logger.debug({ cmd }, 'FFmpeg started');
      })
      .on('error', (err) => {
        logger.error({ err }, 'FFmpeg processing failed');
        reject(new AppError('Media processing failed.', 500, 'FFMPEG_FAILURE'));
      })
      .on('end', async () => {
        try {
          const stats = await fs.stat(outputPath);
          resolve({
            filePath: outputPath,
            format: outExt,
            size: stats.size,
          });
        } catch (e) {
          reject(new AppError('Failed to read processed file.', 500));
        }
      })
      .save(outputPath);
  });
}

export async function getMediaDuration(filePath: string): Promise<number | undefined> {
  return new Promise((resolve) => {
    ffmpeg.ffprobe(filePath, (err, data) => {
      if (err) {
        resolve(undefined);
        return;
      }
      resolve(data.format.duration);
    });
  });
}
