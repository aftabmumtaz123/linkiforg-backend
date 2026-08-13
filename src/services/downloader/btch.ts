import { createWriteStream, promises as fs } from 'fs';
import path from 'path';
import os from 'os';
import { pipeline } from 'stream/promises';
import { Readable } from 'stream';
import { v4 as uuidv4 } from 'uuid';
import {
  youtube,
  ttdl,
  igdl,
  fbdown,
  twitter,
} from 'btch-downloader';
import { logger } from '../../utils/logger.js';
import { AppError } from '../../utils/errors.js';
import type { SupportedPlatform } from '../../utils/urlValidator.js';
import type { MediaResult } from './index.js';

const TMP_ROOT = path.join(os.tmpdir(), 'mediaprocess');

export interface FormatOption {
  formatId: string;
  ext: string;
  resolution?: string;
  height?: number;
  width?: number;
  fps?: number;
  vcodec?: string;
  acodec?: string;
  filesize?: number;
  filesizeApprox?: number;
  tbr?: number;
  formatNote?: string;
  type: 'video' | 'audio' | 'combined';
  label: string;
}

export interface MediaInfo {
  title: string;
  thumbnail?: string;
  duration?: number;
  uploader?: string;
  formats: FormatOption[];
}

export interface DownloadOptions {
  /** Format id from MediaInfo, e.g. "mp4", "mp3", "best" */
  format?: string;
  audioOnly?: boolean;
}

interface NormalizedMedia {
  title: string;
  thumbnail?: string;
  duration?: number;
  uploader?: string;
  /** Preferred video URL */
  videoUrl?: string;
  /** Preferred audio URL */
  audioUrl?: string;
  /** Extra media URLs (e.g. Instagram carousel) */
  mediaUrls: string[];
  raw: unknown;
}

async function ensureDir(dir: string) {
  await fs.mkdir(dir, { recursive: true });
}

function firstString(...values: unknown[]): string | undefined {
  for (const v of values) {
    if (typeof v === 'string' && v.trim().startsWith('http')) return v.trim();
    if (Array.isArray(v)) {
      for (const item of v) {
        if (typeof item === 'string' && item.trim().startsWith('http')) {
          return item.trim();
        }
        if (item && typeof item === 'object') {
          const obj = item as Record<string, unknown>;
          const nested = firstString(obj.url, obj.link, obj.video, obj.mp4, obj.hd, obj.sd);
          if (nested) return nested;
        }
      }
    }
    if (v && typeof v === 'object') {
      const obj = v as Record<string, unknown>;
      const nested = firstString(obj.url, obj.link, obj.video, obj.mp4, obj.hd, obj.sd);
      if (nested) return nested;
    }
  }
  return undefined;
}

function collectUrls(...values: unknown[]): string[] {
  const out: string[] = [];
  const seen = new Set<string>();

  const push = (u?: string) => {
    if (!u || seen.has(u)) return;
    seen.add(u);
    out.push(u);
  };

  for (const v of values) {
    if (typeof v === 'string' && v.trim().startsWith('http')) {
      push(v.trim());
    } else if (Array.isArray(v)) {
      for (const item of v) {
        if (typeof item === 'string') push(item.trim());
        else if (item && typeof item === 'object') {
          const obj = item as Record<string, unknown>;
          push(firstString(obj.url, obj.link, obj.video, obj.mp4, obj.hd, obj.sd));
        }
      }
    } else if (v && typeof v === 'object') {
      const obj = v as Record<string, unknown>;
      push(firstString(obj.url, obj.link, obj.video, obj.mp4, obj.hd, obj.sd));
    }
  }
  return out;
}

function mapProviderFailure(message: string, platform: string): AppError {
  const lower = (message || '').toLowerCase();

  if (
    lower.includes('503') ||
    lower.includes('502') ||
    lower.includes('504') ||
    lower.includes('service unavailable') ||
    lower.includes('bad gateway') ||
    lower.includes('gateway timeout') ||
    lower.includes('timeout') ||
    lower.includes('econnreset') ||
    lower.includes('enotfound') ||
    lower.includes('network') ||
    lower.includes('fetch failed')
  ) {
    return new AppError(
      'Media provider is temporarily unavailable. Please try again in a moment.',
      503,
      'PROVIDER_UNAVAILABLE'
    );
  }

  if (
    lower.includes('private') ||
    lower.includes('login') ||
    lower.includes('sign in') ||
    lower.includes('unauthorized') ||
    lower.includes('age-restricted') ||
    lower.includes('restricted')
  ) {
    return new AppError(
      'This media is private, restricted, or requires authorization that we cannot provide.',
      403,
      'UNAUTHORIZED_MEDIA'
    );
  }

  if (lower.includes('not found') || lower.includes('404')) {
    return new AppError(
      'Media not found or has been removed.',
      404,
      'MEDIA_NOT_FOUND'
    );
  }

  return new AppError(
    message?.trim()
      ? message.trim().slice(0, 200)
      : `Unable to process this ${platform} URL.`,
    422,
    'MEDIA_UNAVAILABLE'
  );
}

function assertSuccess(data: unknown, platform: string): Record<string, unknown> {
  if (!data || typeof data !== 'object') {
    throw new AppError(
      `Unable to process this ${platform} URL.`,
      422,
      'MEDIA_UNAVAILABLE'
    );
  }
  const obj = data as Record<string, unknown>;
  if (obj.status === false) {
    const msg =
      (typeof obj.message === 'string' && obj.message) ||
      'Unable to process this media URL.';
    throw mapProviderFailure(msg, platform);
  }
  return obj;
}

/**
 * Call the appropriate btch-downloader function and normalize the response.
 */
async function callBtchOnce(url: string, platform: SupportedPlatform): Promise<unknown> {
  switch (platform) {
    case 'youtube':
      return youtube(url);
    case 'tiktok':
      return ttdl(url);
    case 'instagram':
      return igdl(url);
    case 'facebook':
      return fbdown(url);
    case 'twitter':
      return twitter(url);
    default:
      throw new AppError('Unsupported source', 400, 'UNSUPPORTED_PLATFORM');
  }
}

function isRetryableProviderError(err: unknown): boolean {
  if (err instanceof AppError) {
    return err.code === 'PROVIDER_UNAVAILABLE' || err.statusCode === 503;
  }
  const message = (err instanceof Error ? err.message : String(err)).toLowerCase();
  return (
    message.includes('503') ||
    message.includes('502') ||
    message.includes('service unavailable') ||
    message.includes('timeout') ||
    message.includes('econnreset') ||
    message.includes('fetch failed')
  );
}

async function fetchBtchRaw(
  url: string,
  platform: SupportedPlatform
): Promise<NormalizedMedia> {
  logger.info({ platform }, 'Fetching media via btch-downloader');

  let data: unknown;
  const maxAttempts = 3;
  let lastError: unknown;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      data = await callBtchOnce(url, platform);

      // API returned a structured failure — maybe retry
      if (data && typeof data === 'object' && !Array.isArray(data)) {
        const obj = data as Record<string, unknown>;
        if (obj.status === false) {
          const msg = typeof obj.message === 'string' ? obj.message : 'request failed';
          const mapped = mapProviderFailure(msg, platform);
          if (mapped.code === 'PROVIDER_UNAVAILABLE' && attempt < maxAttempts) {
            logger.warn(
              { platform, attempt, msg },
              'btch provider unavailable, retrying'
            );
            await new Promise((r) => setTimeout(r, 800 * attempt));
            lastError = mapped;
            continue;
          }
          throw mapped;
        }
      }
      lastError = undefined;
      break;
    } catch (err) {
      if (err instanceof AppError && err.code !== 'PROVIDER_UNAVAILABLE') {
        throw err;
      }
      lastError = err;
      if (attempt < maxAttempts && isRetryableProviderError(err)) {
        logger.warn(
          {
            platform,
            attempt,
            err: err instanceof Error ? err.message : String(err),
          },
          'btch call failed, retrying'
        );
        await new Promise((r) => setTimeout(r, 800 * attempt));
        continue;
      }
      if (err instanceof AppError) throw err;
      const message = err instanceof Error ? err.message : String(err);
      logger.warn({ platform, err: message }, 'btch-downloader failed');
      throw mapProviderFailure(message, platform);
    }
  }

  if (lastError) {
    if (lastError instanceof AppError) throw lastError;
    throw mapProviderFailure(
      lastError instanceof Error ? lastError.message : String(lastError),
      platform
    );
  }

  // Instagram sometimes returns an array of items
  if (Array.isArray(data)) {
    const mediaUrls = collectUrls(data);
    if (!mediaUrls.length) {
      throw new AppError('No downloadable media found.', 422, 'MEDIA_UNAVAILABLE');
    }
    const first = (data[0] && typeof data[0] === 'object' ? data[0] : {}) as Record<
      string,
      unknown
    >;
    return {
      title: String(first.title || first.caption || 'Untitled'),
      thumbnail: firstString(first.thumbnail, first.thumb, first.cover),
      uploader: first.author ? String(first.author) : undefined,
      videoUrl: mediaUrls[0],
      audioUrl: undefined,
      mediaUrls,
      raw: data,
    };
  }

  const obj = assertSuccess(data, platform);

  // YouTube-style: mp4 + mp3
  if (platform === 'youtube') {
    return {
      title: String(obj.title || 'Untitled'),
      thumbnail: firstString(obj.thumbnail, obj.thumb),
      uploader: obj.author ? String(obj.author) : undefined,
      duration: typeof obj.duration === 'number' ? obj.duration : undefined,
      videoUrl: firstString(obj.mp4, obj.video, obj.url),
      audioUrl: firstString(obj.mp3, obj.audio),
      mediaUrls: collectUrls(obj.mp4, obj.mp3, obj.video, obj.audio, obj.url),
      raw: obj,
    };
  }

  // Facebook often has HD / Normal_video
  if (platform === 'facebook') {
    const videoUrl = firstString(obj.HD, obj.Normal_video, obj.hd, obj.sd, obj.url, obj.video);
    return {
      title: String(obj.title || 'Untitled'),
      thumbnail: firstString(obj.thumbnail, obj.thumb),
      videoUrl,
      audioUrl: undefined,
      mediaUrls: collectUrls(obj.HD, obj.Normal_video, obj.hd, obj.sd, obj.url, obj.video),
      raw: obj,
    };
  }

  // TikTok / Twitter / generic
  const videoUrl = firstString(
    obj.video,
    obj.mp4,
    obj.url,
    obj.hd,
    obj.play,
    obj.wmplay,
    (obj as { data?: unknown }).data
  );
  const audioUrl = firstString(obj.audio, obj.mp3, obj.music);

  const mediaUrls = collectUrls(
    obj.video,
    obj.mp4,
    obj.url,
    obj.hd,
    obj.audio,
    obj.mp3,
    obj.images,
    obj.photo
  );

  if (!videoUrl && !audioUrl && mediaUrls.length === 0) {
    // Some APIs nest under result
    const result = obj.result;
    if (result) {
      const nestedUrls = collectUrls(result);
      if (nestedUrls.length) {
        return {
          title: String(obj.title || 'Untitled'),
          thumbnail: firstString(obj.thumbnail, obj.thumb),
          uploader: obj.author ? String(obj.author) : undefined,
          videoUrl: nestedUrls[0],
          audioUrl: undefined,
          mediaUrls: nestedUrls,
          raw: obj,
        };
      }
    }
    throw new AppError('No downloadable media found.', 422, 'MEDIA_UNAVAILABLE');
  }

  return {
    title: String(obj.title || 'Untitled'),
    thumbnail: firstString(obj.thumbnail, obj.thumb, obj.cover),
    duration: typeof obj.duration === 'number' ? obj.duration : undefined,
    uploader:
      obj.author != null
        ? String(obj.author)
        : obj.uploader != null
          ? String(obj.uploader)
          : undefined,
    videoUrl,
    audioUrl,
    mediaUrls: mediaUrls.length ? mediaUrls : [videoUrl, audioUrl].filter(Boolean) as string[],
    raw: obj,
  };
}

function buildFormats(media: NormalizedMedia): FormatOption[] {
  const formats: FormatOption[] = [];

  if (media.videoUrl) {
    formats.push({
      formatId: 'mp4',
      ext: 'mp4',
      type: 'combined',
      resolution: 'best',
      label: 'Best quality (video)',
    });
  }

  if (media.audioUrl) {
    formats.push({
      formatId: 'mp3',
      ext: 'mp3',
      type: 'audio',
      label: 'Audio only (MP3)',
    });
  }

  // Fallback if only generic media URLs exist
  if (!formats.length && media.mediaUrls.length) {
    formats.push({
      formatId: 'best',
      ext: 'mp4',
      type: 'combined',
      resolution: 'best',
      label: 'Best available',
    });
  }

  return formats;
}

/**
 * Fetch metadata + available formats without downloading the file.
 */
export async function getBtchInfo(
  url: string,
  platform: SupportedPlatform
): Promise<MediaInfo> {
  const media = await fetchBtchRaw(url, platform);
  const formats = buildFormats(media);

  if (!formats.length) {
    throw new AppError('No downloadable formats found.', 422, 'MEDIA_UNAVAILABLE');
  }

  return {
    title: media.title,
    thumbnail: media.thumbnail,
    duration: media.duration,
    uploader: media.uploader,
    formats,
  };
}

function pickDownloadUrl(
  media: NormalizedMedia,
  options: DownloadOptions
): { url: string; ext: string } {
  const format = (options.format || '').toLowerCase();
  const wantAudio =
    options.audioOnly ||
    format === 'mp3' ||
    format === 'bestaudio' ||
    format === 'bestaudio/b' ||
    format.includes('audio');

  if (wantAudio) {
    if (media.audioUrl) return { url: media.audioUrl, ext: 'mp3' };
    // Fall back to video if no dedicated audio stream
    if (media.videoUrl) return { url: media.videoUrl, ext: 'mp4' };
  }

  if (format === 'mp3' && media.audioUrl) {
    return { url: media.audioUrl, ext: 'mp3' };
  }

  if (media.videoUrl) return { url: media.videoUrl, ext: 'mp4' };
  if (media.mediaUrls[0]) {
    const u = media.mediaUrls[0];
    const ext = u.includes('.mp3') || u.includes('audio') ? 'mp3' : 'mp4';
    return { url: u, ext };
  }
  if (media.audioUrl) return { url: media.audioUrl, ext: 'mp3' };

  throw new AppError('No downloadable media found.', 422, 'MEDIA_UNAVAILABLE');
}

/**
 * Resolve media URL via btch-downloader, download to a temp file, return path.
 */
export async function runBtchDownload(
  url: string,
  platform: SupportedPlatform,
  options: DownloadOptions = {}
): Promise<MediaResult> {
  const media = await fetchBtchRaw(url, platform);
  const picked = pickDownloadUrl(media, options);

  // Build candidate URL list (preferred first, then any other resolved links)
  const candidates: { url: string; ext: string }[] = [picked];
  for (const u of media.mediaUrls) {
    if (!u || u === picked.url) continue;
    const lower = u.toLowerCase();
    const e =
      lower.includes('.mp3') || lower.includes('audio')
        ? 'mp3'
        : lower.includes('.webm')
          ? 'webm'
          : 'mp4';
    // Prefer matching audio/video intent
    if (options.audioOnly && e !== 'mp3') continue;
    candidates.push({ url: u, ext: e });
  }

  const jobId = uuidv4();
  const jobDir = path.join(TMP_ROOT, jobId);
  await ensureDir(jobDir);

  let lastDownloadError: unknown;

  for (const candidate of candidates) {
    const mediaUrl = candidate.url;
    const ext = candidate.ext;
    const filePath = path.join(jobDir, `media.${ext}`);

    logger.info({ platform, mediaUrl: mediaUrl.slice(0, 120) }, 'Downloading media file');

  try {
    let mediaHost = '';
    try {
      mediaHost = new URL(mediaUrl).origin;
    } catch {
      mediaHost = '';
    }

    const ua =
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36';

    // CDNs often enforce hotlink protection — try several Referer/Origin combos
    const headerAttempts: Record<string, string>[] = [
      {
        'User-Agent': ua,
        Accept: '*/*',
        'Accept-Language': 'en-US,en;q=0.9',
        Referer: mediaHost ? `${mediaHost}/` : url,
        Origin: mediaHost || undefined as unknown as string,
      },
      {
        'User-Agent': ua,
        Accept: '*/*',
        'Accept-Language': 'en-US,en;q=0.9',
        Referer: url,
      },
      {
        'User-Agent': ua,
        Accept: '*/*',
        'Accept-Language': 'en-US,en;q=0.9',
        Referer: 'https://www.youtube.com/',
      },
      {
        'User-Agent': ua,
        Accept: '*/*',
        'Accept-Language': 'en-US,en;q=0.9',
      },
    ].map((h) => {
      // Drop undefined values
      const clean: Record<string, string> = {};
      for (const [k, v] of Object.entries(h)) {
        if (v) clean[k] = v;
      }
      return clean;
    });

    let response: Response | null = null;
    let lastStatus = 0;

    for (let i = 0; i < headerAttempts.length; i++) {
      response = await fetch(mediaUrl, {
        headers: headerAttempts[i],
        redirect: 'follow',
        signal: AbortSignal.timeout(5 * 60 * 1000),
      });
      lastStatus = response.status;
      if (response.ok) break;

      logger.warn(
        { platform, attempt: i + 1, status: response.status },
        'Media CDN rejected download, trying alternate headers'
      );
      // Drain body to free connection
      try {
        await response.arrayBuffer();
      } catch {
        // ignore
      }
      response = null;
    }

    if (!response || !response.ok) {
      if (lastStatus === 403 || lastStatus === 401) {
        throw new AppError(
          'The media CDN blocked the download (HTTP 403). The link may be hotlink-protected or expired — try again.',
          422,
          'CDN_BLOCKED'
        );
      }
      throw new AppError(
        `Failed to download media (HTTP ${lastStatus || 'unknown'}).`,
        422,
        'MEDIA_UNAVAILABLE'
      );
    }

    if (!response.body) {
      throw new AppError('Empty download response.', 500, 'PROCESSING_FAILURE');
    }

    const nodeStream = Readable.fromWeb(
      response.body as import('stream/web').ReadableStream
    );
    await pipeline(nodeStream, createWriteStream(filePath));

    const stats = await fs.stat(filePath);
    if (!stats.isFile() || stats.size === 0) {
      await fs.rm(jobDir, { recursive: true, force: true }).catch(() => undefined);
      throw new AppError('Downloaded file is empty or invalid.', 500, 'PROCESSING_FAILURE');
    }

    logger.info(
      { platform, title: media.title, size: stats.size, filePath },
      'btch download complete'
    );

    return {
      title: media.title,
      thumbnail: media.thumbnail,
      duration: media.duration,
      format: ext,
      filePath,
      filesize: stats.size,
    };
  } catch (err) {
    lastDownloadError = err;
    logger.warn(
      {
        platform,
        err: err instanceof Error ? err.message : String(err),
      },
      'Candidate media URL failed, trying next if available'
    );
    // continue to next candidate
  }
  } // end candidates loop

  await fs.rm(jobDir, { recursive: true, force: true }).catch(() => undefined);
  if (lastDownloadError instanceof AppError) throw lastDownloadError;
  logger.error({ err: lastDownloadError }, 'Failed to download media from resolved URL');
  throw new AppError('Failed to download media file.', 500, 'PROCESSING_FAILURE');
}

export async function cleanupFile(filePath: string) {
  try {
    await fs.unlink(filePath);
    const parent = path.dirname(filePath);
    if (parent.includes('mediaprocess')) {
      await fs.rm(parent, { recursive: true, force: true }).catch(() => undefined);
    }
  } catch {
    // ignore
  }
}
