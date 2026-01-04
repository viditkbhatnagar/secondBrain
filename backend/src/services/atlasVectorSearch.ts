import { DocumentChunkModel } from '../models/index';
import { logger } from '../utils/logger';
import { parallelEmbeddings } from './parallelEmbeddings';

interface VectorSearchResult {
  documentId: string;
  documentName: string;
  chunkId: string;
  content: string;
  score: number;
  metadata: {
    chunkIndex: number;
    wordCount?: number;
  };
}

interface SearchOptions {
  limit?: number;
  minScore?: number;
  filter?: Record<string, any>;
}

/**
 * MongoDB Atlas Vector Search Service
 * 
 * Requires Atlas Vector Search index to be created:
 * 
 * Index Name: vector_index
 * Index Definition:
 * {
 *   "fields": [
 *     {
 *       "type": "vector",
 *       "path": "embedding",
 *       "numDimensions": 1536,
 *       "similarity": "cosine"
 *     }
 *   ]
 * }
 */
export class AtlasVectorSearch {
  private indexName = 'vector_index';
  private isAtlasAvailable = false;

  constructor() {
    this.checkAtlasAvailability();
  }

  /**
   * Check if Atlas Vector Search is available
   */
  private async checkAtlasAvailability(): Promise<void> {
    try {
      // Try to run a simple aggregation to check if vector search is available
      const result = await DocumentChunkModel.aggregate([
        { $limit: 1 },
        { $project: { _id: 1 } }
      ]).exec();
      
      // Check if we're connected to Atlas (not local MongoDB)
      const uri = process.env.MONGODB_URI || '';
      this.isAtlasAvailable = uri.includes('mongodb+srv://') || uri.includes('mongodb.net');
      
      if (this.isAtlasAvailable) {
        logger.info('✅ MongoDB Atlas Vector Search available');
      } else {
        logger.info('⚠️ Using local MongoDB - falling back to in-memory vector search');
      }
    } catch (error) {
      this.isAtlasAvailable = false;
      logger.warn('Atlas Vector Search check failed:', error);
    }
  }

  /**
   * Check if Atlas Vector Search is enabled
   */
  isEnabled(): boolean {
    return this.isAtlasAvailable;
  }

  /**
   * Search using Atlas Vector Search (fast, indexed)
   */
  async search(
    query: string,
    options: SearchOptions = {}
  ): Promise<VectorSearchResult[]> {
    const { limit = 10, minScore = 0.4, filter } = options;
    const startTime = Date.now();

    try {
      // Generate query embedding
      const queryEmbedding = await parallelEmbeddings.getEmbedding(query);

      if (this.isAtlasAvailable) {
        return await this.atlasSearch(queryEmbedding, limit, minScore, filter);
      } else {
        return await this.fallbackSearch(queryEmbedding, limit, minScore);
      }

    } catch (error) {
      logger.error('Vector search failed:', error);
      // Fallback to in-memory search
      const queryEmbedding = await parallelEmbeddings.getEmbedding(query);
      return this.fallbackSearch(queryEmbedding, limit, minScore);
    }
  }

  /**
   * Atlas Vector Search using $vectorSearch aggregation
   */
  private async atlasSearch(
    queryEmbedding: number[],
    limit: number,
    minScore: number,
    filter?: Record<string, any>
  ): Promise<VectorSearchResult[]> {
    const startTime = Date.now();

    try {
      const pipeline: any[] = [
        {
          $vectorSearch: {
            index: this.indexName,
            path: 'embedding',
            queryVector: queryEmbedding,
            numCandidates: limit * 10, // Get more candidates for better results
            limit: limit * 2 // Get extra for filtering
          }
        },
        {
          $project: {
            documentId: 1,
            documentName: 1,
            chunkId: 1,
            content: 1,
            chunkIndex: 1,
            wordCount: 1,
            score: { $meta: 'vectorSearchScore' }
          }
        }
      ];

      // Add filter if provided
      if (filter) {
        pipeline.push({ $match: filter });
      }

      // Filter by minimum score
      pipeline.push({ $match: { score: { $gte: minScore } } });
      pipeline.push({ $limit: limit });

      const results = await DocumentChunkModel.aggregate(pipeline).exec();

      logger.info(`Atlas Vector Search completed in ${Date.now() - startTime}ms`, {
        results: results.length,
        topScore: results[0]?.score?.toFixed(3)
      });

      return results.map((r: any) => ({
        documentId: r.documentId,
        documentName: r.documentName,
        chunkId: r.chunkId,
        content: r.content,
        score: r.score,
        metadata: {
          chunkIndex: r.chunkIndex,
          wordCount: r.wordCount
        }
      }));

    } catch (error: any) {
      // If Atlas Vector Search fails (index not created), fall back
      if (error.message?.includes('$vectorSearch') || error.codeName === 'InvalidPipelineOperator') {
        logger.warn('Atlas Vector Search index not found, using fallback');
        this.isAtlasAvailable = false;
        return this.fallbackSearch(queryEmbedding, limit, minScore);
      }
      throw error;
    }
  }

  /**
   * Fallback in-memory vector search (slower but always works)
   */
  private async fallbackSearch(
    queryEmbedding: number[],
    limit: number,
    minScore: number
  ): Promise<VectorSearchResult[]> {
    const startTime = Date.now();

    const allChunks = await DocumentChunkModel.find({}).lean();
    
    const similarities: Array<{ chunk: any; score: number }> = [];
    
    for (const chunk of allChunks) {
      if (!chunk.embedding || chunk.embedding.length === 0) continue;
      
      const score = this.cosineSimilarity(queryEmbedding, chunk.embedding as number[]);
      if (score >= minScore) {
        similarities.push({ chunk, score });
      }
    }
    
    similarities.sort((a, b) => b.score - a.score);

    logger.info(`Fallback vector search completed in ${Date.now() - startTime}ms`, {
      scanned: allChunks.length,
      results: Math.min(similarities.length, limit)
    });

    return similarities.slice(0, limit).map(s => ({
      documentId: s.chunk.documentId,
      documentName: s.chunk.documentName,
      chunkId: s.chunk.chunkId,
      content: s.chunk.content,
      score: s.score,
      metadata: {
        chunkIndex: s.chunk.chunkIndex,
        wordCount: s.chunk.wordCount
      }
    }));
  }

  /**
   * Search with multiple query embeddings (for multi-query retrieval)
   */
  async multiSearch(
    queries: string[],
    options: SearchOptions = {}
  ): Promise<VectorSearchResult[]> {
    const { limit = 5 } = options;
    
    // Search with all queries in parallel
    const results = await Promise.all(
      queries.map(q => this.search(q, { ...options, limit: limit * 2 }))
    );

    // Merge and deduplicate results
    const seen = new Map<string, VectorSearchResult>();
    
    for (const resultSet of results) {
      for (const result of resultSet) {
        const existing = seen.get(result.chunkId);
        if (!existing || result.score > existing.score) {
          seen.set(result.chunkId, result);
        }
      }
    }

    // Sort by score and limit
    return Array.from(seen.values())
      .sort((a, b) => b.score - a.score)
      .slice(0, limit);
  }

  /**
   * Cosine similarity calculation
   */
  private cosineSimilarity(a: number[], b: number[]): number {
    if (a.length !== b.length) return 0;

    let dotProduct = 0;
    let normA = 0;
    let normB = 0;

    for (let i = 0; i < a.length; i++) {
      dotProduct += a[i] * b[i];
      normA += a[i] * a[i];
      normB += b[i] * b[i];
    }

    normA = Math.sqrt(normA);
    normB = Math.sqrt(normB);

    if (normA === 0 || normB === 0) return 0;

    return dotProduct / (normA * normB);
  }

  /**
   * Create Atlas Vector Search index (run once during setup)
   */
  async createIndex(): Promise<boolean> {
    try {
      // This needs to be done via Atlas UI or Atlas Admin API
      // The index definition should be:
      const indexDefinition = {
        name: this.indexName,
        definition: {
          fields: [
            {
              type: 'vector',
              path: 'embedding',
              numDimensions: 1536,
              similarity: 'cosine'
            }
          ]
        }
      };

      logger.info('Atlas Vector Search index definition:', indexDefinition);
      logger.info('Please create this index in MongoDB Atlas UI under Search Indexes');
      
      return true;
    } catch (error) {
      logger.error('Failed to create Atlas Vector Search index:', error);
      return false;
    }
  }
}

export const atlasVectorSearch = new AtlasVectorSearch();
