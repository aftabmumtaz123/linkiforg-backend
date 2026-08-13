import Redis from 'ioredis';
import { config } from '../../config/index.js';
import { logger } from '../../utils/logger.js';

let connection = null;

export function getRedisConnection() {
  if (connection) return connection;

  connection = new Redis({
    host: config.redis.host,
    port: config.redis.port,
    password: config.redis.password,
    maxRetriesPerRequest: null, // required by BullMQ
    enableReadyCheck: true,
    lazyConnect: true,
  });

  connection.on('connect', () => logger.info('Redis connected'));
  connection.on('error', (err) => logger.error({ err }, 'Redis error'));

  return connection;
}

export async function closeRedis() {
  if (connection) {
    await connection.quit();
    connection = null;
  }
}
