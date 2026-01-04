import {
  AppError,
  NotFoundError,
  ValidationError,
  RateLimitError,
  UnauthorizedError,
  ForbiddenError,
  AIServiceError,
  DatabaseError,
  FileProcessingError,
  isOperationalError
} from '../../utils/errors';

describe('Error Classes', () => {
  describe('AppError', () => {
    it('should create error with message and status code', () => {
      const error = new AppError('Test error', 500);
      
      expect(error.message).toBe('Test error');
      expect(error.statusCode).toBe(500);
      expect(error.isOperational).toBe(true);
    });

    it('should have default code when not provided', () => {
      const error = new AppError('Test error', 500);
      expect(error.code).toBe('UNKNOWN_ERROR');
    });

    it('should accept custom code', () => {
      const error = new AppError('Test error', 500, 'CUSTOM_CODE');
      expect(error.code).toBe('CUSTOM_CODE');
    });

    it('should be instance of Error', () => {
      const error = new AppError('Test error', 500);
      expect(error).toBeInstanceOf(Error);
    });

    it('should set status to fail for 4xx errors', () => {
      const error = new AppError('Not found', 404);
      expect(error.status).toBe('fail');
    });

    it('should set status to error for 5xx errors', () => {
      const error = new AppError('Server error', 500);
      expect(error.status).toBe('error');
    });
  });

  describe('NotFoundError', () => {
    it('should have 404 status code', () => {
      const error = new NotFoundError('Resource not found');
      
      expect(error.statusCode).toBe(404);
      expect(error.code).toBe('NOT_FOUND');
      expect(error.message).toBe('Resource not found');
    });

    it('should have default message', () => {
      const error = new NotFoundError();
      expect(error.message).toBe('Resource not found');
    });
  });

  describe('ValidationError', () => {
    it('should have 400 status code', () => {
      const error = new ValidationError('Invalid input');
      
      expect(error.statusCode).toBe(400);
      expect(error.code).toBe('VALIDATION_ERROR');
    });

    it('should have default message', () => {
      const error = new ValidationError();
      expect(error.message).toBe('Validation failed');
    });
  });

  describe('RateLimitError', () => {
    it('should have 429 status code', () => {
      const error = new RateLimitError();
      
      expect(error.statusCode).toBe(429);
      expect(error.code).toBe('RATE_LIMIT_EXCEEDED');
    });

    it('should have default message', () => {
      const error = new RateLimitError();
      expect(error.message).toContain('Too many requests');
    });
  });

  describe('UnauthorizedError', () => {
    it('should have 401 status code', () => {
      const error = new UnauthorizedError('Invalid token');
      
      expect(error.statusCode).toBe(401);
      expect(error.code).toBe('UNAUTHORIZED');
    });
  });

  describe('ForbiddenError', () => {
    it('should have 403 status code', () => {
      const error = new ForbiddenError('Access denied');
      
      expect(error.statusCode).toBe(403);
      expect(error.code).toBe('FORBIDDEN');
    });
  });

  describe('AIServiceError', () => {
    it('should have 502 status code', () => {
      const error = new AIServiceError('AI service unavailable');
      
      expect(error.statusCode).toBe(502);
      expect(error.code).toBe('AI_SERVICE_ERROR');
    });
  });

  describe('DatabaseError', () => {
    it('should have 500 status code', () => {
      const error = new DatabaseError('Database connection failed');
      
      expect(error.statusCode).toBe(500);
      expect(error.code).toBe('DATABASE_ERROR');
    });
  });

  describe('FileProcessingError', () => {
    it('should have 422 status code', () => {
      const error = new FileProcessingError('Failed to process file');
      
      expect(error.statusCode).toBe(422);
      expect(error.code).toBe('FILE_PROCESSING_ERROR');
    });
  });

  describe('isOperationalError', () => {
    it('should return true for AppError instances', () => {
      const error = new AppError('Test', 500);
      expect(isOperationalError(error)).toBe(true);
    });

    it('should return true for operational errors', () => {
      const error = new NotFoundError('Not found');
      expect(isOperationalError(error)).toBe(true);
    });

    it('should return false for regular errors', () => {
      const error = new Error('Regular error');
      expect(isOperationalError(error)).toBe(false);
    });
  });
});
