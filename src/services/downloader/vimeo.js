import { AuthorizationRequiredError } from '../../utils/errors.js';
import { logger } from '../../utils/logger.js';

/**
 * Vimeo adapter – STUB
 *
 * Vimeo offers download options for video owners and some licensed content
 * via their official API / dashboard. Integrating that path requires OAuth
 * and ownership verification. Until such an authorized integration is added,
 * this adapter refuses unauthenticated downloads.
 */
export const vimeoAdapter = {
  name: 'vimeo',

  async download({ sourceUrl, quality, jobId, onProgress }) {
    logger.info({ jobId, sourceUrl }, 'Vimeo adapter invoked – authorized path not yet integrated');

    if (typeof onProgress === 'function') {
      onProgress(5);
    }

    throw new AuthorizationRequiredError(
      'Vimeo downloads require ownership verification or an official authorized API path. ' +
        'Only process content you own or are explicitly authorized to download. ' +
        'This application will not bypass platform restrictions.'
    );
  },
};
