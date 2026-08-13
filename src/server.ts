import app from './app.js';
import { env } from './config/env.js';
import { logger } from './utils/logger.js';

const port = env.PORT;

app.listen(port, () => {
  logger.info({ port, env: env.NODE_ENV }, 'MediaProcess API listening');
});
