import express from 'express';
import mongoose from 'mongoose';
import { logger } from '../utils/logger';
import { redisService } from '../services/RedisService';
import { getCacheStats } from '../utils/cache';

export const healthRouter = express.Router();

/**
 * @swagger
 * /health:
 *   get:
 *     summary: Basic health check
 *     description: Returns basic health status of the API
 *     tags: [Health]
 *     responses:
 *       200:
 *         description: Service is healthy
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/HealthCheck'
 *       503:
 *         description: Service is unhealthy
 */
healthRouter.get('/', async (_req, res) => {
  try {
    const health = {
      status: 'healthy',
      timestamp: new Date().toISOString(),
      uptime: Math.floor(process.uptime()),
      version: process.env.npm_package_version || '2.0.0'
    };

    res.json(health);
  } catch (error) {
    logger.error('Health check failed', { error });
    res.status(503).json({
      status: 'unhealthy',
      timestamp: new Date().toISOString(),
      error: 'Health check failed'
    });
  }
});

/**
 * @swagger
 * /health/detailed:
 *   get:
 *     summary: Detailed health check
 *     description: Returns detailed health status including database, Redis, and memory usage
 *     tags: [Health]
 *     responses:
 *       200:
 *         description: Detailed health information
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/DetailedHealth'
 *       503:
 *         description: Service is unhealthy
 */
healthRouter.get('/detailed', async (_req, res) => {
  const checks: Record<string, { status: string; latency?: number; details?: any }> = {};
  let overallStatus = 'healthy';

  // Check MongoDB connection
  const dbStart = Date.now();
  try {
    const mongoState = mongoose.connection.readyState;
    const stateMap: Record<number, string> = {
      0: 'disconnected',
      1: 'connected',
      2: 'connecting',
      3: 'disconnecting'
    };
    
    if (mongoState === 1) {
      // Ping the database
      await mongoose.connection.db?.admin().ping();
      checks.database = {
        status: 'healthy',
        latency: Date.now() - dbStart,
        details: { state: stateMap[mongoState] }
      };
    } else {
      checks.database = {
        status: 'unhealthy',
        details: { state: stateMap[mongoState] || 'unknown' }
      };
      overallStatus = 'degraded';
    }
  } catch (error) {
    checks.database = {
      status: 'unhealthy',
      latency: Date.now() - dbStart,
      details: { error: 'Connection failed' }
    };
    overallStatus = 'unhealthy';
  }

  // Check Redis connection
  const redisStart = Date.now();
  try {
    const redisStats = await redisService.getStats();
    checks.redis = {
      status: redisStats.connected ? 'healthy' : 'unavailable',
      latency: Date.now() - redisStart,
      details: {
        connected: redisStats.connected,
        keys: redisStats.keys || 0,
        memory: redisStats.memory || 'N/A'
      }
    };
    // Redis is optional, so don't degrade status if unavailable
  } catch (error) {
    checks.redis = {
      status: 'unavailable',
      latency: Date.now() - redisStart,
      details: { error: 'Connection failed (using fallback cache)' }
    };
  }

  // Check OpenAI API (just verify key exists)
  checks.openai = {
    status: process.env.OPENAI_API_KEY ? 'configured' : 'not_configured',
    details: { keyPresent: !!process.env.OPENAI_API_KEY }
  };
  if (!process.env.OPENAI_API_KEY) {
    overallStatus = 'degraded';
  }

  // Cache stats
  try {
    const cacheStats = await getCacheStats();
    checks.cache = {
      status: 'healthy',
      details: cacheStats
    };
  } catch (error) {
    checks.cache = {
      status: 'unknown',
      details: { error: 'Failed to get cache stats' }
    };
  }

  // Memory usage
  const memUsage = process.memoryUsage();
  checks.memory = {
    status: 'healthy',
    details: {
      heapUsed: `${Math.round(memUsage.heapUsed / 1024 / 1024)}MB`,
      heapTotal: `${Math.round(memUsage.heapTotal / 1024 / 1024)}MB`,
      rss: `${Math.round(memUsage.rss / 1024 / 1024)}MB`,
      external: `${Math.round(memUsage.external / 1024 / 1024)}MB`
    }
  };

  // Check if memory usage is high (>80% of heap)
  const heapUsagePercent = (memUsage.heapUsed / memUsage.heapTotal) * 100;
  if (heapUsagePercent > 80) {
    checks.memory.status = 'warning';
    overallStatus = overallStatus === 'healthy' ? 'degraded' : overallStatus;
  }

  // System info
  checks.system = {
    status: 'healthy',
    details: {
      nodeVersion: process.version,
      platform: process.platform,
      uptime: `${Math.floor(process.uptime())}s`,
      pid: process.pid
    }
  };

  const statusCode = overallStatus === 'healthy' ? 200 : overallStatus === 'degraded' ? 200 : 503;

  res.status(statusCode).json({
    status: overallStatus,
    timestamp: new Date().toISOString(),
    checks
  });
});

/**
 * @swagger
 * /health/ready:
 *   get:
 *     summary: Readiness probe
 *     description: Kubernetes readiness probe - checks if all critical services are ready
 *     tags: [Health]
 *     responses:
 *       200:
 *         description: Service is ready
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 ready:
 *                   type: boolean
 *                   example: true
 *       503:
 *         description: Service is not ready
 */
healthRouter.get('/ready', async (_req, res) => {
  try {
    // Check if all critical services are ready
    const mongoReady = mongoose.connection.readyState === 1;
    const openaiReady = !!process.env.OPENAI_API_KEY;

    if (mongoReady && openaiReady) {
      res.json({ ready: true });
    } else {
      res.status(503).json({
        ready: false,
        missing: {
          database: !mongoReady,
          openai: !openaiReady
        }
      });
    }
  } catch (error) {
    res.status(503).json({ ready: false, error: 'Readiness check failed' });
  }
});

/**
 * @swagger
 * /health/live:
 *   get:
 *     summary: Liveness probe
 *     description: Kubernetes liveness probe - checks if the service is alive
 *     tags: [Health]
 *     responses:
 *       200:
 *         description: Service is alive
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 alive:
 *                   type: boolean
 *                   example: true
 *                 timestamp:
 *                   type: string
 *                   format: date-time
 */
healthRouter.get('/live', (_req, res) => {
  res.json({ alive: true, timestamp: new Date().toISOString() });
});

export default healthRouter;
