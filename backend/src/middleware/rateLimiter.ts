import rateLimit from 'express-rate-limit';
import slowDown from 'express-slow-down';
import { Request, Response } from 'express';
import { logger } from '../utils/logger';

// Check if we're in development mode
const isDev = process.env.NODE_ENV !== 'production';

// Rate limit response format
const createRateLimitResponse = (code: string, message: string) => ({
  success: false,
  error: {
    code,
    message
  }
});

// IPv6-compliant key generator
const keyGenerator = (req: Request): string => {
  // If behind a proxy, check X-Forwarded-For header first
  const forwarded = req.headers['x-forwarded-for'];
  if (forwarded) {
    const forwardedIp = Array.isArray(forwarded) ? forwarded[0] : forwarded.split(',')[0];
    return forwardedIp.trim();
  }
  
  // Fall back to req.ip (Express's built-in IP detection)
  return req.ip || req.socket?.remoteAddress || 'unknown';
};

// Log rate limit hits
const onLimitReached = (req: Request, _res: Response) => {
  logger.warn('Rate limit reached', {
    ip: keyGenerator(req),
    path: req.path,
    method: req.method,
    requestId: req.requestId
  });
};

/**
 * General API rate limiter
 * Development: 1000 requests per 15 minutes
 * Production: 100 requests per 15 minutes
 */
export const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: isDev ? 1000 : 100, // Much higher limit in dev
  message: createRateLimitResponse(
    'RATE_LIMIT_EXCEEDED',
    'Too many requests. Please try again in a few minutes.'
  ),
  standardHeaders: true, // Return rate limit info in headers
  legacyHeaders: false,
  keyGenerator,
  handler: (req, res, _next, options) => {
    onLimitReached(req, res);
    res.status(429).json(options.message);
  },
  skip: (req) => {
    // Skip rate limiting for health checks and analytics in dev
    if (req.path.startsWith('/api/health')) return true;
    if (isDev && req.path.startsWith('/api/analytics')) return true;
    return false;
  }
});

/**
 * Strict rate limiter for AI endpoints (expensive operations)
 * Development: 50 requests per minute
 * Production: 10 requests per minute
 */
export const aiLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: isDev ? 50 : 10,
  message: createRateLimitResponse(
    'AI_RATE_LIMIT',
    'AI request limit reached. Please wait a moment before trying again.'
  ),
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator,
  handler: (req, res, _next, options) => {
    logger.warn('AI rate limit reached', {
      ip: keyGenerator(req),
      path: req.path,
      requestId: req.requestId
    });
    res.status(429).json(options.message);
  }
});

/**
 * Upload rate limiter
 * 20 uploads per hour
 */
export const uploadLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 20,
  message: createRateLimitResponse(
    'UPLOAD_RATE_LIMIT',
    'Upload limit reached. Please try again later.'
  ),
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator,
  handler: (req, res, _next, options) => {
    logger.warn('Upload rate limit reached', {
      ip: keyGenerator(req),
      requestId: req.requestId
    });
    res.status(429).json(options.message);
  }
});

/**
 * Search rate limiter
 * Development: 100 searches per minute
 * Production: 30 searches per minute
 */
export const searchLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: isDev ? 100 : 30,
  message: createRateLimitResponse(
    'SEARCH_RATE_LIMIT',
    'Search limit reached. Please slow down.'
  ),
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator
});

/**
 * Speed limiter - gradually slow down requests
 * After 50 requests in 15 minutes, add delay (disabled in dev)
 */
export const speedLimiter = slowDown({
  windowMs: 15 * 60 * 1000, // 15 minutes
  delayAfter: isDev ? 500 : 50, // Allow more requests at full speed in dev
  delayMs: (hits) => hits * 100, // Add 100ms delay per request after limit
  maxDelayMs: 5000, // Max 5 second delay
  keyGenerator
});

/**
 * Strict speed limiter for AI endpoints
 * After 5 requests in 1 minute, add delay (higher in dev)
 */
export const aiSpeedLimiter = slowDown({
  windowMs: 60 * 1000, // 1 minute
  delayAfter: isDev ? 30 : 5,
  delayMs: (hits) => hits * 200, // Add 200ms delay per request
  maxDelayMs: 10000, // Max 10 second delay
  keyGenerator
});

/**
 * Analytics rate limiter - more generous for dashboard
 * Development: unlimited (skipped)
 * Production: 200 requests per minute
 */
export const analyticsLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 200,
  message: createRateLimitResponse(
    'ANALYTICS_RATE_LIMIT',
    'Analytics request limit reached. Please slow down.'
  ),
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator,
  skip: () => isDev // Skip in development
});

export default {
  apiLimiter,
  aiLimiter,
  uploadLimiter,
  searchLimiter,
  speedLimiter,
  aiSpeedLimiter,
  analyticsLimiter
};
