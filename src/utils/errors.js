export class AppError extends Error {
  constructor(message, statusCode = 500, code = 'INTERNAL_ERROR', details = null) {
    super(message);
    this.name = 'AppError';
    this.statusCode = statusCode;
    this.code = code;
    this.details = details;
    this.isOperational = true;
  }
}

export class ValidationError extends AppError {
  constructor(message, details = null) {
    super(message, 400, 'VALIDATION_ERROR', details);
    this.name = 'ValidationError';
  }
}

export class UnsupportedPlatformError extends AppError {
  constructor(platform, message = null) {
    super(
      message ||
        `Platform "${platform}" does not provide an authorized download mechanism. Only content you own or are authorized to download can be processed.`,
      400,
      'UNSUPPORTED_PLATFORM'
    );
    this.name = 'UnsupportedPlatformError';
  }
}

export class AuthorizationRequiredError extends AppError {
  constructor(message = 'Authorization required. Process only content you own or are authorized to download.') {
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
  constructor(message, code = 'JOB_ERROR') {
    super(message, 422, code);
    this.name = 'JobError';
  }
}
