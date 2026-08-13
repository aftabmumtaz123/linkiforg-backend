import { nanoid } from 'nanoid';
import { z } from 'zod';
import { getDownloadQueue } from '../services/queues/downloadQueue.js';
import { setJobState, getJobState, JobStatus } from '../services/queues/jobState.js';
import { validateAndNormalizeUrl, detectPlatform } from '../utils/urlValidator.js';
import { getSignedDownloadUrl } from '../services/storage/s3.js';
import { ValidationError, NotFoundError, JobError } from '../utils/errors.js';
import { logger } from '../utils/logger.js';

const createJobSchema = z.object({
  url: z.string().url().max(2048),
  quality: z.string().max(32).optional(),
});

/**
 * POST /api/download
 * Validates, detects platform, enqueues, returns jobId immediately.
 */
export async function createDownloadJob(req, res, next) {
  try {
    const body = createJobSchema.parse(req.body);
    const normalized = validateAndNormalizeUrl(body.url);
    const platform = detectPlatform(normalized);

    if (platform === 'unknown') {
      throw new ValidationError('Unable to detect a supported platform from the provided URL');
    }

    const jobId = `job_${nanoid(16)}`;
    const createdAt = Date.now();

    // Application-facing state
    await setJobState(jobId, {
      jobId,
      status: JobStatus.QUEUED,
      progress: 0,
      sourceUrl: normalized.href,
      platform,
      quality: body.quality || null,
      createdAt,
      message: 'Queued for processing',
    });

    // BullMQ job
    const queue = getDownloadQueue();
    await queue.add(
      'download',
      {
        jobId,
        sourceUrl: normalized.href,
        platform,
        quality: body.quality || null,
        createdAt,
      },
      {
        jobId, // use our ID for easier correlation
      }
    );

    logger.info({ jobId, platform }, 'Job enqueued');

    res.status(202).json({
      success: true,
      jobId,
      status: JobStatus.QUEUED,
      platform,
    });
  } catch (err) {
    if (err instanceof z.ZodError) {
      return next(new ValidationError('Invalid request body', err.flatten()));
    }
    next(err);
  }
}

/**
 * GET /api/jobs/:jobId
 */
export async function getJob(req, res, next) {
  try {
    const { jobId } = req.params;
    if (!jobId || !/^job_[A-Za-z0-9_-]+$/.test(jobId)) {
      throw new ValidationError('Invalid job ID');
    }

    const state = await getJobState(jobId);
    if (!state) {
      throw new NotFoundError('Job not found or expired');
    }

    // Never expose internal storage keys to the client in the status response
    // (download endpoint generates a signed URL on demand)
    const response = {
      jobId: state.jobId,
      status: state.status,
      progress: state.progress ?? 0,
      platform: state.platform,
      quality: state.quality,
      message: state.message,
      metadata: state.metadata || null,
      createdAt: state.createdAt,
      completedAt: state.completedAt || null,
      failedAt: state.failedAt || null,
      errorCode: state.errorCode || null,
      // Indicate whether a download is available
      downloadAvailable: state.status === JobStatus.COMPLETED && !!state.storageKey,
    };

    res.json({ success: true, job: response });
  } catch (err) {
    next(err);
  }
}

/**
 * GET /api/jobs/:jobId/download
 * Returns a short-lived signed URL.
 */
export async function getDownloadUrl(req, res, next) {
  try {
    const { jobId } = req.params;
    if (!jobId || !/^job_[A-Za-z0-9_-]+$/.test(jobId)) {
      throw new ValidationError('Invalid job ID');
    }

    const state = await getJobState(jobId);
    if (!state) {
      throw new NotFoundError('Job not found or expired');
    }

    if (state.status !== JobStatus.COMPLETED || !state.storageKey) {
      throw new JobError(
        state.status === JobStatus.FAILED
          ? 'Job failed; no file available'
          : 'File is not ready for download yet',
        'FILE_NOT_READY'
      );
    }

    const signedUrl = await getSignedDownloadUrl(state.storageKey, 900); // 15 min

    res.json({
      success: true,
      jobId,
      downloadUrl: signedUrl,
      expiresInSeconds: 900,
      filename: `${jobId}.mp4`,
    });
  } catch (err) {
    next(err);
  }
}
