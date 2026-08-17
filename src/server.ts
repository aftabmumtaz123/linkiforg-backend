import app from './app.js';
import { config } from './config/index.js';
import { cleanupAllJobs } from './services/jobStore.js';
import { logger } from './utils/logger.js';

const server = app.listen(config.port, () => {
  logger.info(
    { port: config.port, env: config.env },
    'Local API server listening',
  );
});

const shutdown = async (signal: string) => {
  logger.info({ signal }, 'Shutting down server');
  await cleanupAllJobs();
  server.close(() => process.exit(0));
};

process.on('SIGINT', () => void shutdown('SIGINT'));
process.on('SIGTERM', () => void shutdown('SIGTERM'));

process.on('unhandledRejection', (reason) => {
  logger.error({ reason }, 'Unhandled rejection');
});

process.on('uncaughtException', (err) => {
  logger.fatal({ err }, 'Uncaught exception');
  process.exit(1);
});
