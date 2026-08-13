import type { ErrorRequestHandler, NextFunction, Request, Response } from 'express';
import { ZodError } from 'zod';
import { AppError } from '../utils/errors.js';
import { logger } from '../utils/logger.js';

export const errorHandler: ErrorRequestHandler = (
  err: unknown,
  req: Request,
  res: Response,
  _next: NextFunction
) => {
  if (res.headersSent) {
    return;
  }

  if (err instanceof ZodError) {
    res.status(400).json({
      success: false,
      error: {
        code: 'VALIDATION_ERROR',
        message: 'Invalid request data.',
        details: err.flatten(),
      },
    });
    return;
  }

  const appError =
    err instanceof AppError
      ? err
      : new AppError(
          err instanceof Error ? err.message : 'Internal server error',
          500,
          'INTERNAL_ERROR'
        );

  if (appError.statusCode >= 500) {
    logger.error({ err, path: req.path, method: req.method }, 'Unhandled error');
  } else {
    logger.warn(
      { code: appError.code, message: appError.message, path: req.path },
      'Client error'
    );
  }

  res.status(appError.statusCode).json({
    success: false,
    error: {
      code: appError.code,
      message: appError.message,
      ...(configEnvIsDevelopment() && appError.details
        ? { details: appError.details }
        : {}),
    },
  });
};

function configEnvIsDevelopment(): boolean {
  return process.env.NODE_ENV !== 'production';
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
