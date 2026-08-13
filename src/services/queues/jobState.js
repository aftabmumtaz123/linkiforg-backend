import { getRedisConnection } from './redis.js';
import { config } from '../../config/index.js';
import { logger } from '../../utils/logger.js';

const PREFIX = 'job:';

/**
 * Extended job state kept in Redis (progress, metadata, storage keys, etc.).
 * BullMQ holds the queue state; this is the application-facing view.
 */
export async function setJobState(jobId, data) {
  const redis = getRedisConnection();
  const key = `${PREFIX}${jobId}`;
  const payload = {
    ...data,
    updatedAt: Date.now(),
  };
  await redis.set(key, JSON.stringify(payload), 'EX', Math.floor(config.job.ttlMs / 1000));
  return payload;
}

export async function getJobState(jobId) {
  const redis = getRedisConnection();
  const raw = await redis.get(`${PREFIX}${jobId}`);
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch (err) {
    logger.warn({ jobId, err }, 'Failed to parse job state');
    return null;
  }
}

export async function updateJobState(jobId, partial) {
  const current = (await getJobState(jobId)) || {};
  return setJobState(jobId, { ...current, ...partial });
}

export async function deleteJobState(jobId) {
  const redis = getRedisConnection();
  await redis.del(`${PREFIX}${jobId}`);
}

export const JobStatus = {
  QUEUED: 'queued',
  PROCESSING: 'processing',
  UPLOADING: 'uploading',
  COMPLETED: 'completed',
  FAILED: 'failed',
};
