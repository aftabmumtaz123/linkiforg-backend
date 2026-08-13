import { AuthorizationRequiredError } from '../../utils/errors.js';
import { logger } from '../../utils/logger.js';

/**
 * TikTok adapter – STUB
 *
 * TikTok does not provide a public, unauthenticated download API for
 * arbitrary videos. Official creator tools exist for content owners.
 */
export const tiktokAdapter = {
  name: 'tiktok',

  async download({ sourceUrl, quality, jobId, onProgress }) {
    logger.info({ jobId, sourceUrl }, 'TikTok adapter invoked – no authorized public download path');

    if (typeof onProgress === 'function') {
      onProgress(5);
    }

    throw new AuthorizationRequiredError(
      'TikTok does not provide an authorized public download mechanism for arbitrary videos. ' +
        'Only process content you own or for which you have explicit permission. ' +
        'This application will not bypass platform restrictions or authentication.'
    );
  },
};
