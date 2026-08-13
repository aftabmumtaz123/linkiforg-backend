import { youtubeAdapter } from './youtube.js';
import { instagramAdapter } from './instagram.js';
import { tiktokAdapter } from './tiktok.js';
import { vimeoAdapter } from './vimeo.js';
import { UnsupportedPlatformError } from '../../utils/errors.js';

/**
 * Adapter interface contract:
 *
 * async download(ctx) → {
 *   buffer or stream,
 *   contentType,
 *   sizeBytes,
 *   metadata: { title, duration, thumbnailUrl?, ... },
 *   quality?
 * }
 *
 * ctx = { sourceUrl, quality, jobId, onProgress }
 *
 * Implementations MUST only return media the caller is authorized to obtain.
 * If no authorized path exists, throw UnsupportedPlatformError or AuthorizationRequiredError.
 */

const adapters = {
  youtube: youtubeAdapter,
  instagram: instagramAdapter,
  tiktok: tiktokAdapter,
  vimeo: vimeoAdapter,
};

export function getDownloader(platform) {
  const adapter = adapters[platform];
  if (!adapter) {
    throw new UnsupportedPlatformError(platform);
  }
  return adapter;
}

export function listSupportedPlatforms() {
  return Object.keys(adapters);
}
