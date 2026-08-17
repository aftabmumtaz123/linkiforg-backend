import { runBtchDownload, type DownloadOptions } from './btch.js';
import type { MediaResult } from './index.js';

export async function downloadTwitter(
  url: string,
  options?: DownloadOptions
): Promise<MediaResult> {
  return runBtchDownload(url, 'twitter', options);
}
