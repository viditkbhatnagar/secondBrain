import { Router, Request, Response } from 'express';
import { ultimateRagService } from '../services/ultimateRagService';
import { feedbackService } from '../services/feedbackService';
import { cacheWarmer } from '../services/cacheWarmer';
import { logger } from '../utils/logger';
import { z } from 'zod';

const router = Router();

const searchSchema = z.object({
  query: z.string().min(1).max(2000),
  streaming: z.boolean().optional().default(false),
  maxSources: z.number().min(1).max(20).optional().default(5),
  minConfidence: z.number().min(0).max(1).optional().default(0.4),
  enableHyDE: z.boolean().optional().default(true),
  enableCompression: z.boolean().optional().default(true),
  enableReranking: z.boolean().optional().default(true),
  enableQueryDecomposition: z.boolean().optional().default(true),
  model: z.enum(['gpt-5']).optional().default('gpt-5')
});

/**
 * @swagger
 * /search/ultimate:
 *   post:
 *     summary: Ultimate RAG search with all optimizations
 *     description: High-performance search with query decomposition, HyDE, reranking, compression, and caching
 *     tags: [Search]
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
 *                 maxLength: 2000
 *               streaming:
 *                 type: boolean
 *                 default: false
 *               maxSources:
 *                 type: number
 *                 minimum: 1
 *                 maximum: 20
 *                 default: 5
 *               minConfidence:
 *                 type: number
 *                 minimum: 0
 *                 maximum: 1
 *                 default: 0.4
 *               enableHyDE:
 *                 type: boolean
 *                 default: true
 *               enableCompression:
 *                 type: boolean
 *                 default: true
 *               enableReranking:
 *                 type: boolean
 *                 default: true
 *               enableQueryDecomposition:
 *                 type: boolean
 *                 default: true
 *               model:
 *                 type: string
 *                 enum: [gpt-5]
 *                 default: gpt-5
 *     responses:
 *       200:
 *         description: Search results with AI answer
 *       400:
 *         description: Validation error
 *       429:
 *         description: Rate limit exceeded
 */
router.post('/ultimate', async (req: Request, res: Response) => {
  const startTime = Date.now();

  try {
    const validated = searchSchema.parse(req.body);

    if (validated.streaming) {
      return ultimateRagService.streamQuery(res, validated.query, validated);
    }

    const result = await ultimateRagService.query(validated.query, validated);
    
    res.json({
      success: true,
      data: result,
      meta: {
        processingTime: Date.now() - startTime,
        cached: result.cached
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
    
    logger.error('Ultimate search error:', { error: error.message, requestId: (req as any).requestId });
    res.status(500).json({
      error: 'Search Failed',
      message: error.message || 'An unexpected error occurred',
      code: 'ULTIMATE_SEARCH_ERROR'
    });
  }
});

/**
 * @swagger
 * /search/ultimate/quick:
 *   get:
 *     summary: Quick search with lower latency
 *     description: Fast search with fewer sources and minimal processing
 *     tags: [Search]
 *     parameters:
 *       - in: query
 *         name: q
 *         required: true
 *         schema:
 *           type: string
 *         description: Search query
 *     responses:
 *       200:
 *         description: Quick search results
 *       400:
 *         description: Query required
 */
router.get('/ultimate/quick', async (req: Request, res: Response) => {
  const query = req.query.q as string;
  
  if (!query) {
    return res.status(400).json({ error: 'Query required' });
  }

  try {
    const result = await ultimateRagService.query(query, {
      maxSources: 3,
      enableHyDE: false,
      enableCompression: false,
      enableReranking: true,
      enableQueryDecomposition: false,
      model: 'gpt-5'
    });

    res.json(result);
  } catch (error: any) {
    logger.error('Quick search error:', { error: error.message });
    res.status(500).json({ error: 'Search failed', message: error.message });
  }
});

/**
 * @swagger
 * /search/ultimate/stream:
 *   post:
 *     summary: Streaming search with immediate source delivery
 *     description: SSE streaming response with sources delivered first
 *     tags: [Search]
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
 *     responses:
 *       200:
 *         description: SSE stream
 *       400:
 *         description: Query required
 */
router.post('/ultimate/stream', async (req: Request, res: Response) => {
  const { query } = req.body;
  
  if (!query) {
    return res.status(400).json({ error: 'Query required' });
  }

  await ultimateRagService.streamQuery(res, query, { streaming: true });
});

/**
 * @swagger
 * /search/ultimate/stats:
 *   get:
 *     summary: Get cache statistics
 *     description: Returns cache hit rate and other performance metrics
 *     tags: [Search]
 *     responses:
 *       200:
 *         description: Cache statistics
 */
router.get('/ultimate/stats', async (_req: Request, res: Response) => {
  try {
    const stats = ultimateRagService.getCacheStats();
    res.json({
      success: true,
      data: stats
    });
  } catch (error: any) {
    res.status(500).json({ error: 'Failed to get stats', message: error.message });
  }
});

/**
 * @swagger
 * /search/ultimate/feedback:
 *   post:
 *     summary: Submit feedback for a search result
 *     description: Record user feedback (thumbs up/down) for continuous improvement
 *     tags: [Search]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - queryId
 *               - query
 *               - answer
 *               - rating
 *             properties:
 *               queryId:
 *                 type: string
 *               query:
 *                 type: string
 *               answer:
 *                 type: string
 *               rating:
 *                 type: string
 *                 enum: [positive, negative]
 *               feedback:
 *                 type: string
 *               sourceIds:
 *                 type: array
 *                 items:
 *                   type: string
 *               confidence:
 *                 type: number
 *               responseTime:
 *                 type: number
 *     responses:
 *       200:
 *         description: Feedback recorded
 *       400:
 *         description: Validation error
 */
router.post('/ultimate/feedback', async (req: Request, res: Response) => {
  const feedbackSchema = z.object({
    queryId: z.string().min(1),
    query: z.string().min(1),
    answer: z.string().min(1),
    rating: z.enum(['positive', 'negative']),
    feedback: z.string().optional(),
    sourceIds: z.array(z.string()).optional(),
    confidence: z.number().optional(),
    responseTime: z.number().optional()
  });

  try {
    const validated = feedbackSchema.parse(req.body);
    
    const success = await feedbackService.recordFeedback({
      queryId: validated.queryId,
      query: validated.query,
      answer: validated.answer,
      rating: validated.rating,
      feedback: validated.feedback,
      sourceIds: validated.sourceIds || [],
      confidence: validated.confidence || 0,
      responseTime: validated.responseTime || 0
    });

    res.json({ success });
  } catch (error: any) {
    if (error.name === 'ZodError') {
      return res.status(400).json({
        error: 'Validation Error',
        details: error.errors
      });
    }
    logger.error('Feedback error:', { error: error.message });
    res.status(500).json({ error: 'Failed to record feedback' });
  }
});

/**
 * @swagger
 * /search/ultimate/feedback/stats:
 *   get:
 *     summary: Get feedback statistics
 *     description: Returns feedback statistics for quality monitoring
 *     tags: [Search]
 *     parameters:
 *       - in: query
 *         name: days
 *         schema:
 *           type: number
 *           default: 30
 *         description: Number of days to analyze
 *     responses:
 *       200:
 *         description: Feedback statistics
 */
router.get('/ultimate/feedback/stats', async (req: Request, res: Response) => {
  try {
    const days = parseInt(req.query.days as string) || 30;
    const stats = await feedbackService.getStats(days);
    res.json({ success: true, data: stats });
  } catch (error: any) {
    res.status(500).json({ error: 'Failed to get feedback stats', message: error.message });
  }
});

/**
 * @swagger
 * /search/ultimate/status:
 *   get:
 *     summary: Get system status
 *     description: Returns status of all RAG components
 *     tags: [Search]
 *     responses:
 *       200:
 *         description: System status
 */
router.get('/ultimate/status', async (_req: Request, res: Response) => {
  try {
    const status = ultimateRagService.getSystemStatus();
    const warmupStatus = cacheWarmer.getStatus();
    
    res.json({
      success: true,
      data: {
        ...status,
        cacheWarmer: warmupStatus
      }
    });
  } catch (error: any) {
    res.status(500).json({ error: 'Failed to get status', message: error.message });
  }
});

/**
 * @swagger
 * /search/ultimate/warmup:
 *   post:
 *     summary: Trigger cache warmup
 *     description: Manually trigger cache warmup for better performance
 *     tags: [Search]
 *     responses:
 *       200:
 *         description: Warmup started
 */
router.post('/ultimate/warmup', async (_req: Request, res: Response) => {
  try {
    // Start warmup in background
    cacheWarmer.warmup().catch(err => logger.error('Warmup failed:', err));
    res.json({ success: true, message: 'Cache warmup started' });
  } catch (error: any) {
    res.status(500).json({ error: 'Failed to start warmup', message: error.message });
  }
});

export default router;
