import { logger } from '../utils/logger';
import { redisService } from './RedisService';
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

export class CohereReranker {
  private apiKey: string | null = null;
  private readonly CACHE_TTL = 3600; // 1 hour
  private readonly API_URL = 'https://api.cohere.ai/v1/rerank';
  private isAvailable = false;

  constructor() {
    this.apiKey = process.env.COHERE_API_KEY || null;
    this.isAvailable = !!this.apiKey;
    
    if (this.isAvailable) {
      logger.info('✅ Cohere Reranker initialized');
    } else {
      logger.info('⚠️ Cohere API key not found - using fallback reranker');
    }
  }

  /**
   * Check if Cohere reranker is available
   */
  isEnabled(): boolean {
    return this.isAvailable;
  }

  /**
   * Rerank documents using Cohere's neural reranker
   */
  async rerank(
    query: string,
    documents: RerankDocument[],
    options: { topK?: number; minScore?: number } = {}
  ): Promise<RerankResult[]> {
    const { topK = 5, minScore = 0.3 } = options;
    const startTime = Date.now();

    if (documents.length === 0) return [];
    
    // If only a few documents, skip reranking
    if (documents.length <= topK) {
      return documents.map(d => ({
        documentId: d.documentId,
        content: d.content,
        originalScore: d.score,
        rerankedScore: d.score,
        relevanceScore: d.score,
        metadata: d.metadata
      }));
    }

    // Check cache first
    const cacheKey = this.getCacheKey(query, documents);
    const cached = await this.getFromCache(cacheKey);
    if (cached) {
      logger.debug('Cohere rerank cache hit');
      return cached;
    }

    // If Cohere not available, use fallback
    if (!this.isAvailable) {
      return this.fallbackRerank(query, documents, topK, minScore);
    }

    try {
      const response = await fetch(this.API_URL, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${this.apiKey}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          model: 'rerank-english-v3.0',
          query: query,
          documents: documents.map(d => d.content.slice(0, 4096)), // Cohere limit
          top_n: Math.min(topK * 2, documents.length), // Get more for filtering
          return_documents: false
        })
      });

      if (!response.ok) {
        const error = await response.text();
        logger.error('Cohere API error:', { status: response.status, error });
        return this.fallbackRerank(query, documents, topK, minScore);
      }

      const data = await response.json() as CohereRerankResponse;

      // Map results back to documents
      const results: RerankResult[] = data.results
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

      // Cache results
      await this.setCache(cacheKey, results);

      logger.info(`Cohere reranking completed in ${Date.now() - startTime}ms`, {
        inputDocs: documents.length,
        outputDocs: results.length,
        topScore: results[0]?.rerankedScore.toFixed(3)
      });

      return results;

    } catch (error) {
      logger.error('Cohere reranking failed:', error);
      return this.fallbackRerank(query, documents, topK, minScore);
    }
  }

  /**
   * Fallback reranking using term-based scoring
   */
  private fallbackRerank(
    query: string,
    documents: RerankDocument[],
    topK: number,
    minScore: number
  ): RerankResult[] {
    const queryTerms = this.extractTerms(query);
    
    const scored = documents.map(doc => {
      const docTerms = this.extractTerms(doc.content);
      const score = this.calculateRelevance(queryTerms, docTerms, query, doc.content);
      
      return {
        documentId: doc.documentId,
        content: doc.content,
        originalScore: doc.score,
        rerankedScore: (doc.score * 0.4) + (score * 0.6),
        relevanceScore: score,
        metadata: doc.metadata
      };
    });

    return scored
      .sort((a, b) => b.rerankedScore - a.rerankedScore)
      .filter(r => r.rerankedScore >= minScore)
      .slice(0, topK);
  }

  private extractTerms(text: string): Set<string> {
    const stopWords = new Set([
      'the', 'a', 'an', 'is', 'are', 'was', 'were', 'be', 'been', 'being',
      'have', 'has', 'had', 'do', 'does', 'did', 'will', 'would', 'could',
      'should', 'may', 'might', 'must', 'shall', 'can', 'need', 'to', 'of',
      'in', 'for', 'on', 'with', 'at', 'by', 'from', 'as', 'into', 'through',
      'and', 'but', 'or', 'nor', 'so', 'yet', 'both', 'either', 'neither',
      'not', 'only', 'own', 'same', 'than', 'too', 'very', 'just', 'also'
    ]);
    
    return new Set(
      text
        .toLowerCase()
        .replace(/[^\w\s]/g, ' ')
        .split(/\s+/)
        .filter(word => word.length > 2 && !stopWords.has(word))
    );
  }

  private calculateRelevance(
    queryTerms: Set<string>,
    docTerms: Set<string>,
    query: string,
    content: string
  ): number {
    if (queryTerms.size === 0) return 0;

    // Term overlap
    let matches = 0;
    for (const term of queryTerms) {
      if (docTerms.has(term)) matches++;
    }
    const overlapScore = matches / queryTerms.size;

    // Exact phrase matching
    const queryLower = query.toLowerCase();
    const contentLower = content.toLowerCase();
    const phraseScore = contentLower.includes(queryLower) ? 0.3 : 0;

    // Position score (earlier is better)
    let positionScore = 0;
    for (const term of queryTerms) {
      const pos = contentLower.indexOf(term);
      if (pos !== -1) {
        positionScore += 1 - (pos / contentLower.length);
      }
    }
    positionScore = queryTerms.size > 0 ? positionScore / queryTerms.size : 0;

    return (overlapScore * 0.5) + (phraseScore) + (positionScore * 0.2);
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
