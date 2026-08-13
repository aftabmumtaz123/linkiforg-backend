import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import pinoHttp from 'pino-http';
import { env } from './config/env.js';
import { logger } from './utils/logger.js';
import { errorHandler } from './middleware/errorHandler.js';
import downloadRoutes from './routes/downloadRoutes.js';
import { STORAGE_MODE, LOCAL_STORAGE_DIR } from './config/storage.js';

const app = express();

// Security headers
app.use(
  helmet({
    // Allow cross-origin media downloads from the frontend origin
    crossOriginResourcePolicy: { policy: 'cross-origin' },
  })
);

// CORS – only allow the frontend origin
app.use(
  cors({
    origin: env.FRONTEND_URL,
    methods: ['GET', 'POST', 'OPTIONS'],
    allowedHeaders: ['Content-Type'],
  })
);

// Request logging
app.use(
  pinoHttp({
    logger,
    autoLogging: {
      ignore: (req) => req.url === '/health' || req.url?.startsWith('/local-files'),
    },
  })
);

// Body limits
app.use(express.json({ limit: '16kb' }));
app.use(express.urlencoded({ extended: false, limit: '16kb' }));

// Health check
app.get('/health', (_req, res) => {
  res.json({
    status: 'ok',
    storageMode: STORAGE_MODE,
    timestamp: new Date().toISOString(),
  });
});

// Local filesystem storage (development only)
if (STORAGE_MODE === 'local') {
  app.use(
    '/local-files',
    express.static(LOCAL_STORAGE_DIR, {
      fallthrough: false,
      maxAge: '15m',
    })
  );
  logger.info({ dir: LOCAL_STORAGE_DIR }, 'Local storage mode enabled');
}

// API routes
app.use('/api', downloadRoutes);

// 404
app.use((_req, res) => {
  res.status(404).json({ success: false, message: 'Not found' });
});

// Centralized error handler (must be last)
app.use(errorHandler);

export default app;
