/**
 * Browser-side caching utilities for blazing fast responses
 * 
 * Features:
 * 1. IndexedDB for persistent caching
 * 2. Memory cache for instant responses
 * 3. Cache expiration management
 * 4. Automatic cache invalidation
 */

interface CacheEntry<T> {
  data: T;
  timestamp: number;
  expiry: number;
  hits: number;
}

interface CacheOptions {
  ttl?: number; // Time to live in seconds
  forceRefresh?: boolean;
}

const DB_NAME = 'KnowledgeBaseCache';
const DB_VERSION = 2; // Bumped to force cache refresh for full accuracy
const STORE_NAME = 'responses';

class BrowserCacheService {
  private db: IDBDatabase | null = null;
  private memoryCache = new Map<string, CacheEntry<any>>();
  private initPromise: Promise<void> | null = null;

  constructor() {
    this.initPromise = this.initDB();
  }

  /**
   * Initialize IndexedDB
   */
  private async initDB(): Promise<void> {
    return new Promise((resolve, reject) => {
      if (typeof window === 'undefined' || !window.indexedDB) {
        console.warn('IndexedDB not available, using memory cache only');
        resolve();
        return;
      }

      const request = window.indexedDB.open(DB_NAME, DB_VERSION);

      request.onerror = () => {
        console.error('Failed to open IndexedDB:', request.error);
        reject(request.error);
      };

      request.onsuccess = () => {
        this.db = request.result;
        console.log('✅ IndexedDB initialized');
        resolve();
      };

      request.onupgradeneeded = (event: any) => {
        const db = event.target.result as IDBDatabase;
        
        // Create object store if it doesn't exist
        if (!db.objectStoreNames.contains(STORE_NAME)) {
          const objectStore = db.createObjectStore(STORE_NAME, { keyPath: 'key' });
          objectStore.createIndex('expiry', 'expiry', { unique: false });
          objectStore.createIndex('timestamp', 'timestamp', { unique: false });
        }
      };
    });
  }

  /**
   * Normalize cache key
   */
  private normalizeKey(key: string): string {
    return key.toLowerCase().trim().replace(/\s+/g, '_');
  }

  /**
   * Get from cache (memory first, then IndexedDB)
   */
  async get<T>(key: string, options: CacheOptions = {}): Promise<T | null> {
    const normalizedKey = this.normalizeKey(key);

    // Force refresh bypasses cache
    if (options.forceRefresh) {
      return null;
    }

    // Check memory cache first (instant)
    const memEntry = this.memoryCache.get(normalizedKey);
    if (memEntry && memEntry.expiry > Date.now()) {
      memEntry.hits++;
      console.log(`📦 Memory cache HIT: ${key.slice(0, 50)}`);
      return memEntry.data as T;
    }

    // Check IndexedDB (fast)
    await this.initPromise;
    
    if (!this.db) {
      return null;
    }

    try {
      const entry = await this.getFromDB<T>(normalizedKey);
      
      if (entry && entry.expiry > Date.now()) {
        // Populate memory cache
        this.memoryCache.set(normalizedKey, entry);
        
        console.log(`💾 IndexedDB cache HIT: ${key.slice(0, 50)}`);
        return entry.data;
      }

      // Expired or not found
      if (entry) {
        await this.deleteFromDB(normalizedKey);
      }
      
      return null;
    } catch (error) {
      console.error('Cache get error:', error);
      return null;
    }
  }

  /**
   * Set cache entry (both memory and IndexedDB)
   */
  async set<T>(key: string, data: T, options: CacheOptions = {}): Promise<void> {
    const normalizedKey = this.normalizeKey(key);
    const ttl = options.ttl || 3600; // Default 1 hour
    const now = Date.now();

    const entry: CacheEntry<T> = {
      data,
      timestamp: now,
      expiry: now + (ttl * 1000),
      hits: 0
    };

    // Set in memory cache
    this.memoryCache.set(normalizedKey, entry);

    // Limit memory cache size
    if (this.memoryCache.size > 100) {
      this.evictLRU();
    }

    // Set in IndexedDB
    await this.initPromise;
    
    if (this.db) {
      try {
        await this.setInDB(normalizedKey, entry);
      } catch (error) {
        console.error('Cache set error:', error);
      }
    }
  }

  /**
   * Cache search response
   */
  async cacheSearchResponse(query: string, response: any, ttl: number = 3600): Promise<void> {
    const key = `search:${query}`;
    await this.set(key, response, { ttl });
  }

  /**
   * Get cached search response
   */
  async getCachedSearchResponse(query: string): Promise<any | null> {
    const key = `search:${query}`;
    return this.get(key);
  }

  /**
   * Clear all caches
   */
  async clearAll(): Promise<void> {
    // Clear memory
    this.memoryCache.clear();

    // Clear IndexedDB
    await this.initPromise;
    
    if (this.db) {
      try {
        const transaction = this.db.transaction([STORE_NAME], 'readwrite');
        const objectStore = transaction.objectStore(STORE_NAME);
        await new Promise((resolve, reject) => {
          const request = objectStore.clear();
          request.onsuccess = () => resolve(undefined);
          request.onerror = () => reject(request.error);
        });
        
        console.log('🗑️ All caches cleared');
      } catch (error) {
        console.error('Clear cache error:', error);
      }
    }
  }

  /**
   * Clear expired entries
   */
  async clearExpired(): Promise<void> {
    const now = Date.now();

    // Clear from memory - use Array.from for es5 compatibility
    const entries = Array.from(this.memoryCache.entries());
    for (const [key, entry] of entries) {
      if (entry.expiry < now) {
        this.memoryCache.delete(key);
      }
    }

    // Clear from IndexedDB
    await this.initPromise;
    
    if (!this.db) return;

    try {
      const transaction = this.db.transaction([STORE_NAME], 'readwrite');
      const objectStore = transaction.objectStore(STORE_NAME);
      const index = objectStore.index('expiry');
      const range = IDBKeyRange.upperBound(now);

      await new Promise((resolve, reject) => {
        const request = index.openCursor(range);
        request.onsuccess = (event: any) => {
          const cursor = event.target.result;
          if (cursor) {
            cursor.delete();
            cursor.continue();
          } else {
            resolve(undefined);
          }
        };
        request.onerror = () => reject(request.error);
      });

      console.log('🧹 Expired cache entries cleared');
    } catch (error) {
      console.error('Clear expired error:', error);
    }
  }

  /**
   * Get cache statistics
   */
  getStats() {
    let totalHits = 0;
    // Use Array.from for es5 compatibility
    const values = Array.from(this.memoryCache.values());
    for (const entry of values) {
      totalHits += entry.hits;
    }

    return {
      memoryCacheSize: this.memoryCache.size,
      totalHits,
      dbAvailable: this.db !== null
    };
  }

  /**
   * Private: Get from IndexedDB
   */
  private getFromDB<T>(key: string): Promise<CacheEntry<T> | null> {
    return new Promise((resolve, reject) => {
      if (!this.db) {
        resolve(null);
        return;
      }

      const transaction = this.db.transaction([STORE_NAME], 'readonly');
      const objectStore = transaction.objectStore(STORE_NAME);
      const request = objectStore.get(key);

      request.onsuccess = () => {
        const result = request.result;
        if (result) {
          resolve({
            data: result.data,
            timestamp: result.timestamp,
            expiry: result.expiry,
            hits: result.hits || 0
          });
        } else {
          resolve(null);
        }
      };

      request.onerror = () => reject(request.error);
    });
  }

  /**
   * Private: Set in IndexedDB
   */
  private setInDB<T>(key: string, entry: CacheEntry<T>): Promise<void> {
    return new Promise((resolve, reject) => {
      if (!this.db) {
        resolve();
        return;
      }

      const transaction = this.db.transaction([STORE_NAME], 'readwrite');
      const objectStore = transaction.objectStore(STORE_NAME);
      const request = objectStore.put({
        key,
        ...entry
      });

      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  }

  /**
   * Private: Delete from IndexedDB
   */
  private deleteFromDB(key: string): Promise<void> {
    return new Promise((resolve, reject) => {
      if (!this.db) {
        resolve();
        return;
      }

      const transaction = this.db.transaction([STORE_NAME], 'readwrite');
      const objectStore = transaction.objectStore(STORE_NAME);
      const request = objectStore.delete(key);

      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  }

  /**
   * Private: Evict least recently used entries from memory
   */
  private evictLRU(): void {
    const entries = Array.from(this.memoryCache.entries());
    
    // Sort by hits (ascending) and timestamp (ascending)
    entries.sort((a, b) => {
      const hitsA = a[1].hits || 0;
      const hitsB = b[1].hits || 0;
      if (hitsA !== hitsB) {
        return hitsA - hitsB;
      }
      return a[1].timestamp - b[1].timestamp;
    });

    // Remove bottom 20%
    const toRemove = Math.floor(entries.length * 0.2);
    for (let i = 0; i < toRemove; i++) {
      this.memoryCache.delete(entries[i][0]);
    }
  }
}

// Export singleton instance
export const browserCache = new BrowserCacheService();

// Clean expired entries every 5 minutes
if (typeof window !== 'undefined') {
  setInterval(() => {
    browserCache.clearExpired().catch(console.error);
  }, 300000);
}

