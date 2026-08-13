import app from './app.js';
import { config } from './config/index.js';
import { getRedisConnection } from './services/queues/redis.js';
import { logger } from './utils/logger.js';

async function start() {
  try {
    // Ensure Redis is reachable
    const redis = getRedisConnection();
    await redis.connect();
    logger.info('Redis ready');

    app.listen(config.port, () => {
      logger.info({ port: config.port, env: config.env }, 'API server listening');
    });
  } catch (err) {
    logger.fatal({ err }, 'Failed to start server');
    process.exit(1);
  }
}

start();

process.on('unhandledRejection', (reason) => {
  logger.error({ reason }, 'Unhandled rejection');
});

process.on('uncaughtException', (err) => {
  logger.fatal({ err }, 'Uncaught exception');
  process.exit(1);
});
