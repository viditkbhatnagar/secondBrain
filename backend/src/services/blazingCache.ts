import { createHash } from 'crypto';
import { logger } from '../utils/logger';
import { redisService } from './RedisService';

/**
 * Ultra-fast caching service for blazing response times
 * 
 * Features:
 * - Multi-level caching (memory → Redis)
 * - Aggressive TTLs for fast responses
 * - Query normalization for better hit rates
 * - Pre-warming for common queries
 * - Response compression
 */

interface CacheEntry<T> {
  data: T;
  expiry: number;
  compressed?: boolean;
  hits?: number;
}

export interface CacheStats {
  hits: number;
  misses: number;
  hitRate: number;
  avgResponseTime: number;
}

export class BlazingCacheService {
  // In-memory cache for instant responses (max 100MB)
  private memoryCache = new Map<string, CacheEntry<any>>();
  private maxMemoryCacheSize = 1000; // Max entries
  
  // Stats tracking
  private stats: CacheStats = {
    hits: 0,
    misses: 0,
    hitRate: 0,
    avgResponseTime: 0
  };

  // Popular queries cache (never expires until new data)
  private hotCache = new Map<string, any>();

  constructor() {
    // Clean stale entries every 30 seconds
    setInterval(() => this.cleanMemoryCache(), 30000);
    
    // Log stats every 5 minutes
    setInterval(() => this.logStats(), 300000);
  }

  /**
   * Normalize query for better cache hit rate
   */
  private normalizeQuery(query: string): string {
    return query
      .toLowerCase()
      .trim()
      .replace(/[^\w\s]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }

  /**
   * Generate cache key with hash
   */
  private generateKey(namespace: string, identifier: string): string {
    const normalized = this.normalizeQuery(identifier);
    const hash = createHash('sha256').update(normalized).digest('hex').slice(0, 16);
    return `blazing:${namespace}:${hash}`;
  }

  /**
   * Get from cache with ultra-fast lookup
   * 
   * Priority:
   * 1. Hot cache (popular queries) - ~0.01ms
   * 2. Memory cache - ~0.1ms
   * 3. Redis cache - ~1-5ms
   */
  async get<T>(namespace: string, identifier: string): Promise<T | null> {
    const startTime = Date.now();
    const key = this.generateKey(namespace, identifier);
    const normalizedId = this.normalizeQuery(identifier);

    // Level 1: Hot cache (instant)
    if (this.hotCache.has(key)) {
      this.stats.hits++;
      logger.debug(`Hot cache HIT: ${key} (${Date.now() - startTime}ms)`);
      return this.hotCache.get(key) as T;
    }

    // Level 2: Memory cache (sub-millisecond)
    const memEntry = this.memoryCache.get(key);
    if (memEntry && memEntry.expiry > Date.now()) {
      this.stats.hits++;
      
      // Track popularity
      memEntry.hits = (memEntry.hits || 0) + 1;
      
      // Promote to hot cache if popular (5+ hits)
      if (memEntry.hits >= 5) {
        this.hotCache.set(key, memEntry.data);
        logger.debug(`Promoted to hot cache: ${key}`);
      }
      
      logger.debug(`Memory cache HIT: ${key} (${Date.now() - startTime}ms)`);
      return memEntry.data as T;
    }

    // Level 3: Redis cache (few milliseconds)
    try {
      if (redisService?.isAvailable()) {
        const cached = await redisService.get<string>(key);
        if (cached && typeof cached === 'string') {
          try {
            const data = JSON.parse(cached) as T;
            
            // Populate memory cache
            this.memoryCache.set(key, {
              data,
              expiry: Date.now() + 60000, // 1 min in memory
              hits: 1
            });
            
            this.stats.hits++;
            logger.debug(`Redis cache HIT: ${key} (${Date.now() - startTime}ms)`);
            return data;
          } catch (parseError) {
            logger.warn(`Redis cache parse error for key ${key}, invalidating...`);
            // Invalid data, delete it
            await redisService.del(key);
          }
        }
      }
    } catch (error) {
      logger.warn('Redis get failed:', error);
    }

    this.stats.misses++;
    this.updateHitRate();
    return null;
  }

  /**
   * Set with multi-level storage and smart TTL
   */
  async set<T>(
    namespace: string,
    identifier: string,
    data: T,
    options: { ttl?: number; hot?: boolean } = {}
  ): Promise<void> {
    const key = this.generateKey(namespace, identifier);
    const ttl = options.ttl || 3600; // Default 1 hour

    // Always set in memory cache for fast access
    this.memoryCache.set(key, {
      data,
      expiry: Date.now() + Math.min(ttl * 1000, 300000), // Max 5 min in memory
      hits: 0
    });

    // Set in hot cache if marked as popular
    if (options.hot) {
      this.hotCache.set(key, data);
    }

    // Evict old entries if memory cache is too large
    if (this.memoryCache.size > this.maxMemoryCacheSize) {
      this.evictLRU();
    }

    // Persist to Redis with proper JSON serialization
    try {
      if (redisService?.isAvailable()) {
        // Ensure proper JSON serialization
        const jsonString = JSON.stringify(data);
        if (jsonString && jsonString !== '[object Object]') {
          await redisService.setex(key, ttl, jsonString);
        } else {
          logger.warn(`Skipping Redis cache for ${key} - invalid serialization`);
        }
      }
    } catch (error) {
      logger.warn('Redis set failed:', error);
    }
  }

  /**
   * Cache complete RAG response (MAIN OPTIMIZATION)
   */
  async cacheRAGResponse(
    query: string,
    response: {
      answer: string;
      sources: any[];
      confidence: number;
      metadata?: any;
    },
    ttl: number = 3600
  ): Promise<void> {
    await this.set('rag-complete', query, response, { ttl, hot: false });
  }

  /**
   * Get complete RAG response
   */
  async getRAGResponse(query: string): Promise<any | null> {
    return this.get<any>('rag-complete', query);
  }

  /**
   * Cache embeddings (long TTL)
   */
  async cacheEmbedding(text: string, embedding: number[]): Promise<void> {
    await this.set('embedding', text, embedding, { ttl: 86400 * 7 }); // 7 days
  }

  /**
   * Get cached embedding
   */
  async getEmbedding(text: string): Promise<number[] | null> {
    return this.get<number[]>('embedding', text);
  }

  /**
   * Cache search results
   */
  async cacheSearchResults(query: string, results: any[]): Promise<void> {
    await this.set('search', query, results, { ttl: 1800 }); // 30 min
  }

  /**
   * Get cached search results
   */
  async getSearchResults(query: string): Promise<any[] | null> {
    return this.get<any[]>('search', query);
  }

  /**
   * Pre-warm cache with popular queries
   */
  async warmCache(queries: Array<{ query: string; response: any }>): Promise<void> {
    logger.info(`Warming cache with ${queries.length} queries`);
    
    for (const { query, response } of queries) {
      await this.set('rag-complete', query, response, { ttl: 86400, hot: true });
    }
    
    logger.info(`Cache warmed successfully`);
  }

  /**
   * Invalidate cache by pattern
   */
  async invalidate(namespace: string): Promise<void> {
    // Clear memory cache
    const prefix = `blazing:${namespace}:`;
    for (const key of this.memoryCache.keys()) {
      if (key.startsWith(prefix)) {
        this.memoryCache.delete(key);
      }
    }
    
    // Clear hot cache
    for (const key of this.hotCache.keys()) {
      if (key.startsWith(prefix)) {
        this.hotCache.delete(key);
      }
    }

    // Clear Redis
    try {
      if (redisService?.isAvailable()) {
        const keys = await redisService.keys(`${prefix}*`);
        if (keys && keys.length > 0) {
          await redisService.del(...keys);
        }
      }
    } catch (error) {
      logger.warn('Cache invalidation failed:', error);
    }
  }

  /**
   * Invalidate all caches (when documents are added/removed)
   */
  async invalidateAll(): Promise<void> {
    this.memoryCache.clear();
    this.hotCache.clear();
    
    try {
      if (redisService?.isAvailable()) {
        const keys = await redisService.keys('blazing:*');
        if (keys && keys.length > 0) {
          await redisService.del(...keys);
        }
      }
    } catch (error) {
      logger.warn('Full cache invalidation failed:', error);
    }
    
    logger.info('All caches invalidated');
  }

  /**
   * LRU eviction
   */
  private evictLRU(): void {
    const entries = Array.from(this.memoryCache.entries());
    
    // Sort by hits (ascending) and expiry (ascending)
    entries.sort((a, b) => {
      const hitsA = a[1].hits || 0;
      const hitsB = b[1].hits || 0;
      if (hitsA !== hitsB) return hitsA - hitsB;
      return a[1].expiry - b[1].expiry;
    });
    
    // Remove bottom 20%
    const toRemove = Math.floor(this.memoryCache.size * 0.2);
    for (let i = 0; i < toRemove; i++) {
      this.memoryCache.delete(entries[i][0]);
    }
    
    logger.debug(`Evicted ${toRemove} entries from memory cache`);
  }

  /**
   * Clean expired entries
   */
  private cleanMemoryCache(): void {
    const now = Date.now();
    let cleaned = 0;
    
    for (const [key, entry] of this.memoryCache.entries()) {
      if (entry.expiry < now) {
        this.memoryCache.delete(key);
        cleaned++;
      }
    }
    
    if (cleaned > 0) {
      logger.debug(`Cleaned ${cleaned} expired entries from memory cache`);
    }
  }

  /**
   * Update hit rate
   */
  private updateHitRate(): void {
    const total = this.stats.hits + this.stats.misses;
    this.stats.hitRate = total > 0 ? this.stats.hits / total : 0;
  }

  /**
   * Log cache statistics
   */
  private logStats(): void {
    logger.info('Cache statistics', {
      ...this.stats,
      memoryCacheSize: this.memoryCache.size,
      hotCacheSize: this.hotCache.size,
      hitRatePercent: (this.stats.hitRate * 100).toFixed(2)
    });
  }

  /**
   * Get cache statistics
   */
  getStats(): CacheStats & { memoryCacheSize: number; hotCacheSize: number } {
    return {
      ...this.stats,
      memoryCacheSize: this.memoryCache.size,
      hotCacheSize: this.hotCache.size
    };
  }
}

export const blazingCache = new BlazingCacheService();

