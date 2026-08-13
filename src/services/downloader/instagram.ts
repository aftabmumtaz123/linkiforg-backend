import { runBtchDownload, DownloadOptions } from './btch.js';
import { MediaResult } from './index.js';

export async function downloadInstagram(
  url: string,
  options?: DownloadOptions
): Promise<MediaResult> {
  return runBtchDownload(url, 'instagram', options);
}
