import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import rateLimit from 'express-rate-limit';
import { config } from './config/index.js';
import downloadRoutes from './routes/downloadRoutes.js';
import { errorHandler, notFoundHandler } from './middleware/errorHandler.js';
import { logger } from './utils/logger.js';

const app = express();

app.set('trust proxy', 1);

app.use(
  helmet({
    crossOriginResourcePolicy: { policy: 'cross-origin' },
  })
);

app.use(
  cors({
    origin: config.corsOrigin,
    credentials: true,
  })
);

app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: false }));

app.use(
  morgan(config.env === 'production' ? 'combined' : 'dev', {
    stream: {
      write: (message: string) => logger.info(message.trim()),
    },
  })
);

app.use(
  rateLimit({
    windowMs: config.rateLimit.windowMs,
    limit: config.rateLimit.max,
    standardHeaders: true,
    legacyHeaders: false,
  })
);

app.get('/health', (_req, res) => {
  res.json({ success: true, status: 'ok' });
});

app.use('/api', downloadRoutes);

app.use(notFoundHandler);
app.use(errorHandler);

export default app;
