import { AuthorizationRequiredError } from '../../utils/errors.js';
import { logger } from '../../utils/logger.js';

/**
 * Instagram adapter – STUB
 *
 * Instagram does not offer a public download API for arbitrary media.
 * Content owners can use official export tools. This adapter refuses
 * any attempt that would circumvent platform access controls.
 */
export const instagramAdapter = {
  name: 'instagram',

  async download({ sourceUrl, quality, jobId, onProgress }) {
    logger.info({ jobId, sourceUrl }, 'Instagram adapter invoked – no authorized public download path');

    if (typeof onProgress === 'function') {
      onProgress(5);
    }

    throw new AuthorizationRequiredError(
      'Instagram does not provide an authorized public download mechanism for arbitrary posts. ' +
        'Only process content you own or for which you have explicit permission. ' +
        'This application will not bypass platform restrictions or authentication.'
    );
  },
};
