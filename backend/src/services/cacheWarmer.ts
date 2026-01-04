import { logger } from '../utils/logger';
import { aggressiveCache } from './aggressiveCache';
import { parallelEmbeddings } from './parallelEmbeddings';
import { SearchQueryModel, DocumentChunkModel } from '../models/index';

interface WarmupConfig {
  topQueries: number;
  warmEmbeddings: boolean;
  warmSearchResults: boolean;
}

const DEFAULT_CONFIG: WarmupConfig = {
  topQueries: 20,
  warmEmbeddings: true,
  warmSearchResults: true
};

/**
 * Cache Warmer Service
 * Pre-warms caches on startup for faster initial responses
 */
export class CacheWarmer {
  private isWarming = false;
  private warmupComplete = false;

  /**
   * Warm up caches on server startup
   */
  async warmup(config: Partial<WarmupConfig> = {}): Promise<void> {
    if (this.isWarming) {
      logger.info('Cache warmup already in progress');
      return;
    }

    this.isWarming = true;
    const startTime = Date.now();
    const cfg = { ...DEFAULT_CONFIG, ...config };

    logger.info('🔥 Starting cache warmup...');

    try {
      // 1. Warm up embeddings for all document chunks
      if (cfg.warmEmbeddings) {
        await this.warmEmbeddings();
      }

      // 2. Warm up common queries
      if (cfg.warmSearchResults) {
        await this.warmCommonQueries(cfg.topQueries);
      }

      // 3. Pre-compute document statistics
      await this.warmStats();

      this.warmupComplete = true;
      logger.info(`✅ Cache warmup completed in ${Date.now() - startTime}ms`);

    } catch (error) {
      logger.error('Cache warmup failed:', error);
    } finally {
      this.isWarming = false;
    }
  }

  /**
   * Warm up embeddings cache
   */
  private async warmEmbeddings(): Promise<void> {
    const startTime = Date.now();
    
    try {
      // Get all unique content from chunks
      const chunks = await DocumentChunkModel.find({}, { content: 1 }).lean();
      
      if (chunks.length === 0) {
        logger.info('No chunks to warm embeddings for');
        return;
      }

      // Process in batches
      const batchSize = 50;
      let warmed = 0;

      for (let i = 0; i < chunks.length; i += batchSize) {
        const batch = chunks.slice(i, i + batchSize);
        const contents = batch.map((c: any) => c.content);
        
        // This will cache embeddings automatically
        await parallelEmbeddings.getEmbeddings(contents);
        warmed += batch.length;
        
        logger.debug(`Warmed ${warmed}/${chunks.length} embeddings`);
      }

      logger.info(`Warmed ${warmed} embeddings in ${Date.now() - startTime}ms`);

    } catch (error) {
      logger.error('Embedding warmup failed:', error);
    }
  }

  /**
   * Warm up common search queries
   */
  private async warmCommonQueries(topN: number): Promise<void> {
    const startTime = Date.now();

    try {
      // Get most frequent queries from search history
      const topQueries = await SearchQueryModel.aggregate([
        {
          $group: {
            _id: '$query',
            count: { $sum: 1 },
            avgConfidence: { $avg: '$confidence' }
          }
        },
        { $sort: { count: -1 } },
        { $limit: topN }
      ]).exec();

      if (topQueries.length === 0) {
        logger.info('No search history to warm queries from');
        return;
      }

      // Pre-generate embeddings for top queries
      const queries = topQueries.map((q: any) => q._id);
      await parallelEmbeddings.getEmbeddings(queries);

      logger.info(`Warmed ${queries.length} common queries in ${Date.now() - startTime}ms`);

    } catch (error) {
      logger.error('Query warmup failed:', error);
    }
  }

  /**
   * Warm up statistics cache
   */
  private async warmStats(): Promise<void> {
    try {
      const stats = await DocumentChunkModel.aggregate([
        {
          $group: {
            _id: '$documentId',
            documentName: { $first: '$documentName' },
            chunkCount: { $sum: 1 }
          }
        }
      ]).exec();

      await aggressiveCache.set('stats', 'documents', stats, 900); // 15 min

      logger.info(`Warmed stats for ${stats.length} documents`);

    } catch (error) {
      logger.error('Stats warmup failed:', error);
    }
  }

  /**
   * Check if warmup is complete
   */
  isReady(): boolean {
    return this.warmupComplete;
  }

  /**
   * Get warmup status
   */
  getStatus(): { isWarming: boolean; isComplete: boolean } {
    return {
      isWarming: this.isWarming,
      isComplete: this.warmupComplete
    };
  }

  /**
   * Schedule periodic cache refresh
   */
  scheduleRefresh(intervalMs: number = 3600000): NodeJS.Timeout {
    return setInterval(() => {
      logger.info('Scheduled cache refresh starting...');
      this.warmup({ topQueries: 10, warmEmbeddings: false });
    }, intervalMs);
  }
}

export const cacheWarmer = new CacheWarmer();
