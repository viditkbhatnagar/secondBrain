import { Request, Response, NextFunction } from 'express';
import { redisService, CACHE_PREFIX, CACHE_TTL } from '../services/RedisService';
import { logger } from '../utils/logger';
import crypto from 'crypto';

/**
 * Generate cache key from request
 */
const generateCacheKey = (req: Request, prefix: string = CACHE_PREFIX.ROUTE): string => {
  const url = req.originalUrl || req.url;
  const method = req.method;
  const hash = crypto.createHash('md5').update(`${method}:${url}`).digest('hex');
  return `${prefix}${hash}`;
};

/**
 * Cache response middleware
 * Caches GET responses for specified TTL
 */
export const cacheResponse = (ttl: number = CACHE_TTL.ROUTE) => {
  return async (req: Request, res: Response, next: NextFunction) => {
    // Only cache GET requests
    if (req.method !== 'GET') {
      return next();
    }

    // Skip if Redis not available
    if (!redisService.isAvailable()) {
      return next();
    }

    const cacheKey = generateCacheKey(req);

    try {
      // Try to get from cache
      const cached = await redisService.get(cacheKey);
      if (cached) {
        logger.debug('Route cache hit', { path: req.path, requestId: req.requestId });
        res.setHeader('X-Cache', 'HIT');
        return res.json(cached);
      }

      // Store original json method
      const originalJson = res.json.bind(res);

      // Override json method to cache response
      res.json = (data: any) => {
        // Only cache successful responses
        if (res.statusCode >= 200 && res.statusCode < 300) {
          redisService.set(cacheKey, data, ttl).catch((err) => {
            logger.warn('Failed to cache response:', { error: err.message });
          });
        }
        res.setHeader('X-Cache', 'MISS');
        return originalJson(data);
      };

      next();
    } catch (error: any) {
      logger.warn('Cache middleware error:', { error: error.message });
      next();
    }
  };
};

/**
 * Cache stats response middleware
 * Specifically for stats endpoints with longer TTL
 */
export const cacheStats = (ttl: number = CACHE_TTL.STATS) => {
  return async (req: Request, res: Response, next: NextFunction) => {
    if (req.method !== 'GET') {
      return next();
    }

    if (!redisService.isAvailable()) {
      return next();
    }

    const cacheKey = `${CACHE_PREFIX.STATS}route:${req.path}`;

    try {
      const cached = await redisService.get(cacheKey);
      if (cached) {
        logger.debug('Stats cache hit', { path: req.path });
        res.setHeader('X-Cache', 'HIT');
        res.setHeader('X-Cache-TTL', String(ttl));
        return res.json(cached);
      }

      const originalJson = res.json.bind(res);
      res.json = (data: any) => {
        if (res.statusCode >= 200 && res.statusCode < 300) {
          redisService.set(cacheKey, data, ttl).catch(() => {});
        }
        res.setHeader('X-Cache', 'MISS');
        return originalJson(data);
      };

      next();
    } catch (error: any) {
      logger.warn('Stats cache middleware error:', { error: error.message });
      next();
    }
  };
};

/**
 * Invalidate cache middleware
 * Use after mutations to clear related caches
 */
export const invalidateCache = (patterns: string[]) => {
  return async (_req: Request, res: Response, next: NextFunction) => {
    // Store original json method
    const originalJson = res.json.bind(res);

    // Override to invalidate cache after successful response
    res.json = (data: any) => {
      if (res.statusCode >= 200 && res.statusCode < 300) {
        // Invalidate caches asynchronously
        Promise.all(
          patterns.map(pattern => redisService.delPattern(pattern))
        ).catch((err) => {
          logger.warn('Cache invalidation error:', { error: err.message });
        });
      }
      return originalJson(data);
    };

    next();
  };
};

/**
 * Clear all document-related caches
 */
export const invalidateDocumentCaches = async (_req: Request, res: Response, next: NextFunction) => {
  const originalJson = res.json.bind(res);

  res.json = (data: any) => {
    if (res.statusCode >= 200 && res.statusCode < 300) {
      redisService.invalidateDocumentCaches().catch(() => {});
    }
    return originalJson(data);
  };

  next();
};

export default {
  cacheResponse,
  cacheStats,
  invalidateCache,
  invalidateDocumentCaches
};
