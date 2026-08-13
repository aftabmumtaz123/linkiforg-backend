import { Queue } from 'bullmq';
import { getRedisConnection } from './redis.js';
import { config } from '../../config/index.js';
import { logger } from '../../utils/logger.js';

export const DOWNLOAD_QUEUE_NAME = 'download';

let downloadQueue = null;

export function getDownloadQueue() {
  if (downloadQueue) return downloadQueue;

  downloadQueue = new Queue(DOWNLOAD_QUEUE_NAME, {
    connection: getRedisConnection(),
    defaultJobOptions: {
      attempts: 3,
      backoff: {
        type: 'exponential',
        delay: 5000,
      },
      removeOnComplete: {
        age: config.job.ttlMs / 1000, // seconds
        count: 1000,
      },
      removeOnFail: {
        age: config.job.ttlMs / 1000,
      },
    },
  });

  downloadQueue.on('error', (err) => {
    logger.error({ err }, 'Download queue error');
  });

  return downloadQueue;
}

/**
 * Job data shape stored in BullMQ.
 * @typedef {Object} DownloadJobData
 * @property {string} jobId
 * @property {string} sourceUrl
 * @property {string} platform
 * @property {string} [quality]
 * @property {number} createdAt
 */
