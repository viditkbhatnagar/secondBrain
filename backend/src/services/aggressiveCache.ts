import { redisService } from './RedisService';
import { logger } from '../utils/logger';
import * as crypto from 'crypto';

interface CacheEntry<T> {
  data: T;
  timestamp: number;
  hits: number;
}

interface CacheConfig {
  defaultTTL: number;
  maxMemoryItems: number;
  enableCompression: boolean;
}

const DEFAULT_CONFIG: CacheConfig = {
  defaultTTL: 3600,        // 1 hour
  maxMemoryItems: 1000,    // Max items in memory
  enableCompression: true
};

class AggressiveCache {
  private memoryCache: Map<string, CacheEntry<any>> = new Map();
  private config: CacheConfig;
  private hitCount = 0;
  private missCount = 0;
  private cleanupInterval: NodeJS.Timeout | null = null;
  private statsInterval: NodeJS.Timeout | null = null;

  constructor(config: Partial<CacheConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    
    // Periodic cleanup
    this.cleanupInterval = setInterval(() => this.cleanup(), 60000);
    
    // Log stats periodically
    this.statsInterval = setInterval(() => this.logStats(), 300000);
  }

  // Generate consistent cache key
  private generateKey(namespace: string, ...parts: string[]): string {
    const combined = parts.join(':');
    const hash = crypto.createHash('md5').update(combined).digest('hex').slice(0, 12);
    return `${namespace}:${hash}`;
  }

  // Multi-level get: Memory -> Redis
  async get<T>(namespace: string, identifier: string): Promise<T | null> {
    const key = this.generateKey(namespace, identifier);

    // Level 1: Memory cache (< 1ms)
    const memEntry = this.memoryCache.get(key);
    if (memEntry && memEntry.timestamp + this.config.defaultTTL * 1000 > Date.now()) {
      memEntry.hits++;
      this.hitCount++;
      return memEntry.data as T;
    }

    // Level 2: Redis cache (< 5ms)
    try {
      const redisValue = await redisService.get<T>(key);
      if (redisValue) {
        // Populate memory cache
        this.setMemory(key, redisValue);
        this.hitCount++;
        return redisValue;
      }
    } catch (error) {
      logger.warn('Redis get failed:', error);
    }

    this.missCount++;
    return null;
  }

  // Multi-level set: Memory + Redis
  async set<T>(
    namespace: string,
    identifier: string,
    data: T,
    ttl?: number
  ): Promise<void> {
    const key = this.generateKey(namespace, identifier);
    const finalTTL = ttl || this.config.defaultTTL;

    // Set in memory
    this.setMemory(key, data);

    // Set in Redis
    try {
      await redisService.set(key, data, finalTTL);
    } catch (error) {
      logger.warn('Redis set failed:', error);
    }
  }

  private setMemory<T>(key: string, data: T): void {
    // Evict if at capacity
    if (this.memoryCache.size >= this.config.maxMemoryItems) {
      this.evictLRU();
    }

    this.memoryCache.set(key, {
      data,
      timestamp: Date.now(),
      hits: 0
    });
  }

  private evictLRU(): void {
    let oldestKey: string | null = null;
    let lowestScore = Infinity;

    for (const [key, entry] of this.memoryCache) {
      const age = Date.now() - entry.timestamp;
      const score = entry.hits - (age / 60000);
      if (score < lowestScore) {
        lowestScore = score;
        oldestKey = key;
      }
    }

    if (oldestKey) {
      this.memoryCache.delete(oldestKey);
    }
  }

  private cleanup(): void {
    const now = Date.now();
    const maxAge = this.config.defaultTTL * 1000;

    for (const [key, entry] of this.memoryCache) {
      if (now - entry.timestamp > maxAge) {
        this.memoryCache.delete(key);
      }
    }
  }

  private logStats(): void {
    const total = this.hitCount + this.missCount;
    const hitRate = total > 0 ? (this.hitCount / total * 100).toFixed(1) : '0';
    
    logger.info('Cache stats', {
      memorySize: this.memoryCache.size,
      hitRate: `${hitRate}%`,
      hits: this.hitCount,
      misses: this.missCount
    });
  }

  // Specialized cache methods
  async cacheEmbedding(text: string, embedding: number[]): Promise<void> {
    await this.set('emb', text, embedding, 86400 * 7); // 7 days
  }

  async getEmbedding(text: string): Promise<number[] | null> {
    return this.get<number[]>('emb', text);
  }

  async cacheSearchResult(query: string, results: any[]): Promise<void> {
    await this.set('search', query, results, 600); // 10 minutes
  }

  async getSearchResult(query: string): Promise<any[] | null> {
    return this.get<any[]>('search', query);
  }

  async cacheRAGResponse(query: string, response: any): Promise<void> {
    await this.set('rag', query, response, 1800); // 30 minutes
  }

  async getRAGResponse(query: string): Promise<any | null> {
    return this.get('rag', query);
  }

  // Get current hit rate
  getHitRate(): number {
    const total = this.hitCount + this.missCount;
    return total > 0 ? this.hitCount / total : 0;
  }

  // Get stats
  getStats(): { memorySize: number; hitRate: string; hits: number; misses: number } {
    const total = this.hitCount + this.missCount;
    return {
      memorySize: this.memoryCache.size,
      hitRate: total > 0 ? `${(this.hitCount / total * 100).toFixed(1)}%` : '0%',
      hits: this.hitCount,
      misses: this.missCount
    };
  }

  // Clear all caches
  async clear(): Promise<void> {
    this.memoryCache.clear();
    this.hitCount = 0;
    this.missCount = 0;
    logger.info('Aggressive cache cleared');
  }

  // Cleanup on shutdown
  destroy(): void {
    if (this.cleanupInterval) clearInterval(this.cleanupInterval);
    if (this.statsInterval) clearInterval(this.statsInterval);
  }
}

export const aggressiveCache = new AggressiveCache();
