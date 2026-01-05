import { logger } from '../utils/logger';
import { redisService } from './RedisService';
import { crossEncoderReranker } from './crossEncoderReranker';
import * as crypto from 'crypto';

interface RerankDocument {
  documentId: string;
  content: string;
  score: number;
  metadata?: any;
}

interface RerankResult {
  documentId: string;
  content: string;
  originalScore: number;
  rerankedScore: number;
  relevanceScore: number;
  metadata: any;
}

interface CohereRerankResponse {
  results: Array<{
    index: number;
    relevance_score: number;
  }>;
}

interface RerankConfig {
  useCohere: boolean;
  cohereModel: string;
  fallbackModel: string;
  termBoostFactor: number;
  topK: number;
  minScore: number;
}

const DEFAULT_RERANK_CONFIG: RerankConfig = {
  useCohere: true,
  cohereModel: 'rerank-english-v3.0',
  fallbackModel: 'ms-marco-MiniLM-L-6-v2',
  termBoostFactor: 1.2,
  topK: 6,
  minScore: 0.3
};

export class CohereReranker {
  private apiKey: string | null = null;
  private readonly CACHE_TTL = 3600; // 1 hour
  private readonly API_URL = 'https://api.cohere.ai/v1/rerank';
  private isAvailable = false;
  private config: RerankConfig;

  constructor() {
    this.apiKey = process.env.COHERE_API_KEY || null;
    this.isAvailable = !!this.apiKey;
    this.config = { ...DEFAULT_RERANK_CONFIG };
    
    if (this.isAvailable) {
      logger.info('✅ Cohere Reranker initialized with model:', this.config.cohereModel);
    } else {
      logger.info('⚠️ Cohere API key not found - using cross-encoder fallback');
    }
  }

  /**
   * Check if Cohere reranker is available
   */
  isEnabled(): boolean {
    return this.isAvailable;
  }

  /**
   * Get the current configuration
   */
  getConfig(): RerankConfig {
    return { ...this.config };
  }

  /**
   * Extract query terms for term boosting
   */
  extractQueryTerms(query: string): string[] {
    const stopWords = new Set([
      'the', 'a', 'an', 'is', 'are', 'was', 'were', 'be', 'been', 'being',
      'have', 'has', 'had', 'do', 'does', 'did', 'will', 'would', 'could',
      'should', 'may', 'might', 'must', 'shall', 'can', 'need', 'to', 'of',
      'in', 'for', 'on', 'with', 'at', 'by', 'from', 'as', 'into', 'through',
      'and', 'but', 'or', 'nor', 'so', 'yet', 'both', 'either', 'neither',
      'not', 'only', 'own', 'same', 'than', 'too', 'very', 'just', 'also',
      'what', 'which', 'who', 'whom', 'whose', 'where', 'when', 'why', 'how'
    ]);
    
    return query
      .toLowerCase()
      .replace(/[^\w\s]/g, ' ')
      .split(/\s+/)
      .filter(word => word.length > 2 && !stopWords.has(word));
  }

  /**
   * Apply term boost to chunks containing exact query term matches
   * Boosts chunks by termBoostFactor (default 1.2x) when they contain exact query terms
   */
  applyTermBoost(
    query: string,
    chunks: RerankResult[],
    boostFactor: number = this.config.termBoostFactor
  ): RerankResult[] {
    const queryTerms = this.extractQueryTerms(query);
    
    if (queryTerms.length === 0) {
      return chunks;
    }

    return chunks.map(chunk => {
      const contentLower = chunk.content.toLowerCase();
      const hasExactMatch = queryTerms.some(term => {
        // Check for exact word match (not just substring)
        const regex = new RegExp(`\\b${this.escapeRegex(term)}\\b`, 'i');
        return regex.test(contentLower);
      });

      if (hasExactMatch) {
        return {
          ...chunk,
          rerankedScore: Math.min(1, chunk.rerankedScore * boostFactor),
          relevanceScore: Math.min(1, chunk.relevanceScore * boostFactor)
        };
      }

      return chunk;
    });
  }

  /**
   * Escape special regex characters
   */
  private escapeRegex(str: string): string {
    return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }

  /**
   * Rerank documents using Cohere's neural reranker with term boost
   */
  async rerank(
    query: string,
    documents: RerankDocument[],
    options: { topK?: number; minScore?: number; applyTermBoost?: boolean } = {}
  ): Promise<RerankResult[]> {
    const { 
      topK = this.config.topK, 
      minScore = this.config.minScore,
      applyTermBoost: shouldApplyTermBoost = true 
    } = options;
    const startTime = Date.now();

    if (documents.length === 0) return [];
    
    // If only a few documents, skip reranking but still apply term boost
    if (documents.length <= topK) {
      let results = documents.map(d => ({
        documentId: d.documentId,
        content: d.content,
        originalScore: d.score,
        rerankedScore: d.score,
        relevanceScore: d.score,
        metadata: d.metadata
      }));
      
      if (shouldApplyTermBoost) {
        results = this.applyTermBoost(query, results);
      }
      
      return results;
    }

    // Check cache first
    const cacheKey = this.getCacheKey(query, documents);
    const cached = await this.getFromCache(cacheKey);
    if (cached) {
      logger.debug('Cohere rerank cache hit');
      // Apply term boost to cached results
      return shouldApplyTermBoost ? this.applyTermBoost(query, cached) : cached;
    }

    // If Cohere not available, use cross-encoder fallback
    if (!this.isAvailable) {
      return this.fallbackToCrossEncoder(query, documents, topK, minScore, shouldApplyTermBoost);
    }

    try {
      const response = await fetch(this.API_URL, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${this.apiKey}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          model: this.config.cohereModel,
          query: query,
          documents: documents.map(d => d.content.slice(0, 4096)), // Cohere limit
          top_n: Math.min(topK * 2, documents.length), // Get more for filtering
          return_documents: false
        })
      });

      if (!response.ok) {
        const error = await response.text();
        logger.error('Cohere API error:', { status: response.status, error });
        return this.fallbackToCrossEncoder(query, documents, topK, minScore, shouldApplyTermBoost);
      }

      const data = await response.json() as CohereRerankResponse;

      // Map results back to documents
      let results: RerankResult[] = data.results
        .map(r => ({
          documentId: documents[r.index].documentId,
          content: documents[r.index].content,
          originalScore: documents[r.index].score,
          rerankedScore: r.relevance_score,
          relevanceScore: r.relevance_score,
          metadata: documents[r.index].metadata
        }))
        .filter(r => r.rerankedScore >= minScore)
        .slice(0, topK);

      // Apply term boost after initial reranking
      if (shouldApplyTermBoost) {
        results = this.applyTermBoost(query, results);
        // Re-sort after term boost
        results.sort((a, b) => b.rerankedScore - a.rerankedScore);
      }

      // Cache results (before term boost to allow different boost factors)
      await this.setCache(cacheKey, results);

      logger.info(`Cohere reranking completed in ${Date.now() - startTime}ms`, {
        inputDocs: documents.length,
        outputDocs: results.length,
        topScore: results[0]?.rerankedScore.toFixed(3),
        rerankerUsed: 'cohere'
      });

      return results;

    } catch (error) {
      logger.error('Cohere reranking failed:', error);
      return this.fallbackToCrossEncoder(query, documents, topK, minScore, shouldApplyTermBoost);
    }
  }

  /**
   * Fallback to cross-encoder reranker when Cohere is unavailable
   */
  private async fallbackToCrossEncoder(
    query: string,
    documents: RerankDocument[],
    topK: number,
    minScore: number,
    shouldApplyTermBoost: boolean
  ): Promise<RerankResult[]> {
    logger.info('Falling back to cross-encoder reranker');
    
    try {
      const crossEncoderResults = await crossEncoderReranker.rerank(query, documents, {
        topK,
        minScore
      });

      let results: RerankResult[] = crossEncoderResults.map(r => ({
        documentId: r.documentId,
        content: r.content,
        originalScore: r.originalScore,
        rerankedScore: r.rerankedScore,
        relevanceScore: r.rerankedScore,
        metadata: r.metadata
      }));

      // Apply term boost after cross-encoder reranking
      if (shouldApplyTermBoost) {
        results = this.applyTermBoost(query, results);
        // Re-sort after term boost
        results.sort((a, b) => b.rerankedScore - a.rerankedScore);
      }

      logger.info('Cross-encoder reranking completed', {
        inputDocs: documents.length,
        outputDocs: results.length,
        rerankerUsed: 'cross-encoder'
      });

      return results;
    } catch (error) {
      logger.error('Cross-encoder fallback failed:', error);
      // Final fallback: return documents sorted by original score with term boost
      return this.finalFallback(query, documents, topK, minScore, shouldApplyTermBoost);
    }
  }

  /**
   * Final fallback when all reranking methods fail
   */
  private finalFallback(
    query: string,
    documents: RerankDocument[],
    topK: number,
    minScore: number,
    shouldApplyTermBoost: boolean
  ): RerankResult[] {
    logger.warn('All reranking methods failed, using original scores');
    
    let results: RerankResult[] = documents
      .sort((a, b) => b.score - a.score)
      .filter(d => d.score >= minScore)
      .slice(0, topK)
      .map(d => ({
        documentId: d.documentId,
        content: d.content,
        originalScore: d.score,
        rerankedScore: d.score,
        relevanceScore: d.score,
        metadata: d.metadata
      }));

    if (shouldApplyTermBoost) {
      results = this.applyTermBoost(query, results);
      results.sort((a, b) => b.rerankedScore - a.rerankedScore);
    }

    return results;
  }

  private getCacheKey(query: string, documents: RerankDocument[]): string {
    const docIds = documents.map(d => d.documentId).sort().join(',');
    const hash = crypto.createHash('md5')
      .update(`${query}:${docIds}`)
      .digest('hex')
      .slice(0, 16);
    return `cohere:rerank:${hash}`;
  }

  private async getFromCache(key: string): Promise<RerankResult[] | null> {
    try {
      return await redisService.get<RerankResult[]>(key);
    } catch {
      return null;
    }
  }

  private async setCache(key: string, results: RerankResult[]): Promise<void> {
    try {
      await redisService.set(key, results, this.CACHE_TTL);
    } catch {
      // Ignore cache errors
    }
  }
}

export const cohereReranker = new CohereReranker();

// Export types for testing
export type { RerankDocument, RerankResult, RerankConfig };
export { DEFAULT_RERANK_CONFIG };
