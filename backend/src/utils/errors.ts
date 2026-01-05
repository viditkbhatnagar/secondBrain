// Base application error class
export class AppError extends Error {
  public readonly statusCode: number;
  public readonly status: 'fail' | 'error';
  public readonly isOperational: boolean;
  public readonly code: string;

  constructor(message: string, statusCode: number, code?: string) {
    super(message);
    this.statusCode = statusCode;
    this.status = statusCode.toString().startsWith('4') ? 'fail' : 'error';
    this.isOperational = true;
    this.code = code || 'UNKNOWN_ERROR';

    Error.captureStackTrace(this, this.constructor);
    Object.setPrototypeOf(this, AppError.prototype);
  }
}

// 400 - Bad Request
export class ValidationError extends AppError {
  constructor(message: string = 'Validation failed') {
    super(message, 400, 'VALIDATION_ERROR');
  }
}

// 401 - Unauthorized
export class UnauthorizedError extends AppError {
  constructor(message: string = 'Unauthorized access') {
    super(message, 401, 'UNAUTHORIZED');
  }
}

// 403 - Forbidden
export class ForbiddenError extends AppError {
  constructor(message: string = 'Access forbidden') {
    super(message, 403, 'FORBIDDEN');
  }
}

// 404 - Not Found
export class NotFoundError extends AppError {
  constructor(message: string = 'Resource not found') {
    super(message, 404, 'NOT_FOUND');
  }
}

// 409 - Conflict
export class ConflictError extends AppError {
  constructor(message: string = 'Resource conflict') {
    super(message, 409, 'CONFLICT');
  }
}

// 429 - Rate Limit
export class RateLimitError extends AppError {
  constructor(message: string = 'Too many requests. Please try again later.') {
    super(message, 429, 'RATE_LIMIT_EXCEEDED');
  }
}

// 500 - Internal Server Error
export class InternalError extends AppError {
  constructor(message: string = 'Internal server error') {
    super(message, 500, 'INTERNAL_ERROR');
  }
}

// 503 - Service Unavailable
export class ServiceUnavailableError extends AppError {
  constructor(message: string = 'Service temporarily unavailable') {
    super(message, 503, 'SERVICE_UNAVAILABLE');
  }
}

// AI Service specific errors
export class AIServiceError extends AppError {
  constructor(message: string = 'AI service error', code: string = 'AI_SERVICE_ERROR') {
    super(message, 502, code);
  }
}

export class OpenAIAPIError extends AIServiceError {
  constructor(message: string = 'OpenAI API error') {
    super(message, 'OPENAI_API_ERROR');
  }
}

// Database errors
export class DatabaseError extends AppError {
  constructor(message: string = 'Database operation failed') {
    super(message, 500, 'DATABASE_ERROR');
  }
}

// File processing errors
export class FileProcessingError extends AppError {
  constructor(message: string = 'File processing failed') {
    super(message, 422, 'FILE_PROCESSING_ERROR');
  }
}

export class FileTooLargeError extends AppError {
  constructor(message: string = 'File size exceeds limit') {
    super(message, 413, 'FILE_TOO_LARGE');
  }
}

export class InvalidFileTypeError extends AppError {
  constructor(message: string = 'Invalid file type') {
    super(message, 415, 'INVALID_FILE_TYPE');
  }
}

// Search errors
export class SearchError extends AppError {
  constructor(message: string = 'Search operation failed') {
    super(message, 500, 'SEARCH_ERROR');
  }
}

export class NoDocumentsError extends AppError {
  constructor(message: string = 'No documents available for search') {
    super(message, 404, 'NO_DOCUMENTS');
  }
}

// Helper to check if error is operational (expected) vs programming error
export const isOperationalError = (error: Error): boolean => {
  if (error instanceof AppError) {
    return error.isOperational;
  }
  return false;
};
