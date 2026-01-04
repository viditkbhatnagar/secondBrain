import { Request, Response, NextFunction } from 'express';
import { ZodSchema, ZodError } from 'zod';
import { logger } from '../utils/logger';

/**
 * Validation error response format
 */
interface ValidationErrorResponse {
  success: false;
  error: {
    code: string;
    message: string;
    details?: Array<{
      field: string;
      message: string;
    }>;
    requestId?: string;
  };
}

/**
 * Format Zod errors into user-friendly format
 */
const formatZodErrors = (error: ZodError): Array<{ field: string; message: string }> => {
  return error.errors.map(err => ({
    field: err.path.join('.') || 'body',
    message: err.message
  }));
};

/**
 * Validate request body against a Zod schema
 */
export const validateBody = <T>(schema: ZodSchema<T>) => {
  return (req: Request, res: Response, next: NextFunction) => {
    try {
      const result = schema.parse(req.body);
      req.body = result;
      next();
    } catch (error) {
      if (error instanceof ZodError) {
        const details = formatZodErrors(error);
        
        logger.warn('Validation error', {
          requestId: req.requestId,
          path: req.path,
          errors: details
        });

        const response: ValidationErrorResponse = {
          success: false,
          error: {
            code: 'VALIDATION_ERROR',
            message: 'Invalid request data',
            details,
            requestId: req.requestId
          }
        };

        return res.status(400).json(response);
      }
      next(error);
    }
  };
};

/**
 * Validate request query parameters against a Zod schema
 */
export const validateQuery = <T>(schema: ZodSchema<T, any, any>) => {
  return (req: Request, res: Response, next: NextFunction) => {
    try {
      const result = schema.parse(req.query);
      req.query = result as any;
      next();
    } catch (error) {
      if (error instanceof ZodError) {
        const details = formatZodErrors(error);
        
        logger.warn('Query validation error', {
          requestId: req.requestId,
          path: req.path,
          errors: details
        });

        const response: ValidationErrorResponse = {
          success: false,
          error: {
            code: 'VALIDATION_ERROR',
            message: 'Invalid query parameters',
            details,
            requestId: req.requestId
          }
        };

        return res.status(400).json(response);
      }
      next(error);
    }
  };
};

/**
 * Validate request params against a Zod schema
 */
export const validateParams = <T>(schema: ZodSchema<T>) => {
  return (req: Request, res: Response, next: NextFunction) => {
    try {
      const result = schema.parse(req.params);
      req.params = result as any;
      next();
    } catch (error) {
      if (error instanceof ZodError) {
        const details = formatZodErrors(error);
        
        logger.warn('Params validation error', {
          requestId: req.requestId,
          path: req.path,
          errors: details
        });

        const response: ValidationErrorResponse = {
          success: false,
          error: {
            code: 'VALIDATION_ERROR',
            message: 'Invalid URL parameters',
            details,
            requestId: req.requestId
          }
        };

        return res.status(400).json(response);
      }
      next(error);
    }
  };
};

export default {
  validateBody,
  validateQuery,
  validateParams
};
