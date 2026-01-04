import { Request, Response, NextFunction } from 'express';
import { AppError, isOperationalError } from '../utils/errors';
import { logger, logError } from '../utils/logger';

// Error response interface
interface ErrorResponse {
  success: false;
  error: {
    code: string;
    message: string;
    details?: any;
    requestId?: string;
  };
}

// Async handler wrapper to catch errors in async route handlers
export const asyncHandler = (fn: (req: Request, res: Response, next: NextFunction) => Promise<any>) => {
  return (req: Request, res: Response, next: NextFunction) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
};

// Format error response
const formatErrorResponse = (error: AppError | Error, requestId?: string, isDev: boolean = false): ErrorResponse => {
  const isAppError = error instanceof AppError;
  
  const response: ErrorResponse = {
    success: false,
    error: {
      code: isAppError ? error.code : 'INTERNAL_ERROR',
      message: isAppError ? error.message : 'An unexpected error occurred',
      requestId
    }
  };

  // Include stack trace in development
  if (isDev && error.stack) {
    response.error.details = {
      stack: error.stack.split('\n').slice(0, 5)
    };
  }

  return response;
};

// Handle specific error types
const handleMongoError = (error: any): AppError => {
  if (error.code === 11000) {
    return new AppError('Duplicate entry found', 409, 'DUPLICATE_ERROR');
  }
  if (error.name === 'ValidationError') {
    return new AppError('Database validation failed', 400, 'DB_VALIDATION_ERROR');
  }
  if (error.name === 'CastError') {
    return new AppError('Invalid ID format', 400, 'INVALID_ID');
  }
  return new AppError('Database operation failed', 500, 'DATABASE_ERROR');
};

const handleMulterError = (error: any): AppError => {
  if (error.code === 'LIMIT_FILE_SIZE') {
    return new AppError('File size exceeds the 100MB limit', 413, 'FILE_TOO_LARGE');
  }
  if (error.code === 'LIMIT_UNEXPECTED_FILE') {
    return new AppError('Unexpected file field', 400, 'UNEXPECTED_FILE');
  }
  return new AppError('File upload failed', 400, 'FILE_UPLOAD_ERROR');
};

const handleAPIError = (error: any): AppError => {
  const message = error.message || '';
  
  // Claude API errors
  if (message.includes('Claude') || message.includes('Anthropic')) {
    if (message.includes('rate limit')) {
      return new AppError('AI service is temporarily rate-limited. Please try again in a few minutes.', 429, 'CLAUDE_RATE_LIMIT');
    }
    if (message.includes('authentication') || message.includes('API key')) {
      return new AppError('AI service authentication failed', 401, 'CLAUDE_AUTH_ERROR');
    }
    if (message.includes('credit') || message.includes('quota')) {
      return new AppError('AI service credits exhausted', 402, 'CLAUDE_CREDITS_ERROR');
    }
    return new AppError('AI service error', 502, 'CLAUDE_API_ERROR');
  }
  
  // OpenAI API errors
  if (message.includes('OpenAI')) {
    if (message.includes('rate limit')) {
      return new AppError('Embedding service is temporarily rate-limited', 429, 'OPENAI_RATE_LIMIT');
    }
    if (message.includes('authentication') || message.includes('API key')) {
      return new AppError('Embedding service authentication failed', 401, 'OPENAI_AUTH_ERROR');
    }
    if (message.includes('quota')) {
      return new AppError('Embedding service quota exceeded', 402, 'OPENAI_QUOTA_ERROR');
    }
    return new AppError('Embedding service error', 502, 'OPENAI_API_ERROR');
  }
  
  return error;
};

// Global error handler middleware
export const errorHandler = (
  error: Error,
  req: Request,
  res: Response,
  _next: NextFunction
) => {
  const requestId = req.requestId;
  const isDev = process.env.NODE_ENV !== 'production';

  // Log the error
  logError(requestId, error, {
    method: req.method,
    path: req.path,
    body: req.body ? Object.keys(req.body) : undefined
  });

  // Handle specific error types
  let appError: AppError;

  if (error instanceof AppError) {
    appError = error;
  } else if (error.name === 'MongoError' || error.name === 'MongoServerError') {
    appError = handleMongoError(error);
  } else if (error.name === 'MulterError') {
    appError = handleMulterError(error);
  } else if (error.message?.includes('Invalid file type')) {
    appError = new AppError('Invalid file type. Only PDF, DOCX, TXT, MD, PNG, JPG, and JSON files are allowed.', 415, 'INVALID_FILE_TYPE');
  } else {
    appError = handleAPIError(error);
    if (!(appError instanceof AppError)) {
      appError = new AppError(
        isDev ? error.message : 'An unexpected error occurred',
        500,
        'INTERNAL_ERROR'
      );
    }
  }

  // Check if this is a programming error (non-operational)
  if (!isOperationalError(appError)) {
    logger.error('Programming error detected', {
      requestId,
      error: error.message,
      stack: error.stack
    });
  }

  // Send error response
  const response = formatErrorResponse(appError, requestId, isDev);
  res.status(appError.statusCode).json(response);
};

// 404 handler for undefined routes
export const notFoundHandler = (req: Request, res: Response) => {
  const response: ErrorResponse = {
    success: false,
    error: {
      code: 'NOT_FOUND',
      message: `Route ${req.method} ${req.path} not found`,
      requestId: req.requestId
    }
  };
  res.status(404).json(response);
};

export default errorHandler;
