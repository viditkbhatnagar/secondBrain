import Redis, { RedisOptions } from 'ioredis';
import crypto from 'crypto';
import { logger } from '../utils/logger';

// Cache TTL constants (in seconds)
export const CACHE_TTL = {
  EMBEDDING: 60 * 60 * 24 * 30, // 30 days - embeddings don't change
  SEARCH: 60 * 5, // 5 minutes - search results
  STATS: 60 * 15, // 15 minutes - document stats
  AI_RESPONSE: 60 * 60, // 1 hour - AI responses
  DOCUMENT: 60 * 10, // 10 minutes - document metadata
  ROUTE: 60 * 5, // 5 minutes - route responses
};

// Cache key prefixes
export const CACHE_PREFIX = {
  EMBEDDING: 'emb:',
  SEARCH: 'search:',
  STATS: 'stats:',
  AI_RESPONSE: 'ai:',
  DOCUMENT: 'doc:',
  ROUTE: 'route:',
};

class RedisService {
  private redis: Redis | null = null;
  private isConnected: boolean = false;
  private connectionAttempts: number = 0;
  private maxConnectionAttempts: number = 5;

  /**
   * Initialize Redis connection
   */
  async initialize(): Promise<void> {
    const redisUrl = process.env.REDIS_URL;
    const redisHost = process.env.REDIS_HOST || 'localhost';
    const redisPort = parseInt(process.env.REDIS_PORT || '6379', 10);
    const redisPassword = process.env.REDIS_PASSWORD;
    const redisEnabled = process.env.REDIS_ENABLED === 'true';

    // Skip Redis if explicitly disabled OR no configuration provided
    if (redisEnabled === false && process.env.REDIS_ENABLED !== undefined) {
      logger.info('⚠️ Redis explicitly disabled - using in-memory cache fallback');
      return;
    }

    // Skip if no Redis configuration provided at all
    if (!redisUrl && redisHost === 'localhost' && !redisPassword) {
      logger.info('⚠️ Redis not configured - using in-memory cache fallback');
      return;
    }

    // If we have a Redis URL or non-localhost config, try to connect
    logger.info('🔄 Attempting to connect to Redis...', { 
      hasUrl: !!redisUrl, 
      host: redisHost, 
      port: redisPort,
      enabled: redisEnabled 
    });

    try {
      const isProduction = process.env.NODE_ENV === 'production';
      
      const options: RedisOptions = {
        retryStrategy: (times: number) => {
          this.connectionAttempts = times;
          if (times > this.maxConnectionAttempts) {
            logger.warn('Redis max connection attempts reached, giving up');
            return null; // Stop retrying
          }
          const delay = Math.min(times * 200, 5000);
          logger.debug(`Redis retry attempt ${times}, waiting ${delay}ms`);
          return delay;
        },
        maxRetriesPerRequest: 3,
        enableReadyCheck: true,
        lazyConnect: true,
        // Production optimizations
        connectTimeout: 10000,
        commandTimeout: 5000,
        keepAlive: 30000,
        enableOfflineQueue: true,
        // TLS for Render Redis (uses rediss:// URL)
        ...(redisUrl?.startsWith('rediss://') ? { tls: { rejectUnauthorized: false } } : {}),
      };

      // Use URL if provided, otherwise use host/port
      if (redisUrl) {
        this.redis = new Redis(redisUrl, options);
      } else {
        this.redis = new Redis({
          ...options,
          host: redisHost,
          port: redisPort,
          password: redisPassword || undefined,
        });
      }

      // Event handlers
      this.redis.on('connect', () => {
        this.isConnected = true;
        this.connectionAttempts = 0;
        logger.info('✅ Redis connected');
      });

      this.redis.on('ready', () => {
        logger.info('✅ Redis ready');
      });

      this.redis.on('error', (err) => {
        logger.error('Redis error:', { error: err.message });
        this.isConnected = false;
      });

      this.redis.on('close', () => {
        logger.warn('Redis connection closed');
        this.isConnected = false;
      });

      this.redis.on('reconnecting', () => {
        logger.debug('Redis reconnecting...');
      });

      // Attempt connection
      await this.redis.connect();
      logger.info('🔌 Redis connection attempt complete');
    } catch (error: any) {
      logger.warn('Redis connection failed, using fallback:', { error: error.message });
      this.redis = null;
      this.isConnected = false;
    }
  }

  /**
   * Check if Redis is available
   */
  isAvailable(): boolean {
    const available = this.isConnected && this.redis !== null;
    if (!available && this.redis !== null) {
      logger.debug('Redis check: connected=false, redis exists=true');
    }
    return available;
  }

  /**
   * Get value from cache
   */
  async get<T>(key: string): Promise<T | null> {
    if (!this.isAvailable()) return null;

    try {
      const data = await this.redis!.get(key);
      if (data) {
        logger.debug('Cache hit', { key: key.substring(0, 30) });
        return JSON.parse(data) as T;
      }
      logger.debug('Cache miss', { key: key.substring(0, 30) });
      return null;
    } catch (error: any) {
      logger.warn('Redis get error:', { error: error.message, key });
      return null;
    }
  }

  /**
   * Set value in cache with TTL
   */
  async set(key: string, value: any, ttlSeconds: number = 3600): Promise<boolean> {
    if (!this.isAvailable()) return false;

    try {
      await this.redis!.setex(key, ttlSeconds, JSON.stringify(value));
      logger.debug('Cache set', { key: key.substring(0, 30), ttl: ttlSeconds });
      return true;
    } catch (error: any) {
      logger.warn('Redis set error:', { error: error.message, key });
      return false;
    }
  }

  /**
   * Delete a key from cache
   */
  async del(...keys: string[]): Promise<boolean> {
    if (!this.isAvailable()) return false;

    try {
      await this.redis!.del(...keys);
      logger.debug('Cache delete', { keys });
      return true;
    } catch (error: any) {
      logger.warn('Redis del error:', { error: error.message, keys });
      return false;
    }
  }

  /**
   * Set value with expiry (setex)
   */
  async setex(key: string, ttlSeconds: number, value: string): Promise<boolean> {
    if (!this.isAvailable()) return false;

    try {
      await this.redis!.setex(key, ttlSeconds, value);
      logger.debug('Cache setex', { key: key.substring(0, 30), ttl: ttlSeconds });
      return true;
    } catch (error: any) {
      logger.warn('Redis setex error:', { error: error.message, key });
      return false;
    }
  }

  /**
   * Get all keys matching pattern
   */
  async keys(pattern: string): Promise<string[]> {
    if (!this.isAvailable()) return [];

    try {
      return await this.redis!.keys(pattern);
    } catch (error: any) {
      logger.warn('Redis keys error:', { error: error.message, pattern });
      return [];
    }
  }

  /**
   * Delete keys matching a pattern
   */
  async delPattern(pattern: string): Promise<number> {
    if (!this.isAvailable()) return 0;

    try {
      const keys = await this.redis!.keys(pattern);
      if (keys.length > 0) {
        await this.redis!.del(...keys);
        logger.debug('Cache pattern delete', { pattern, count: keys.length });
        return keys.length;
      }
      return 0;
    } catch (error: any) {
      logger.warn('Redis delPattern error:', { error: error.message, pattern });
      return 0;
    }
  }

  /**
   * Check if key exists
   */
  async exists(key: string): Promise<boolean> {
    if (!this.isAvailable()) return false;

    try {
      const result = await this.redis!.exists(key);
      return result === 1;
    } catch (error: any) {
      logger.warn('Redis exists error:', { error: error.message, key });
      return false;
    }
  }

  /**
   * Get cache statistics
   */
  async getStats(): Promise<{ connected: boolean; keys?: number; memory?: string }> {
    if (!this.isAvailable()) {
      return { connected: false };
    }

    try {
      const info = await this.redis!.info('memory');
      const dbSize = await this.redis!.dbsize();
      
      const memoryMatch = info.match(/used_memory_human:(\S+)/);
      const memory = memoryMatch ? memoryMatch[1] : 'unknown';

      return {
        connected: true,
        keys: dbSize,
        memory
      };
    } catch (error: any) {
      return { connected: this.isConnected };
    }
  }

  /**
   * Flush all cache (use with caution)
   */
  async flushAll(): Promise<boolean> {
    if (!this.isAvailable()) return false;

    try {
      await this.redis!.flushdb();
      logger.info('Cache flushed');
      return true;
    } catch (error: any) {
      logger.error('Redis flushAll error:', { error: error.message });
      return false;
    }
  }

  /**
   * Close Redis connection
   */
  async close(): Promise<void> {
    if (this.redis) {
      await this.redis.quit();
      this.redis = null;
      this.isConnected = false;
      logger.info('Redis connection closed');
    }
  }

  // ============================================
  // Specialized Cache Methods
  // ============================================

  /**
   * Generate hash for cache key
   */
  private hash(input: string): string {
    return crypto.createHash('md5').update(input).digest('hex');
  }

  /**
   * Get cached embedding
   */
  async getEmbedding(text: string): Promise<number[] | null> {
    const key = `${CACHE_PREFIX.EMBEDDING}${this.hash(text)}`;
    const result = await this.get<number[]>(key);
    if (result) {
      logger.info('🎯 Redis embedding cache HIT', { hash: this.hash(text).substring(0, 8) });
    }
    return result;
  }

  /**
   * Cache embedding
   */
  async setEmbedding(text: string, embedding: number[]): Promise<boolean> {
    const key = `${CACHE_PREFIX.EMBEDDING}${this.hash(text)}`;
    const success = await this.set(key, embedding, CACHE_TTL.EMBEDDING);
    if (success) {
      logger.info('💾 Redis embedding cached', { hash: this.hash(text).substring(0, 8) });
    }
    return success;
  }

  /**
   * Get cached search results
   */
  async getSearchResults(query: string, strategy: string): Promise<any | null> {
    const key = `${CACHE_PREFIX.SEARCH}${this.hash(`${query}:${strategy}`)}`;
    const result = await this.get(key);
    if (result) {
      logger.info('🎯 Redis search cache HIT', { query: query.substring(0, 30) });
    }
    return result;
  }

  /**
   * Cache search results
   */
  async setSearchResults(query: string, strategy: string, results: any): Promise<boolean> {
    const key = `${CACHE_PREFIX.SEARCH}${this.hash(`${query}:${strategy}`)}`;
    const success = await this.set(key, results, CACHE_TTL.SEARCH);
    if (success) {
      logger.info('💾 Redis search results cached', { query: query.substring(0, 30), count: results?.length || 0 });
    }
    return success;
  }

  /**
   * Get cached stats
   */
  async getCachedStats(scope: string = 'global'): Promise<any | null> {
    const key = `${CACHE_PREFIX.STATS}${scope}`;
    return this.get(key);
  }

  /**
   * Cache stats
   */
  async setCachedStats(stats: any, scope: string = 'global'): Promise<boolean> {
    const key = `${CACHE_PREFIX.STATS}${scope}`;
    return this.set(key, stats, CACHE_TTL.STATS);
  }

  /**
   * Get cached AI response
   */
  async getAIResponse(query: string, contextHash: string): Promise<any | null> {
    const key = `${CACHE_PREFIX.AI_RESPONSE}${this.hash(`${query}:${contextHash}`)}`;
    return this.get(key);
  }

  /**
   * Cache AI response
   */
  async setAIResponse(query: string, contextHash: string, response: any): Promise<boolean> {
    const key = `${CACHE_PREFIX.AI_RESPONSE}${this.hash(`${query}:${contextHash}`)}`;
    return this.set(key, response, CACHE_TTL.AI_RESPONSE);
  }

  /**
   * Get cached document
   */
  async getDocument(documentId: string): Promise<any | null> {
    const key = `${CACHE_PREFIX.DOCUMENT}${documentId}`;
    return this.get(key);
  }

  /**
   * Cache document
   */
  async setDocument(documentId: string, document: any): Promise<boolean> {
    const key = `${CACHE_PREFIX.DOCUMENT}${documentId}`;
    return this.set(key, document, CACHE_TTL.DOCUMENT);
  }

  /**
   * Invalidate document-related caches
   */
  async invalidateDocumentCaches(documentId?: string): Promise<void> {
    // Invalidate stats cache
    await this.delPattern(`${CACHE_PREFIX.STATS}*`);
    
    // Invalidate search cache (results may be stale)
    await this.delPattern(`${CACHE_PREFIX.SEARCH}*`);
    
    // Invalidate specific document if provided
    if (documentId) {
      await this.del(`${CACHE_PREFIX.DOCUMENT}${documentId}`);
    }
    
    logger.debug('Document caches invalidated', { documentId });
  }

  /**
   * Get with fallback - tries cache first, then fetches
   */
  async getWithFallback<T>(
    key: string,
    fetchFn: () => Promise<T>,
    ttl: number = 3600
  ): Promise<T> {
    // Try cache first
    const cached = await this.get<T>(key);
    if (cached !== null) {
      return cached;
    }

    // Fetch fresh data
    const data = await fetchFn();

    // Cache for next time (fire and forget)
    this.set(key, data, ttl).catch(() => {});

    return data;
  }
}

// Export singleton instance
export const redisService = new RedisService();
export default redisService;
