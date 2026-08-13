import { spawn } from 'child_process';
import path from 'path';
import { promises as fs } from 'fs';
import { v4 as uuidv4 } from 'uuid';
import os from 'os';
import { logger } from '../../utils/logger.js';
import { AppError } from '../../middleware/errorHandler.js';
import { env } from '../../config/env.js';
import { MediaResult } from './index.js';

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
  /** video | audio | video+audio */
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
  /** yt-dlp format id or selector string, e.g. "22", "bv*[height<=720]+ba", "bestaudio" */
  format?: string;
  /** Force audio extraction to mp3 */
  audioOnly?: boolean;
}

async function ensureDir(dir: string) {
  await fs.mkdir(dir, { recursive: true });
}

function runCommand(
  bin: string,
  args: string[],
  timeoutMs: number
): Promise<{ code: number | null; stdout: string; stderr: string }> {
  return new Promise((resolve, reject) => {
    const proc = spawn(bin, args, {
      stdio: ['ignore', 'pipe', 'pipe'],
      windowsHide: true,
    });

    let stdout = '';
    let stderr = '';

    proc.stdout.on('data', (d) => {
      stdout += d.toString();
    });
    proc.stderr.on('data', (d) => {
      stderr += d.toString();
    });

    const timer = setTimeout(() => {
      proc.kill('SIGKILL');
      reject(new AppError('Media download timed out.', 504, 'TIMEOUT'));
    }, timeoutMs);

    proc.on('error', (err) => {
      clearTimeout(timer);
      reject(err);
    });

    proc.on('close', (code) => {
      clearTimeout(timer);
      resolve({ code, stdout, stderr });
    });
  });
}

function mapYtDlpError(stderr: string, platformLabel: string, code: number | null): AppError {
  logger.warn(
    { platform: platformLabel, code, stderr: stderr.slice(0, 800) },
    'yt-dlp failed'
  );

  const lower = stderr.toLowerCase();
  if (
    lower.includes('private') ||
    lower.includes('login required') ||
    lower.includes('sign in') ||
    lower.includes('members only') ||
    lower.includes('confirm your age') ||
    lower.includes('age-restricted')
  ) {
    return new AppError(
      'This media is private, restricted, or requires authorization that we cannot provide.',
      403,
      'UNAUTHORIZED_MEDIA'
    );
  }

  if (lower.includes('ffmpeg') || lower.includes('ffprobe')) {
    return new AppError(
      'FFmpeg is required to process this media. Please install FFmpeg and ensure it is on PATH.',
      500,
      'FFMPEG_MISSING'
    );
  }

  if (
    lower.includes('http error 403') ||
    lower.includes('403: forbidden') ||
    lower.includes('unable to download video data')
  ) {
    return new AppError(
      'YouTube blocked the download (HTTP 403). Update yt-dlp to the latest version (yt-dlp -U) and try again. Some videos also require a newer client.',
      422,
      'YOUTUBE_BLOCKED'
    );
  }

  return new AppError(
    'Unable to process this media URL. It may be unavailable or restricted.',
    422,
    'MEDIA_UNAVAILABLE'
  );
}

function formatBytes(bytes?: number): string {
  if (!bytes || !Number.isFinite(bytes)) return '';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function buildFormatLabel(f: {
  height?: number;
  width?: number;
  resolution?: string;
  fps?: number;
  ext?: string;
  filesize?: number;
  filesizeApprox?: number;
  formatNote?: string;
  acodec?: string;
  vcodec?: string;
  type: 'video' | 'audio' | 'combined';
}): string {
  const size = formatBytes(f.filesize || f.filesizeApprox);
  if (f.type === 'audio') {
    const note = f.formatNote || f.ext || 'audio';
    return [note, size].filter(Boolean).join(' · ');
  }
  const res =
    f.resolution ||
    (f.height ? `${f.height}p` : f.width ? `${f.width}w` : 'unknown');
  const fps = f.fps && f.fps > 30 ? `${Math.round(f.fps)}fps` : '';
  const ext = f.ext || '';
  return [res, fps, ext, size].filter(Boolean).join(' · ');
}

/**
 * Fetch metadata + available formats without downloading.
 */
export async function getYtDlpInfo(
  url: string,
  platformLabel: string
): Promise<MediaInfo> {
  const ytdlpBin = env.YTDLP_PATH || 'yt-dlp';
  const args = [
    '--no-playlist',
    '--no-warnings',
    '--extractor-args',
    'youtube:player_client=android,web',
    '-J',
    '--no-download',
    url,
  ];

  logger.info({ platform: platformLabel }, 'Fetching media info via yt-dlp');

  let result: { code: number | null; stdout: string; stderr: string };
  try {
    result = await runCommand(ytdlpBin, args, 60_000);
  } catch (err) {
    if (err instanceof AppError) throw err;
    logger.error({ err }, 'Failed to spawn yt-dlp for info');
    throw new AppError(
      'Media downloader is not available on this server. Install yt-dlp and ensure it is on PATH.',
      500,
      'DOWNLOADER_MISSING'
    );
  }

  if (result.code !== 0) {
    throw mapYtDlpError(result.stderr, platformLabel, result.code);
  }

  let data: Record<string, unknown>;
  try {
    data = JSON.parse(result.stdout);
  } catch {
    throw new AppError('Failed to parse media information.', 500, 'PROCESSING_FAILURE');
  }

  const rawFormats = (data.formats as Array<Record<string, unknown>>) || [];
  const formats: FormatOption[] = [];
  const seen = new Set<string>();

  for (const f of rawFormats) {
    const formatId = String(f.format_id ?? '');
    if (!formatId) continue;

    const vcodec = f.vcodec && f.vcodec !== 'none' ? String(f.vcodec) : undefined;
    const acodec = f.acodec && f.acodec !== 'none' ? String(f.acodec) : undefined;
    const hasVideo = Boolean(vcodec);
    const hasAudio = Boolean(acodec);

    if (!hasVideo && !hasAudio) continue;
    const ext = String(f.ext || 'mp4');
    if (['mhtml', 'sbv', 'srt', 'vtt', 'json', 'xml'].includes(ext)) continue;

    let type: FormatOption['type'] = 'combined';
    if (hasVideo && !hasAudio) type = 'video';
    else if (!hasVideo && hasAudio) type = 'audio';

    const height = typeof f.height === 'number' ? f.height : undefined;
    const width = typeof f.width === 'number' ? f.width : undefined;
    const fps = typeof f.fps === 'number' ? f.fps : undefined;

    const dedupeKey =
      type === 'audio'
        ? `a-${ext}-${acodec}-${f.abr || ''}`
        : `v-${height || 0}-${fps || 0}-${ext}-${type}`;
    if (seen.has(dedupeKey)) continue;
    seen.add(dedupeKey);

    const option: FormatOption = {
      formatId,
      ext,
      resolution: height ? `${height}p` : width ? `${width}w` : undefined,
      height,
      width,
      fps,
      vcodec,
      acodec,
      filesize: typeof f.filesize === 'number' ? f.filesize : undefined,
      filesizeApprox: typeof f.filesize_approx === 'number' ? f.filesize_approx : undefined,
      tbr: typeof f.tbr === 'number' ? f.tbr : undefined,
      formatNote: f.format_note ? String(f.format_note) : undefined,
      type,
      label: '',
    };
    option.label = buildFormatLabel(option);
    formats.push(option);
  }

  formats.sort((a, b) => {
    const order = { combined: 0, video: 1, audio: 2 };
    if (order[a.type] !== order[b.type]) return order[a.type] - order[b.type];
    return (b.height || 0) - (a.height || 0);
  });

  // Prefer separate video+audio merges — more reliable on YouTube than progressive "best"
  const presets: FormatOption[] = [
    {
      formatId: 'bv*+ba/b',
      ext: 'mp4',
      type: 'combined',
      label: 'Best quality (video + audio)',
      resolution: 'best',
    },
    {
      formatId: 'bv*[height<=1080]+ba/b[height<=1080]/b',
      ext: 'mp4',
      type: 'combined',
      height: 1080,
      resolution: '1080p',
      label: '1080p (or best below)',
    },
    {
      formatId: 'bv*[height<=720]+ba/b[height<=720]/b',
      ext: 'mp4',
      type: 'combined',
      height: 720,
      resolution: '720p',
      label: '720p (or best below)',
    },
    {
      formatId: 'bv*[height<=480]+ba/b[height<=480]/b',
      ext: 'mp4',
      type: 'combined',
      height: 480,
      resolution: '480p',
      label: '480p (or best below)',
    },
    {
      formatId: 'bestaudio/b',
      ext: 'm4a',
      type: 'audio',
      label: 'Audio only (best)',
    },
  ];

  const usefulFormats = formats.filter(
    (f) =>
      f.type === 'combined' ||
      (f.type === 'video' && (f.height || 0) >= 360) ||
      f.type === 'audio'
  );

  let thumbnail: string | undefined;
  if (typeof data.thumbnail === 'string') {
    thumbnail = data.thumbnail;
  } else if (Array.isArray(data.thumbnails) && data.thumbnails.length) {
    const thumbs = data.thumbnails as Array<{ url?: string }>;
    thumbnail = thumbs[thumbs.length - 1]?.url || undefined;
  }

  return {
    title: String(data.title || 'Untitled'),
    thumbnail,
    duration: typeof data.duration === 'number' ? data.duration : undefined,
    uploader: data.uploader ? String(data.uploader) : undefined,
    formats: [...presets, ...usefulFormats.slice(0, 40)],
  };
}

/**
 * Uses yt-dlp for public, authorized media only.
 * Does not attempt to bypass login, DRM, or age gates.
 */
export async function runYtDlp(
  url: string,
  platformLabel: string,
  options: DownloadOptions = {}
): Promise<MediaResult> {
  const jobId = uuidv4();
  const jobDir = path.join(TMP_ROOT, jobId);
  await ensureDir(jobDir);

  const outputTemplate = path.join(jobDir, 'media.%(ext)s');
  const ytdlpBin = env.YTDLP_PATH || 'yt-dlp';

  // Normalize legacy / UI presets that YouTube often 403s on
  let formatSelector = options.format || 'bv*+ba/b';
  const legacyMap: Record<string, string> = {
    best: 'bv*+ba/b',
    'best[height<=1080]': 'bv*[height<=1080]+ba/b[height<=1080]/b',
    'best[height<=720]': 'bv*[height<=720]+ba/b[height<=720]/b',
    'best[height<=480]': 'bv*[height<=480]+ba/b[height<=480]/b',
    bestaudio: 'bestaudio/b',
  };
  if (formatSelector && legacyMap[formatSelector]) {
    formatSelector = legacyMap[formatSelector];
  }
  if (options.audioOnly) {
    formatSelector = options.format && !legacyMap[options.format]
      ? options.format
      : 'bestaudio/b';
  }

  const args = [
    '--no-playlist',
    '--no-warnings',
    '--newline',
    // Mitigate YouTube 403 / SABR issues — android + web clients
    '--extractor-args',
    'youtube:player_client=android,web',
    // Prefer HLS when available (often more reliable than progressive)
    '--hls-prefer-native',
    '--concurrent-fragments',
    '4',
    '--retries',
    '5',
    '--fragment-retries',
    '5',
    '--retry-sleep',
    'http:2',
    '--print',
    'after_move:filepath',
    '--print',
    'before_dl:title',
    '--print',
    'before_dl:thumbnail',
    '--print',
    'before_dl:duration',
    '--print',
    'before_dl:ext',
    '-o',
    outputTemplate,
    '-f',
    formatSelector,
    '--merge-output-format',
    options.audioOnly ? 'mp3' : 'mp4',
  ];

  if (options.audioOnly) {
    args.push('-x', '--audio-format', 'mp3', '--audio-quality', '0');
  }

  args.push(url);

  logger.info(
    { platform: platformLabel, jobId, format: formatSelector, audioOnly: options.audioOnly },
    'Starting yt-dlp'
  );

  let result: { code: number | null; stdout: string; stderr: string };
  try {
    result = await runCommand(ytdlpBin, args, 900_000); // 15 minutes
  } catch (err) {
    await fs.rm(jobDir, { recursive: true, force: true }).catch(() => undefined);
    if (err instanceof AppError) throw err;
    logger.error({ err }, 'Failed to spawn yt-dlp');
    throw new AppError(
      'Media downloader is not available on this server. Install yt-dlp and ensure it is on PATH.',
      500,
      'DOWNLOADER_MISSING'
    );
  }

  if (result.code !== 0) {
    await fs.rm(jobDir, { recursive: true, force: true }).catch(() => undefined);
    throw mapYtDlpError(result.stderr, platformLabel, result.code);
  }

  try {
    const lines = result.stdout
      .split(/\r?\n/)
      .map((l) => l.trim())
      .filter(Boolean);

    const pathCandidates = lines.filter(
      (l) =>
        (l.includes(jobDir) || l.includes('media.')) &&
        /\.(mp4|webm|mkv|m4a|mp3|opus|mov)$/i.test(l)
    );

    let filePath = pathCandidates[pathCandidates.length - 1];

    if (!filePath) {
      const files = await fs.readdir(jobDir);
      const mediaFile = files.find((f) =>
        /\.(mp4|webm|mkv|m4a|mp3|opus|mov)$/i.test(f)
      );
      if (mediaFile) {
        filePath = path.join(jobDir, mediaFile);
      }
    }

    if (!filePath) {
      logger.error(
        {
          stdout: result.stdout.slice(0, 1000),
          stderr: result.stderr.slice(0, 1000),
          jobDir,
        },
        'yt-dlp finished but no media file found'
      );
      await fs.rm(jobDir, { recursive: true, force: true }).catch(() => undefined);
      throw new AppError('Downloaded file not found.', 500, 'PROCESSING_FAILURE');
    }

    filePath = path.normalize(filePath);

    const stats = await fs.stat(filePath);
    if (!stats.isFile() || stats.size === 0) {
      await fs.rm(jobDir, { recursive: true, force: true }).catch(() => undefined);
      throw new AppError('Downloaded file is empty or invalid.', 500, 'PROCESSING_FAILURE');
    }

    const nonPathLines = lines.filter((l) => l !== filePath && !pathCandidates.includes(l));
    const title =
      nonPathLines.find(
        (l) =>
          !/^https?:\/\//i.test(l) &&
          !/^\d+(\.\d+)?$/.test(l) &&
          !/^(mp4|webm|mkv|m4a|mp3|opus|mov)$/i.test(l)
      ) || 'Untitled';

    const thumbnail = nonPathLines.find((l) => /^https?:\/\//i.test(l));
    const durationRaw = nonPathLines.find((l) => /^\d+(\.\d+)?$/.test(l));
    const duration = durationRaw ? Number(durationRaw) : undefined;
    const ext =
      path.extname(filePath).slice(1) ||
      nonPathLines.find((l) => /^(mp4|webm|mkv|m4a|mp3|opus|mov)$/i.test(l)) ||
      (options.audioOnly ? 'mp3' : 'mp4');

    logger.info(
      { platform: platformLabel, title, size: stats.size, filePath },
      'yt-dlp download complete'
    );

    return {
      title,
      thumbnail,
      duration: Number.isFinite(duration) ? duration : undefined,
      format: ext,
      filePath,
      filesize: stats.size,
    };
  } catch (err) {
    if (err instanceof AppError) throw err;
    logger.error({ err }, 'Failed to parse yt-dlp output');
    await fs.rm(jobDir, { recursive: true, force: true }).catch(() => undefined);
    throw new AppError('Failed to process downloaded media.', 500);
  }
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
