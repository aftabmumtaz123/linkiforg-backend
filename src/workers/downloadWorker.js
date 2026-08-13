import { Worker } from 'bullmq';
import { getRedisConnection } from '../services/queues/redis.js';
import { DOWNLOAD_QUEUE_NAME } from '../services/queues/downloadQueue.js';
import { updateJobState, JobStatus } from '../services/queues/jobState.js';
import { getDownloader } from '../services/downloader/index.js';
import { uploadObject, videoKey, thumbnailKey } from '../services/storage/s3.js';
import { config } from '../config/index.js';
import { logger } from '../utils/logger.js';
import { AppError, AuthorizationRequiredError, UnsupportedPlatformError } from '../utils/errors.js';

const connection = getRedisConnection();

async function processJob(job) {
  const { jobId, sourceUrl, platform, quality } = job.data;
  logger.info({ jobId, platform, sourceUrl }, 'Worker picked up job');

  await updateJobState(jobId, {
    status: JobStatus.PROCESSING,
    progress: 0,
    message: 'Starting authorized media processing',
  });

  const onProgress = async (pct) => {
    const clamped = Math.max(0, Math.min(90, Math.round(pct)));
    await updateJobState(jobId, { progress: clamped });
    await job.updateProgress(clamped);
  };

  try {
    const adapter = getDownloader(platform);

    // Hard timeout around the entire adapter call
    const result = await Promise.race([
      adapter.download({ sourceUrl, quality, jobId, onProgress }),
      new Promise((_, reject) =>
        setTimeout(
          () => reject(new AppError('Processing timed out', 408, 'PROCESSING_TIMEOUT')),
          config.job.processingTimeoutMs
        )
      ),
    ]);

    // If an adapter ever returns real media (authorized path only), handle it:
    if (!result || !result.buffer) {
      throw new AppError('Downloader returned empty result', 500, 'EMPTY_RESULT');
    }

    if (result.sizeBytes > config.job.maxFileSizeBytes) {
      throw new AppError(
        `File exceeds maximum allowed size of ${config.job.maxFileSizeMb} MB`,
        413,
        'FILE_TOO_LARGE'
      );
    }

    await updateJobState(jobId, {
      status: JobStatus.UPLOADING,
      progress: 92,
      message: 'Uploading to storage',
      metadata: result.metadata || null,
    });

    const ext = (result.contentType || 'video/mp4').includes('webm') ? 'webm' : 'mp4';
    const vKey = videoKey(jobId, ext);
    await uploadObject(vKey, result.buffer, result.contentType || 'video/mp4', result.sizeBytes);

    let tKey = null;
    if (result.thumbnailBuffer) {
      tKey = thumbnailKey(jobId, 'jpg');
      await uploadObject(tKey, result.thumbnailBuffer, 'image/jpeg');
    }

    await updateJobState(jobId, {
      status: JobStatus.COMPLETED,
      progress: 100,
      message: 'Completed',
      storageKey: vKey,
      thumbnailKey: tKey,
      metadata: result.metadata || null,
      completedAt: Date.now(),
    });

    logger.info({ jobId }, 'Job completed successfully');
    return { jobId, storageKey: vKey };
  } catch (err) {
    const isAuth =
      err instanceof AuthorizationRequiredError ||
      err instanceof UnsupportedPlatformError ||
      err?.code === 'AUTHORIZATION_REQUIRED' ||
      err?.code === 'UNSUPPORTED_PLATFORM';

    const message = isAuth
      ? err.message
      : err?.message || 'Processing failed';

    logger.error({ jobId, err: message, code: err?.code }, 'Job failed');

    await updateJobState(jobId, {
      status: JobStatus.FAILED,
      progress: 0,
      message,
      errorCode: err?.code || 'JOB_FAILED',
      failedAt: Date.now(),
    });

    // Re-throw so BullMQ records the failure and can retry (or not)
    // Auth errors should not be retried aggressively – mark as non-retryable
    if (isAuth) {
      const nonRetryable = new Error(message);
      nonRetryable.name = err.name || 'AuthorizationError';
      throw nonRetryable;
    }
    throw err;
  }
}

const worker = new Worker(DOWNLOAD_QUEUE_NAME, processJob, {
  connection,
  concurrency: config.job.maxConcurrent,
  limiter: {
    max: config.job.maxConcurrent,
    duration: 1000,
  },
});

worker.on('completed', (job) => {
  logger.info({ jobId: job.data.jobId }, 'Worker: job completed event');
});

worker.on('failed', (job, err) => {
  logger.warn({ jobId: job?.data?.jobId, err: err?.message }, 'Worker: job failed event');
});

worker.on('error', (err) => {
  logger.error({ err }, 'Worker error');
});

logger.info(
  { concurrency: config.job.maxConcurrent, queue: DOWNLOAD_QUEUE_NAME },
  'Download worker started'
);

// Graceful shutdown
async function shutdown() {
  logger.info('Worker shutting down…');
  await worker.close();
  process.exit(0);
}

process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);
