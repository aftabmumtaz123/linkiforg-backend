import { AppError } from '../../utils/errors.js';
import type { SupportedPlatform } from '../../utils/urlValidator.js';
import { downloadYouTube } from './youtube.js';
import { downloadInstagram } from './instagram.js';
import { downloadTikTok } from './tiktok.js';
import { downloadFacebook } from './facebook.js';
import { downloadTwitter } from './twitter.js';
import { getBtchInfo, type DownloadOptions, type MediaInfo, type FormatOption } from './btch.js';

export interface MediaResult {
  title: string;
  thumbnail?: string;
  duration?: number;
  format: string;
  filePath: string;
  filesize?: number;
}

export type DownloaderFn = (
  url: string,
  options?: DownloadOptions
) => Promise<MediaResult>;

const providers: Record<SupportedPlatform, DownloaderFn> = {
  youtube: downloadYouTube,
  instagram: downloadInstagram,
  tiktok: downloadTikTok,
  facebook: downloadFacebook,
  twitter: downloadTwitter,
};

export async function getMedia(
  url: string,
  platform: SupportedPlatform,
  options?: DownloadOptions
): Promise<MediaResult> {
  const provider = providers[platform];
  if (!provider) {
    throw new AppError('Unsupported source', 400, 'UNSUPPORTED_PLATFORM');
  }
  return provider(url, options);
}

export async function getInfo(
  url: string,
  platform: SupportedPlatform
): Promise<MediaInfo> {
  return getBtchInfo(url, platform);
}

export type { DownloadOptions, MediaInfo, FormatOption };
