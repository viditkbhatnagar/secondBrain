import { GptService, RelevantChunk } from './GptService';
import { VectorService } from './VectorService';
import { HybridSearchService } from './hybridSearch';
import { blazingCache, CacheStats } from './blazingCache';
import { logger } from '../utils/logger';

/**
 * Optimized RAG service with hybrid search + caching
 * 
 * Features:
 * 1. Multi-level caching (hot/cold/Redis) for instant repeat queries
 * 2. Hybrid search (vector + keyword) with RRF fusion
 * 3. Optional reranking for maximum accuracy
 * 4. Full context with high token limits
 * 5. GPT-5 with 16K output tokens for comprehensive answers
 * 
 * Performance:
 * - Cached queries: <100ms (instant)
 * - Uncached: ~20-25s (full accuracy)
 */

interface UltraFastOptions {
  maxSources?: number;
  useCache?: boolean;
  skipRerank?: boolean;
  minConfidence?: number;
}

interface FastRAGResponse {
  answer: string;
  sources: Array<{
    documentId: string;
    documentName: string;
    content: string;
    relevanceScore: number;
  }>;
  confidence: number;
  responseTime: number;
  cached: boolean;
  metadata: {
    fromCache: boolean;
    cacheLayer?: 'hot' | 'memory' | 'redis' | 'none';
    searchTime?: number;
    llmTime?: number;
  };
}

export class UltraFastRAGService {
  /**
   * BLAZING FAST search - optimized for speed
   * Target: < 2 seconds for all queries
   */
  async query(
    query: string,
    options: UltraFastOptions = {}
  ): Promise<FastRAGResponse> {
    const startTime = Date.now();
    const {
      maxSources = 6, // Increased for comprehensive answers
      useCache = true,
      skipRerank = false, // Enable reranking for accuracy
      minConfidence = 0.7 // Higher threshold for quality
    } = options;

    try {
      // FAST PATH: Check complete response cache first
      if (useCache) {
        const cached = await blazingCache.getRAGResponse(query);
        if (cached) {
          logger.info(`🚀 BLAZING cache hit for: ${query.slice(0, 50)}`);
          return {
            ...cached,
            responseTime: Date.now() - startTime,
            cached: true,
            metadata: {
              ...cached.metadata,
              fromCache: true,
              cacheLayer: 'hot'
            }
          };
        }
      }

      // HYBRID SEARCH with reranking for maximum accuracy
      const searchStart = Date.now();
      
      // Use hybrid search (vector + keyword) for best accuracy
      const hybridService = new HybridSearchService();
      const searchResults = await hybridService.search(query, {
        limit: maxSources * 6, // Get 6x candidates for comprehensive results
        semanticWeight: 0.6, // Balanced semantic search
        keywordWeight: 0.4, // Balanced keyword search
        rerank: !skipRerank, // Enable reranking unless explicitly skipped
        minScore: minConfidence * 0.75 // Lower threshold for better recall
      });
      
      const searchTime = Date.now() - searchStart;

      logger.debug('Search results', { 
        count: searchResults.length,
        firstScore: searchResults[0]?.score,
        hasScores: searchResults.every(r => typeof r.score === 'number')
      });

      if (searchResults.length === 0) {
        // Return fast "no results" response
        const noResultsResponse: FastRAGResponse = {
          answer: "I couldn't find relevant information in your documents. Try rephrasing your question or uploading more documents.",
          sources: [],
          confidence: 0,
          responseTime: Date.now() - startTime,
          cached: false,
          metadata: {
            fromCache: false,
            cacheLayer: 'none',
            searchTime
          }
        };
        
        // Cache the no-results response briefly
        await blazingCache.cacheRAGResponse(query, noResultsResponse, 300); // 5 min
        
        return noResultsResponse;
      }

      // Take top N sources and convert to RelevantChunk format
      const topSources: RelevantChunk[] = searchResults.slice(0, maxSources).map(result => ({
        documentId: result.documentId,
        documentName: result.documentName,
        content: result.content,
        similarity: result.score || 0.75, // Map score to similarity, default if missing
        chunkIndex: 0,
        chunkId: result.chunkId,
        metadata: result.metadata
      }));

      // Build sources array with proper relevance scores
      const sources = topSources.map((chunk: RelevantChunk, index: number) => ({
        documentId: chunk.documentId,
        documentName: chunk.documentName,
        content: chunk.content,
        relevanceScore: chunk.similarity || (0.95 - (index * 0.05)) // Ensure valid score
      }));

      // Generate answer with full context (maximum accuracy)
      const llmStart = Date.now();
      const answer = await this.generateFastAnswer(query, topSources);
      const llmTime = Date.now() - llmStart;

      // Calculate confidence
      const confidence = this.calculateConfidence(topSources);

      const response: FastRAGResponse = {
        answer,
        sources,
        confidence,
        responseTime: Date.now() - startTime,
        cached: false,
        metadata: {
          fromCache: false,
          cacheLayer: 'none',
          searchTime,
          llmTime
        }
      };

      // Cache the complete response aggressively
      if (useCache && confidence > 50) {
        const cacheTTL = confidence > 80 ? 7200 : 3600; // 2h for high confidence, 1h for medium
        await blazingCache.cacheRAGResponse(query, response, cacheTTL);
      }

      logger.info(`🚀 Ultra-fast RAG completed in ${response.responseTime}ms`, {
        searchTime,
        llmTime,
        sources: sources.length,
        confidence
      });

      return response;

    } catch (error: any) {
      logger.error('Ultra-fast RAG failed:', error);
      throw error;
    }
  }

  /**
   * Generate answer with minimal, fast prompt
   */
  private async generateFastAnswer(
    query: string,
    chunks: RelevantChunk[]
  ): Promise<string> {
    // Build full context - no truncation for maximum accuracy
    const context = chunks
      .map((chunk, idx) => `[Source ${idx + 1}] ${chunk.content}`)
      .join('\n\n');

    try {
      const openai = new (await import('openai')).default({
        apiKey: process.env.OPENAI_API_KEY
      });

      const userMessage = `Context:\n${context}\n\nQuestion: ${query}\n\nProvide a clear, concise answer based on the context above.`;
      
      logger.debug('GPT-5 Request', { 
        contextLength: context.length, 
        query: query.substring(0, 100),
        chunksCount: chunks.length 
      });

      const response = await openai.chat.completions.create({
        model: 'gpt-5',
        messages: [
          { 
            role: 'system', 
            content: 'You are an expert assistant. Provide comprehensive, accurate answers based on ALL information in the provided context. List ALL relevant details, names, and items - do not omit anything. Be thorough and complete.' 
          },
          { 
            role: 'user', 
            content: userMessage
          }
        ],
        max_completion_tokens: 16000, // Very high limit for complete, detailed answers
        // Note: GPT-5 only supports default temperature (1)
      });

      const answer = response.choices[0]?.message?.content?.trim() || 'Unable to generate answer.';
      
      logger.debug('GPT-5 Response', { 
        answer: answer.substring(0, 200),
        finishReason: response.choices[0]?.finish_reason 
      });

      return answer;
    } catch (error: any) {
      logger.error('Fast answer generation failed:', error);
      throw new Error('Failed to generate answer');
    }
  }

  /**
   * Fast confidence calculation
   */
  private calculateConfidence(chunks: RelevantChunk[]): number {
    if (chunks.length === 0) return 0;

    const topSimilarity = chunks[0]?.similarity || 0;
    const avgSimilarity = chunks.reduce((sum, c) => sum + c.similarity, 0) / chunks.length;

    // Simple weighted average
    const confidence = (topSimilarity * 0.7 + avgSimilarity * 0.3) * 100;

    return Math.min(Math.round(confidence), 95);
  }

  /**
   * Batch pre-compute and cache embeddings for common queries
   */
  async prewarmCommonQueries(queries: string[]): Promise<void> {
    logger.info(`Pre-warming ${queries.length} common queries...`);

    for (const query of queries) {
      try {
        // Generate and cache embedding
        const embedding = await GptService.generateEmbedding(query);
        await blazingCache.cacheEmbedding(query, embedding);

        // Generate and cache full response
        const response = await this.query(query, { useCache: false });
        await blazingCache.set('rag-complete', query, response, { ttl: 86400, hot: true });

        logger.debug(`Pre-warmed: ${query.slice(0, 50)}`);
      } catch (error) {
        logger.warn(`Failed to pre-warm query: ${query.slice(0, 50)}`, error);
      }
    }

    logger.info('Pre-warming complete');
  }

  /**
   * Get cache statistics
   */
  getCacheStats() {
    return blazingCache.getStats();
  }

  /**
   * Invalidate all caches (call when documents change)
   */
  async invalidateCache(): Promise<void> {
    await blazingCache.invalidateAll();
    logger.info('Ultra-fast RAG cache invalidated');
  }
}

export const ultraFastRAG = new UltraFastRAGService();

