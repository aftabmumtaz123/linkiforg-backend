export class AppError extends Error {
  readonly statusCode: number;
  readonly code: string;
  readonly details?: unknown;
  readonly isOperational: boolean;

  constructor(
    message: string,
    statusCode = 500,
    code = 'INTERNAL_ERROR',
    details?: unknown
  ) {
    super(message);
    this.name = 'AppError';
    this.statusCode = statusCode;
    this.code = code;
    this.details = details;
    this.isOperational = true;
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

export class ValidationError extends AppError {
  constructor(message: string, details?: unknown) {
    super(message, 400, 'VALIDATION_ERROR', details);
    this.name = 'ValidationError';
  }
}

export class UnsupportedPlatformError extends AppError {
  constructor(platform: string, message?: string) {
    super(
      message ||
        `Platform "${platform}" is not supported. Only content you own or are authorized to download can be processed.`,
      400,
      'UNSUPPORTED_PLATFORM'
    );
    this.name = 'UnsupportedPlatformError';
  }
}

export class AuthorizationRequiredError extends AppError {
  constructor(
    message = 'Authorization required. Process only content you own or are authorized to download.'
  ) {
    super(message, 403, 'AUTHORIZATION_REQUIRED');
    this.name = 'AuthorizationRequiredError';
  }
}

export class NotFoundError extends AppError {
  constructor(message = 'Resource not found') {
    super(message, 404, 'NOT_FOUND');
    this.name = 'NotFoundError';
  }
}

export class RateLimitError extends AppError {
  constructor(message = 'Too many requests') {
    super(message, 429, 'RATE_LIMIT_EXCEEDED');
    this.name = 'RateLimitError';
  }
}

export class JobError extends AppError {
  constructor(message: string, code = 'JOB_ERROR') {
    super(message, 422, code);
    this.name = 'JobError';
  }
}
