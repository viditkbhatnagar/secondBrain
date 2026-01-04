import { createHash } from 'crypto';
import { logger } from '../utils/logger';
import { redisService } from './RedisService';

interface CacheOptions {
  ttl: number;  // seconds
  compress: boolean;
  namespace: string;
}

interface CacheStats {
  hits: number;
  misses: number;
  hitRate: number;
}

export class CacheService {
  private localCache: Map<string, { data: any; expiry: number }> = new Map();
  private stats: CacheStats = { hits: 0, misses: 0, hitRate: 0 };

  constructor() {
    // Clean local cache periodically
    setInterval(() => this.cleanLocalCache(), 60000);
  }

  // Generate cache key
  private generateKey(namespace: string, identifier: string): string {
    const hash = createHash('md5').update(identifier).digest('hex').slice(0, 16);
    return `${namespace}:${hash}`;
  }

  // Get with multi-level lookup
  async get<T>(namespace: string, identifier: string): Promise<T | null> {
    const key = this.generateKey(namespace, identifier);

    // Level 1: Local memory cache (fastest)
    const local = this.localCache.get(key);
    if (local && local.expiry > Date.now()) {
      this.stats.hits++;
      this.updateHitRate();
      return local.data as T;
    }

    // Level 2: Redis cache
    try {
      if (redisService?.isAvailable()) {
        const cached = await redisService.get<string>(key);
        if (cached) {
          const data = JSON.parse(cached);
          // Populate local cache
          this.localCache.set(key, { data, expiry: Date.now() + 30000 }); // 30s local
          this.stats.hits++;
          this.updateHitRate();
          return data as T;
        }
      }
    } catch (error) {
      logger.warn('Redis get failed:', error);
    }

    this.stats.misses++;
    this.updateHitRate();
    return null;
  }

  // Set with multi-level storage
  async set<T>(
    namespace: string,
    identifier: string,
    data: T,
    options: Partial<CacheOptions> = {}
  ): Promise<void> {
    const key = this.generateKey(namespace, identifier);
    const ttl = options.ttl || 3600; // Default 1 hour

    // Level 1: Local cache
    this.localCache.set(key, { 
      data, 
      expiry: Date.now() + Math.min(ttl * 1000, 60000) // Max 60s local
    });

    // Level 2: Redis
    try {
      if (redisService?.isAvailable()) {
        await redisService.setex(key, ttl, JSON.stringify(data));
      }
    } catch (error) {
      logger.warn('Redis set failed:', error);
    }
  }

  // Cache embeddings specifically
  async cacheEmbedding(text: string, embedding: number[]): Promise<void> {
    await this.set('embedding', text, embedding, { ttl: 86400 * 7 }); // 7 days
  }

  // Get cached embedding
  async getEmbedding(text: string): Promise<number[] | null> {
    return this.get<number[]>('embedding', text);
  }

  // Cache search results
  async cacheSearchResults(query: string, results: any[], ttl = 300): Promise<void> {
    await this.set('search', query, results, { ttl });
  }

  // Get cached search results
  async getSearchResults(query: string): Promise<any[] | null> {
    return this.get<any[]>('search', query);
  }

  // Cache LLM response
  async cacheLLMResponse(prompt: string, response: string, ttl = 3600): Promise<void> {
    await this.set('llm', prompt, response, { ttl });
  }

  // Get cached LLM response
  async getLLMResponse(prompt: string): Promise<string | null> {
    return this.get<string>('llm', prompt);
  }

  // Invalidate cache by pattern
  async invalidate(namespace: string, _pattern?: string): Promise<void> {
    // Clear local cache
    for (const key of this.localCache.keys()) {
      if (key.startsWith(namespace)) {
        this.localCache.delete(key);
      }
    }

    // Clear Redis
    try {
      if (redisService?.isAvailable()) {
        const keys = await redisService.keys(`${namespace}:*`);
        if (keys && keys.length > 0) {
          await redisService.del(...keys);
        }
      }
    } catch (error) {
      logger.warn('Cache invalidation failed:', error);
    }
  }

  private cleanLocalCache(): void {
    const now = Date.now();
    for (const [key, value] of this.localCache.entries()) {
      if (value.expiry < now) {
        this.localCache.delete(key);
      }
    }
  }

  private updateHitRate(): void {
    const total = this.stats.hits + this.stats.misses;
    this.stats.hitRate = total > 0 ? this.stats.hits / total : 0;
  }

  getStats(): CacheStats {
    return { ...this.stats };
  }
}

export const cacheService = new CacheService();
