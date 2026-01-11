import { Router, Request, Response } from 'express';
import { analyticsService } from '../services/AnalyticsService';
import { asyncHandler } from '../middleware/errorHandler';
import { z } from 'zod';
import { validateQuery, validateBody } from '../middleware/validate';
import { analyticsLimiter } from '../middleware/rateLimiter';

const router = Router();

// Apply analytics-specific rate limiter (more generous, skipped in dev)
router.use(analyticsLimiter);

// Query validation schemas
const timeRangeSchema = z.object({
  days: z.string().optional().transform(v => parseInt(v || '30')).pipe(z.number().min(1).max(365)),
  granularity: z.enum(['hour', 'day', 'week']).optional()
});

const limitSchema = z.object({
  days: z.string().optional().transform(v => parseInt(v || '30')).pipe(z.number().min(1).max(365)),
  limit: z.string().optional().transform(v => parseInt(v || '10')).pipe(z.number().min(1).max(100))
});

const trackEventSchema = z.object({
  eventType: z.enum(['search', 'chat_message', 'document_upload', 'document_view',
    'document_delete', 'ai_response', 'error', 'session_start', 'session_end']),
  sessionId: z.string().min(1),
  metadata: z.record(z.any()).optional()
});

/**
 * @swagger
 * /api/analytics/overview:
 *   get:
 *     summary: Get dashboard overview statistics
 *     tags: [Analytics]
 *     parameters:
 *       - in: query
 *         name: days
 *         schema:
 *           type: integer
 *           default: 30
 *         description: Number of days to analyze
 *     responses:
 *       200:
 *         description: Overview statistics
 */
router.get('/overview',
  validateQuery(timeRangeSchema),
  asyncHandler(async (req: Request, res: Response) => {
    const days = parseInt(req.query.days as string) || 30;
    const stats = await analyticsService.getOverviewStats(days);
    res.json(stats);
  })
);

/**
 * @swagger
 * /api/analytics/timeseries:
 *   get:
 *     summary: Get time series data for charts
 *     tags: [Analytics]
 */
router.get('/timeseries',
  validateQuery(timeRangeSchema),
  asyncHandler(async (req: Request, res: Response) => {
    const days = parseInt(req.query.days as string) || 30;
    const granularity = (req.query.granularity as 'hour' | 'day' | 'week') || 'day';
    const eventTypes = (req.query.events as string)?.split(',') || ['search', 'chat_message', 'document_upload'];
    
    const data = await analyticsService.getTimeSeriesData(
      eventTypes as any[],
      days,
      granularity
    );
    res.json(data);
  })
);

/**
 * @swagger
 * /api/analytics/top-queries:
 *   get:
 *     summary: Get top search queries
 *     tags: [Analytics]
 */
router.get('/top-queries',
  validateQuery(limitSchema),
  asyncHandler(async (req: Request, res: Response) => {
    const days = parseInt(req.query.days as string) || 30;
    const limit = parseInt(req.query.limit as string) || 10;
    const data = await analyticsService.getTopQueries(days, limit);
    res.json(data);
  })
);

/**
 * @swagger
 * /api/analytics/top-documents:
 *   get:
 *     summary: Get top viewed documents
 *     tags: [Analytics]
 */
router.get('/top-documents',
  validateQuery(limitSchema),
  asyncHandler(async (req: Request, res: Response) => {
    const days = parseInt(req.query.days as string) || 30;
    const limit = parseInt(req.query.limit as string) || 10;
    const data = await analyticsService.getTopDocuments(days, limit);
    res.json(data);
  })
);

/**
 * @swagger
 * /api/analytics/heatmap:
 *   get:
 *     summary: Get activity heatmap data
 *     tags: [Analytics]
 */
router.get('/heatmap',
  validateQuery(timeRangeSchema),
  asyncHandler(async (req: Request, res: Response) => {
    const days = parseInt(req.query.days as string) || 30;
    const data = await analyticsService.getActivityHeatmap(days);
    res.json(data);
  })
);

/**
 * @swagger
 * /api/analytics/file-types:
 *   get:
 *     summary: Get file type distribution
 *     tags: [Analytics]
 */
router.get('/file-types',
  validateQuery(timeRangeSchema),
  asyncHandler(async (req: Request, res: Response) => {
    const days = parseInt(req.query.days as string) || 30;
    const data = await analyticsService.getFileTypeDistribution(days);
    res.json(data);
  })
);

/**
 * @swagger
 * /api/analytics/response-times:
 *   get:
 *     summary: Get response time percentiles
 *     tags: [Analytics]
 */
router.get('/response-times',
  validateQuery(timeRangeSchema),
  asyncHandler(async (req: Request, res: Response) => {
    const days = parseInt(req.query.days as string) || 30;
    const data = await analyticsService.getResponseTimePercentiles(days);
    res.json(data);
  })
);

/**
 * @swagger
 * /api/analytics/confidence:
 *   get:
 *     summary: Get confidence score distribution
 *     tags: [Analytics]
 */
router.get('/confidence',
  validateQuery(timeRangeSchema),
  asyncHandler(async (req: Request, res: Response) => {
    const days = parseInt(req.query.days as string) || 30;
    const data = await analyticsService.getConfidenceDistribution(days);
    res.json(data);
  })
);

/**
 * @swagger
 * /api/analytics/realtime:
 *   get:
 *     summary: Get real-time statistics
 *     tags: [Analytics]
 */
router.get('/realtime',
  asyncHandler(async (req: Request, res: Response) => {
    const data = await analyticsService.getRealTimeStats();
    res.json(data);
  })
);

/**
 * @swagger
 * /api/analytics/costs:
 *   get:
 *     summary: Get bifurcated cost statistics (chat vs training)
 *     tags: [Analytics]
 *     parameters:
 *       - in: query
 *         name: days
 *         schema:
 *           type: integer
 *           default: 30
 *         description: Number of days to analyze
 *     responses:
 *       200:
 *         description: Cost statistics broken down by source
 */
router.get('/costs',
  validateQuery(timeRangeSchema),
  asyncHandler(async (req: Request, res: Response) => {
    const days = parseInt(req.query.days as string) || 30;
    const data = await analyticsService.getCostStats(days);
    res.json(data);
  })
);

/**
 * @swagger
 * /api/analytics/track:
 *   post:
 *     summary: Track an analytics event
 *     tags: [Analytics]
 */
router.post('/track',
  validateBody(trackEventSchema),
  asyncHandler(async (req: Request, res: Response) => {
    const { eventType, sessionId, metadata } = req.body;
    
    // Add IP hash for privacy-preserving tracking
    const ipHash = analyticsService.hashIP(
      req.ip || req.headers['x-forwarded-for'] as string || 'unknown'
    );

    await analyticsService.trackEvent(
      eventType,
      sessionId,
      { ...metadata, ipHash, userAgent: req.headers['user-agent'] }
    );

    res.status(201).json({ success: true });
  })
);

export default router;
