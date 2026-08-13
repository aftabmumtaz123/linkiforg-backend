import { runBtchDownload, DownloadOptions } from './btch.js';
import { MediaResult } from './index.js';

export async function downloadTikTok(
  url: string,
  options?: DownloadOptions
): Promise<MediaResult> {
  return runBtchDownload(url, 'tiktok', options);
}
