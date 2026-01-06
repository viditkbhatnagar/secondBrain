import express from 'express';
import { ultraFastRAG } from '../services/ultraFastRagService';
import { logger } from '../utils/logger';
import { analyticsService } from '../services/AnalyticsService';
import { z } from 'zod';
import { searchLimiter } from '../middleware/rateLimiter';

export const blazingSearchRouter = express.Router();

// Apply rate limiting
blazingSearchRouter.use(searchLimiter);

/**
 * @swagger
 * /blazing/search:
 *   post:
 *     summary: Ultra-fast search endpoint (< 2 seconds)
 *     description: Blazing fast RAG search optimized for speed with aggressive caching
 *     tags: [Blazing Search]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - query
 *             properties:
 *               query:
 *                 type: string
 *                 minLength: 1
 *                 maxLength: 500
 *               maxSources:
 *                 type: number
 *                 minimum: 1
 *                 maximum: 5
 *                 default: 3
 *               useCache:
 *                 type: boolean
 *                 default: true
 *     responses:
 *       200:
 *         description: Fast search results with AI answer
 *       400:
 *         description: Validation error
 *       429:
 *         description: Rate limit exceeded
 */
blazingSearchRouter.post('/search', async (req, res) => {
  const startTime = Date.now();

  // Validate request
  const schema = z.object({
    query: z.string().min(1).max(500),
    maxSources: z.number().min(1).max(5).optional().default(3),
    useCache: z.boolean().optional().default(true)
  });

  try {
    const validated = schema.parse(req.body);
    const sessionId = req.headers['x-session-id'] as string || req.ip || 'anonymous';

    logger.info(`🚀 Blazing search: "${validated.query.slice(0, 50)}..."`);

    // Execute ultra-fast search
    const result = await ultraFastRAG.query(validated.query, {
      maxSources: validated.maxSources,
      useCache: validated.useCache,
      skipRerank: true
    });

    // Set cache headers
    if (result.cached) {
      res.setHeader('X-Cache', 'HIT');
      res.setHeader('X-Cache-Layer', result.metadata.cacheLayer || 'unknown');
    } else {
      res.setHeader('X-Cache', 'MISS');
    }

    // Track analytics (use 'search' event type as it's in the enum)
    await analyticsService.trackEvent('search', sessionId, {
      query: validated.query.substring(0, 200),
      responseTime: result.responseTime,
      confidence: result.confidence,
      cached: result.cached,
      sourcesCount: result.sources.length,
      tokensUsed: result.tokensUsed || 0,
      blazingSearch: true // Flag to indicate it's from blazing endpoint
    });

    // Also track AI response for token usage
    if (result.tokensUsed && result.tokensUsed > 0) {
      await analyticsService.trackEvent('ai_response', sessionId, {
        tokensUsed: result.tokensUsed,
        query: validated.query.substring(0, 200),
        responseTime: result.responseTime
      });
    }

    res.json({
      success: true,
      data: result,
      meta: {
        totalTime: Date.now() - startTime,
        cached: result.cached,
        cacheStats: ultraFastRAG.getCacheStats()
      }
    });

  } catch (error: any) {
    if (error.name === 'ZodError') {
      return res.status(400).json({
        error: 'Validation Error',
        message: 'Invalid request parameters',
        details: error.errors
      });
    }

    logger.error('Blazing search error:', { error: error.message, requestId: req.requestId });
    res.status(500).json({
      error: 'Search Failed',
      message: error.message || 'An unexpected error occurred',
      code: 'BLAZING_SEARCH_ERROR'
    });
  }
});

/**
 * @swagger
 * /blazing/stats:
 *   get:
 *     summary: Get cache statistics
 *     description: Returns cache performance metrics
 *     tags: [Blazing Search]
 *     responses:
 *       200:
 *         description: Cache statistics
 */
blazingSearchRouter.get('/stats', async (_req, res) => {
  try {
    const stats = ultraFastRAG.getCacheStats();
    res.json({
      success: true,
      stats
    });
  } catch (error: any) {
    logger.error('Failed to get cache stats:', error);
    res.status(500).json({
      error: 'Failed to get statistics',
      message: error.message
    });
  }
});

/**
 * @swagger
 * /blazing/cache/invalidate:
 *   post:
 *     summary: Invalidate all caches
 *     description: Clears all cached responses (use after uploading new documents)
 *     tags: [Blazing Search]
 *     responses:
 *       200:
 *         description: Cache invalidated
 */
blazingSearchRouter.post('/cache/invalidate', async (_req, res) => {
  try {
    await ultraFastRAG.invalidateCache();
    res.json({
      success: true,
      message: 'Cache invalidated successfully'
    });
  } catch (error: any) {
    logger.error('Failed to invalidate cache:', error);
    res.status(500).json({
      error: 'Cache invalidation failed',
      message: error.message
    });
  }
});

/**
 * @swagger
 * /blazing/prewarm:
 *   post:
 *     summary: Pre-warm cache with common queries
 *     description: Pre-compute responses for frequently asked questions
 *     tags: [Blazing Search]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - queries
 *             properties:
 *               queries:
 *                 type: array
 *                 items:
 *                   type: string
 *     responses:
 *       200:
 *         description: Cache pre-warmed
 */
blazingSearchRouter.post('/prewarm', async (req, res) => {
  try {
    const { queries } = req.body;

    if (!Array.isArray(queries) || queries.length === 0) {
      return res.status(400).json({
        error: 'Invalid request',
        message: 'queries must be a non-empty array'
      });
    }

    // Pre-warm in background
    ultraFastRAG.prewarmCommonQueries(queries).catch(err => {
      logger.error('Pre-warming failed:', err);
    });

    res.json({
      success: true,
      message: `Pre-warming ${queries.length} queries in background`
    });

  } catch (error: any) {
    logger.error('Pre-warm request failed:', error);
    res.status(500).json({
      error: 'Pre-warming failed',
      message: error.message
    });
  }
});

