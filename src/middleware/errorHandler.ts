import type { NextFunction, Request, Response } from 'express';
import { AppError } from '../utils/errors.js';
import { logger } from '../utils/logger.js';
import { config } from '../config/index.js';

export function errorHandler(
  err: unknown,
  req: Request,
  res: Response,
  _next: NextFunction,
): void {
  const appError = err instanceof AppError ? err : null;
  const statusCode = appError?.statusCode ?? 500;
  const code = appError?.code ?? 'INTERNAL_ERROR';
  const message = appError?.isOperational || statusCode < 500
    ? (err instanceof Error ? err.message : 'Request failed')
    : 'An unexpected error occurred';

  if (statusCode >= 500) {
    logger.error({ err, path: req.path, method: req.method }, 'Unhandled error');
  } else {
    logger.warn({ code, message, path: req.path }, 'Client error');
  }

  const body: { success: false; error: { code: string; message: string; details?: unknown } } = {
    success: false,
    error: { code, message },
  };

  if (config.env === 'development' && appError?.details != null) {
    body.error.details = appError.details;
  }

  res.status(statusCode).json(body);
}

export function notFoundHandler(req: Request, res: Response): void {
  res.status(404).json({
    success: false,
    error: {
      code: 'NOT_FOUND',
      message: `Route ${req.method} ${req.path} not found`,
    },
  });
}
