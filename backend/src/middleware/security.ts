import helmet from 'helmet';
import mongoSanitize from 'express-mongo-sanitize';
import xss from 'xss';
import { Request, Response, NextFunction } from 'express';
import { logger } from '../utils/logger';

/**
 * Helmet security headers configuration
 */
export const helmetConfig = helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com"],
      fontSrc: [
        "'self'",
        "https://fonts.gstatic.com",
        "https://r2cdn.perplexity.ai",
        "data:"
      ],
      imgSrc: ["'self'", "data:", "https:", "blob:"],
      scriptSrc: ["'self'", "'unsafe-inline'", "'unsafe-eval'", "https://unpkg.com"], // Allow inline scripts and eval for React & Spline 3D
      connectSrc: [
        "'self'",
        "https://api.openai.com",
        "https://fonts.googleapis.com",
        "https://prod.spline.design",
        "https://unpkg.com",
        "wss:",
        "ws:"
      ],
      frameSrc: ["'none'"],
      objectSrc: ["'none'"],
      upgradeInsecureRequests: process.env.NODE_ENV === 'production' ? [] : null
    }
  },
  crossOriginEmbedderPolicy: false, // Required for SSE streaming
  crossOriginResourcePolicy: { policy: "cross-origin" },
  referrerPolicy: { policy: "strict-origin-when-cross-origin" }
});

/**
 * MongoDB query sanitization
 * Prevents NoSQL injection attacks
 */
export const mongoSanitizeConfig = mongoSanitize({
  replaceWith: '_',
  onSanitize: ({ req, key }) => {
    logger.warn('NoSQL injection attempt blocked', {
      requestId: req.requestId,
      key,
      path: req.path,
      ip: req.ip
    });
  }
});

/**
 * XSS sanitization options
 */
const xssOptions = {
  whiteList: {}, // No HTML tags allowed
  stripIgnoreTag: true,
  stripIgnoreTagBody: ['script', 'style']
};

/**
 * Sanitize a string against XSS attacks
 */
export const sanitizeString = (input: string): string => {
  if (typeof input !== 'string') return input;
  return xss(input, xssOptions);
};

/**
 * Recursively sanitize an object's string values
 */
export const sanitizeObject = (obj: any): any => {
  if (typeof obj === 'string') {
    return sanitizeString(obj);
  }
  if (Array.isArray(obj)) {
    return obj.map(sanitizeObject);
  }
  if (obj && typeof obj === 'object') {
    const sanitized: any = {};
    for (const key of Object.keys(obj)) {
      sanitized[key] = sanitizeObject(obj[key]);
    }
    return sanitized;
  }
  return obj;
};

/**
 * XSS sanitization middleware for request body
 */
export const xssSanitizer = (req: Request, _res: Response, next: NextFunction) => {
  if (req.body) {
    req.body = sanitizeObject(req.body);
  }
  if (req.query) {
    req.query = sanitizeObject(req.query);
  }
  next();
};

/**
 * Request size validation middleware
 * Additional check beyond express.json limit
 */
export const requestSizeValidator = (maxSizeBytes: number = 1024 * 1024) => {
  return (req: Request, res: Response, next: NextFunction) => {
    const contentLength = parseInt(req.headers['content-length'] || '0', 10);
    
    if (contentLength > maxSizeBytes) {
      logger.warn('Request too large', {
        requestId: req.requestId,
        contentLength,
        maxSize: maxSizeBytes,
        path: req.path
      });
      
      return res.status(413).json({
        success: false,
        error: {
          code: 'REQUEST_TOO_LARGE',
          message: `Request body exceeds maximum size of ${Math.round(maxSizeBytes / 1024)}KB`,
          requestId: req.requestId
        }
      });
    }
    
    next();
  };
};

/**
 * Suspicious request detector
 * Logs potentially malicious requests
 */
export const suspiciousRequestDetector = (req: Request, _res: Response, next: NextFunction) => {
  const suspiciousPatterns = [
    /(\$where|\$regex|\$ne|\$gt|\$lt)/i, // MongoDB operators in strings
    /<script/i, // Script tags
    /javascript:/i, // JavaScript protocol
    /on\w+\s*=/i, // Event handlers
    /union\s+select/i, // SQL injection
    /;\s*drop\s+/i, // SQL drop
    /eval\s*\(/i, // Eval calls
    /\.\.\//g // Path traversal
  ];

  const checkValue = (value: any, location: string): boolean => {
    if (typeof value === 'string') {
      for (const pattern of suspiciousPatterns) {
        if (pattern.test(value)) {
          logger.warn('Suspicious request detected', {
            requestId: req.requestId,
            location,
            pattern: pattern.toString(),
            ip: req.ip,
            path: req.path
          });
          return true;
        }
      }
    }
    return false;
  };

  // Check body
  if (req.body) {
    JSON.stringify(req.body, (key, value) => {
      checkValue(value, `body.${key}`);
      return value;
    });
  }

  // Check query
  for (const [key, value] of Object.entries(req.query)) {
    checkValue(value, `query.${key}`);
  }

  next();
};

export default {
  helmetConfig,
  mongoSanitizeConfig,
  xssSanitizer,
  sanitizeString,
  sanitizeObject,
  requestSizeValidator,
  suspiciousRequestDetector
};
