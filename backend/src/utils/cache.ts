import { LRUCache } from 'lru-cache';
import crypto from 'crypto';
import { logger } from './logger';

// Import Redis service (lazy to avoid circular deps)
let redisService: any = null;
const getRedisService = async () => {
  if (!redisService) {
    const module = await import('../services/RedisService');
    redisService = module.redisService;
  }
  return redisService;
};

// Embedding cache - stores computed embeddings to avoid duplicate API calls
const embeddingCache = new LRUCache<string, number[]>({
  max: 1000, // Max 1000 embeddings cached
  ttl: 1000 * 60 * 60, // 1 hour TTL
  updateAgeOnGet: true,
  allowStale: false
});

// Stats cache - stores frequently accessed statistics
const statsCache = new LRUCache<string, any>({
  max: 100,
  ttl: 1000 * 60 * 5, // 5 minutes TTL
  updateAgeOnGet: true
});

// Document cache - stores document metadata
const documentCache = new LRUCache<string, any>({
  max: 500,
  ttl: 1000 * 60 * 10, // 10 minutes TTL
  updateAgeOnGet: true
});

// Search results cache
const searchCache = new LRUCache<string, any>({
  max: 200,
  ttl: 1000 * 60 * 5, // 5 minutes TTL
  updateAgeOnGet: true
});

// Generate hash for text content
export function getTextHash(text: string): string {
  return crypto.createHash('md5').update(text).digest('hex');
}

// Embedding cache operations - with Redis fallback
export const EmbeddingCache = {
  async get(text: string): Promise<number[] | undefined> {
    const hash = getTextHash(text);
    
    // Try LRU first (fastest)
    const lruCached = embeddingCache.get(hash);
    if (lruCached) {
      logger.debug('Embedding LRU cache hit', { hash: hash.substring(0, 8) });
      return lruCached;
    }
    
    // Try Redis
    try {
      const redis = await getRedisService();
      if (redis?.isAvailable()) {
        const redisCached = await redis.getEmbedding(text);
        if (redisCached) {
          // Populate LRU cache
          embeddingCache.set(hash, redisCached);
          logger.debug('Embedding Redis cache hit', { hash: hash.substring(0, 8) });
          return redisCached;
        }
      }
    } catch (e) {
      // Redis unavailable, continue without
    }
    
    return undefined;
  },

  async set(text: string, embedding: number[]): Promise<void> {
    const hash = getTextHash(text);
    
    // Always set in LRU
    embeddingCache.set(hash, embedding);
    
    // Try to set in Redis (fire and forget)
    try {
      const redis = await getRedisService();
      if (redis?.isAvailable()) {
        redis.setEmbedding(text, embedding).catch(() => {});
      }
    } catch (e) {
      // Redis unavailable, LRU is sufficient
    }
    
    logger.debug('Embedding cached', { hash: hash.substring(0, 8) });
  },

  has(text: string): boolean {
    return embeddingCache.has(getTextHash(text));
  },

  getStats() {
    return {
      size: embeddingCache.size,
      maxSize: 1000,
      hitRate: embeddingCache.size > 0 ? 'active' : 'empty'
    };
  },

  clear(): void {
    embeddingCache.clear();
    logger.info('Embedding cache cleared');
  }
};

// Search cache operations - with Redis fallback
export const SearchCache = {
  async get(query: string, strategy: string): Promise<any | undefined> {
    const hash = getTextHash(`${query}:${strategy}`);
    
    // Try LRU first
    const lruCached = searchCache.get(hash);
    if (lruCached) {
      logger.debug('Search LRU cache hit', { hash: hash.substring(0, 8) });
      return lruCached;
    }
    
    // Try Redis
    try {
      const redis = await getRedisService();
      if (redis?.isAvailable()) {
        const redisCached = await redis.getSearchResults(query, strategy);
        if (redisCached) {
          searchCache.set(hash, redisCached);
          logger.debug('Search Redis cache hit', { hash: hash.substring(0, 8) });
          return redisCached;
        }
      }
    } catch (e) {
      // Redis unavailable
    }
    
    return undefined;
  },

  async set(query: string, strategy: string, results: any): Promise<void> {
    const hash = getTextHash(`${query}:${strategy}`);
    
    // Always set in LRU
    searchCache.set(hash, results);
    
    // Try Redis
    try {
      const redis = await getRedisService();
      if (redis?.isAvailable()) {
        redis.setSearchResults(query, strategy, results).catch(() => {});
      }
    } catch (e) {
      // Redis unavailable
    }
    
    logger.debug('Search results cached', { hash: hash.substring(0, 8) });
  },

  clear(): void {
    searchCache.clear();
  }
};

// Stats cache operations
export const StatsCache = {
  async get<T>(key: string): Promise<T | undefined> {
    // Try LRU first
    const lruCached = statsCache.get(key) as T | undefined;
    if (lruCached) return lruCached;
    
    // Try Redis
    try {
      const redis = await getRedisService();
      if (redis?.isAvailable()) {
        const redisCached = await redis.getCachedStats(key);
        if (redisCached) {
          statsCache.set(key, redisCached);
          return redisCached as T;
        }
      }
    } catch (e) {
      // Redis unavailable
    }
    
    return undefined;
  },

  async set<T>(key: string, value: T): Promise<void> {
    statsCache.set(key, value);
    
    try {
      const redis = await getRedisService();
      if (redis?.isAvailable()) {
        redis.setCachedStats(value, key).catch(() => {});
      }
    } catch (e) {
      // Redis unavailable
    }
  },

  invalidate(key: string): void {
    statsCache.delete(key);
  },

  clear(): void {
    statsCache.clear();
  }
};

// Document cache operations
export const DocumentCache = {
  get<T>(key: string): T | undefined {
    return documentCache.get(key) as T | undefined;
  },

  set<T>(key: string, value: T): void {
    documentCache.set(key, value);
  },

  invalidate(key: string): void {
    documentCache.delete(key);
  },

  invalidateAll(): void {
    documentCache.clear();
  }
};

// Get all cache stats
export async function getCacheStats() {
  let redisStats = { connected: false, keys: 0, memory: 'N/A' };
  
  try {
    const redis = await getRedisService();
    if (redis?.isAvailable()) {
      redisStats = await redis.getStats();
    }
  } catch (e) {
    // Redis unavailable
  }
  
  return {
    lru: {
      embedding: {
        size: embeddingCache.size,
        maxSize: 1000
      },
      stats: {
        size: statsCache.size,
        maxSize: 100
      },
      document: {
        size: documentCache.size,
        maxSize: 500
      },
      search: {
        size: searchCache.size,
        maxSize: 200
      }
    },
    redis: redisStats
  };
}

// Invalidate all caches (for document changes)
export async function invalidateAllCaches(): Promise<void> {
  // Clear LRU caches
  statsCache.clear();
  searchCache.clear();
  documentCache.clear();
  
  // Clear Redis caches
  try {
    const redis = await getRedisService();
    if (redis?.isAvailable()) {
      await redis.invalidateDocumentCaches();
    }
  } catch (e) {
    // Redis unavailable
  }
  
  logger.info('All caches invalidated');
}
