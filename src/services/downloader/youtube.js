import { UnsupportedPlatformError, AuthorizationRequiredError } from '../../utils/errors.js';
import { logger } from '../../utils/logger.js';

/**
 * YouTube adapter – STUB
 *
 * YouTube does not provide a public, unauthenticated API that allows arbitrary
 * users to download arbitrary videos. Official paths require ownership / rights
 * management through YouTube Studio or the YouTube Data API with proper OAuth.
 *
 * This adapter intentionally refuses to perform any download that would
 * bypass platform restrictions, DRM, or Terms of Service.
 */
export const youtubeAdapter = {
  name: 'youtube',

  async download({ sourceUrl, quality, jobId, onProgress }) {
    logger.info({ jobId, sourceUrl, quality }, 'YouTube adapter invoked – no authorized public download path');

    // Progress callback is supported so the worker can still report status
    if (typeof onProgress === 'function') {
      onProgress(5);
    }

    throw new AuthorizationRequiredError(
      'YouTube does not provide an authorized public download mechanism for arbitrary videos. ' +
        'Only process content you own (e.g. via YouTube Studio export) or for which you have explicit permission. ' +
        'This application will not bypass platform restrictions, authentication, or DRM.'
    );
  },

  /**
   * Optional: return metadata only when an authorized source is later integrated.
   */
  async getMetadata() {
    throw new UnsupportedPlatformError('youtube');
  },
};
