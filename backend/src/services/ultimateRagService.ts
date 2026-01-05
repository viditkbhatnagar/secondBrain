import { multiQueryRetriever } from './multiQueryRetriever';
import { cohereReranker } from './cohereReranker';
import { contextualCompressor } from './contextualCompressor';
import { parallelEmbeddings } from './parallelEmbeddings';
import { aggressiveCache } from './aggressiveCache';
import { fastStreaming } from './fastStreaming';
import { atlasVectorSearch } from './atlasVectorSearch';
import { feedbackService } from './feedbackService';
import { logger } from '../utils/logger';
import { OpenAI } from 'openai';
import { Response } from 'express';
import * as crypto from 'crypto';

interface RAGConfig {
  maxSources: number;
  minConfidence: number;
  enableHyDE: boolean;
  enableCompression: boolean;
  enableReranking: boolean;
  enableQueryDecomposition: boolean;
  enableAdaptiveRetrieval: boolean;
  model: string;
  streaming: boolean;
}

interface RAGResult {
  queryId: string;
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
  metrics: {
    retrievalTime: number;
    rerankingTime: number;
    generationTime: number;
    cacheHit: boolean;
    queryType?: string;
    rerankerUsed: string;
    vectorSearchUsed: string;
  };
}

const DEFAULT_CONFIG: RAGConfig = {
  maxSources: 5,
  minConfidence: 0.4,
  enableHyDE: true,
  enableCompression: true,
  enableReranking: true,
  enableQueryDecomposition: true,
  enableAdaptiveRetrieval: true,
  model: 'gpt-4-turbo-preview',
  streaming: false
};

export class UltimateRAGService {
  private openai: OpenAI | null = null;

  private getOpenAI(): OpenAI {
    if (!this.openai) {
      this.openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
    }
    return this.openai;
  }

  /**
   * Main query method - Ultimate RAG Pipeline
   */
  async query(
    query: string,
    config: Partial<RAGConfig> = {}
  ): Promise<RAGResult> {
    let cfg = { ...DEFAULT_CONFIG, ...config };
    const startTime = Date.now();
    const queryId = this.generateQueryId(query);
    
    const metrics = {
      retrievalTime: 0,
      rerankingTime: 0,
      generationTime: 0,
      cacheHit: false,
      queryType: 'simple',
      rerankerUsed: 'none',
      vectorSearchUsed: 'fallback'
    };

    try {
      // Step 0: Check cache
      const cached = await aggressiveCache.getRAGResponse(query);
      if (cached) {
        logger.info(`Cache hit for query: ${query.slice(0, 50)}`);
        return {
          ...cached,
          queryId,
          cached: true,
          responseTime: Date.now() - startTime,
          metrics: { ...metrics, cacheHit: true }
        };
      }

      // Step 0.5: Adaptive retrieval based on feedback
      if (cfg.enableAdaptiveRetrieval) {
        const shouldEnhance = await feedbackService.shouldUseEnhancedRetrieval(query);
        if (shouldEnhance) {
          logger.info('Using enhanced retrieval based on feedback history');
          cfg = {
            ...cfg,
            maxSources: Math.min(cfg.maxSources + 2, 10),
            enableHyDE: true,
            enableQueryDecomposition: true
          };
        }
      }

      // Step 1: Query decomposition + HyDE (parallel)
      const retrievalStart = Date.now();
      
      const [decomposed, hypotheticalAnswer] = await Promise.all([
        cfg.enableQueryDecomposition 
          ? multiQueryRetriever.decomposeQuery(query)
          : Promise.resolve({ original: query, subQueries: [query], queryType: 'simple' as const, entities: [] }),
        cfg.enableHyDE 
          ? multiQueryRetriever.generateHypotheticalAnswer(query) 
          : Promise.resolve(null)
      ]);

      metrics.queryType = decomposed.queryType;

      // Step 2: Build search queries
      const allQueries = hypotheticalAnswer 
        ? [query, hypotheticalAnswer, ...decomposed.subQueries]
        : [query, ...decomposed.subQueries];
      
      const uniqueQueries = [...new Set(allQueries)];

      // Step 3: Vector search using Atlas or fallback
      let searchResults;
      if (atlasVectorSearch.isEnabled()) {
        metrics.vectorSearchUsed = 'atlas';
        searchResults = await atlasVectorSearch.multiSearch(uniqueQueries, {
          limit: cfg.maxSources * 3,
          minScore: cfg.minConfidence * 0.8
        });
      } else {
        metrics.vectorSearchUsed = 'fallback';
        const embeddings = await parallelEmbeddings.getEmbeddings(uniqueQueries);
        searchResults = await this.parallelVectorSearch(embeddings, cfg.maxSources * 3);
      }
      
      // Deduplicate results
      const uniqueResults = this.deduplicateResults(searchResults);
      
      metrics.retrievalTime = Date.now() - retrievalStart;

      // Step 4: Neural reranking with Cohere (or fallback)
      let rerankedResults = uniqueResults;
      if (cfg.enableReranking && uniqueResults.length > cfg.maxSources) {
        const rerankStart = Date.now();
        
        const docsForRerank = uniqueResults.map(r => ({
          documentId: r.documentId,
          content: r.content,
          score: r.score,
          metadata: r.metadata
        }));

        const reranked = await cohereReranker.rerank(query, docsForRerank, {
          topK: cfg.maxSources,
          minScore: cfg.minConfidence
        });

        rerankedResults = reranked.map(r => ({
          ...r,
          score: r.rerankedScore,
          metadata: r.metadata
        }));

        metrics.rerankerUsed = cohereReranker.isEnabled() ? 'cohere' : 'fallback';
        metrics.rerankingTime = Date.now() - rerankStart;
      }

      // Step 5: Compress contexts if enabled
      let finalSources = rerankedResults;
      if (cfg.enableCompression && rerankedResults.length > 0) {
        const compressed = await contextualCompressor.compressContexts(
          query,
          rerankedResults.map(r => r.content)
        );
        
        finalSources = rerankedResults.map((result, index) => ({
          ...result,
          content: compressed[index]?.compressed || result.content
        }));
      }

      // Step 6: Generate answer with GPT-4
      const generationStart = Date.now();
      const answer = await this.generateAnswer(query, finalSources, cfg.model);
      metrics.generationTime = Date.now() - generationStart;

      // Calculate confidence
      const confidence = this.calculateConfidence(finalSources, answer);

      const result: RAGResult = {
        queryId,
        answer,
        sources: finalSources.slice(0, cfg.maxSources).map(s => ({
          documentId: s.documentId,
          documentName: s.metadata?.name || s.metadata?.documentName || 'Unknown',
          content: s.content,
          relevanceScore: s.rerankedScore || s.score
        })),
        confidence,
        responseTime: Date.now() - startTime,
        cached: false,
        metrics
      };

      // Cache if confidence is high enough
      if (confidence > 0.6) {
        await aggressiveCache.cacheRAGResponse(query, result);
      }

      logger.info(`Ultimate RAG query completed`, {
        query: query.slice(0, 50),
        responseTime: result.responseTime,
        confidence,
        sourceCount: result.sources.length,
        ...metrics
      });

      return result;

    } catch (error) {
      logger.error('RAG query failed:', error);
      throw error;
    }
  }

  /**
   * Streaming query method with immediate source delivery
   */
  async streamQuery(
    res: Response,
    query: string,
    config: Partial<RAGConfig> = {}
  ): Promise<void> {
    const cfg = { ...DEFAULT_CONFIG, ...config };
    const queryId = this.generateQueryId(query);

    try {
      // Quick retrieval using Atlas Vector Search
      let results;
      if (atlasVectorSearch.isEnabled()) {
        results = await atlasVectorSearch.search(query, {
          limit: cfg.maxSources * 2,
          minScore: cfg.minConfidence
        });
      } else {
        const embedding = await parallelEmbeddings.getEmbedding(query);
        results = await this.vectorSearch(embedding, cfg.maxSources * 2);
      }

      // Quick rerank
      const docsForRerank = results.map(r => ({
        documentId: r.documentId,
        content: r.content,
        score: r.score,
        metadata: r.metadata
      }));

      const reranked = await cohereReranker.rerank(query, docsForRerank, {
        topK: cfg.maxSources
      });

      const sources = reranked.map(r => ({
        documentName: r.metadata?.name || r.metadata?.documentName || 'Unknown',
        content: r.content,
        score: r.rerankedScore
      }));

      // Stream response with queryId
      res.setHeader('X-Query-ID', queryId);
      await fastStreaming.streamRAGResponse(res, query, sources, { model: cfg.model });

    } catch (error) {
      logger.error('Streaming RAG failed:', error);
      res.write(`data: ${JSON.stringify({ type: 'error', data: { message: 'Query failed' } })}\n\n`);
      res.end();
    }
  }

  /**
   * Record user feedback for continuous improvement
   */
  async recordFeedback(
    queryId: string,
    query: string,
    answer: string,
    rating: 'positive' | 'negative',
    feedback?: string,
    sourceIds?: string[],
    confidence?: number,
    responseTime?: number
  ): Promise<boolean> {
    return feedbackService.recordFeedback({
      queryId,
      query,
      answer,
      rating,
      feedback,
      sourceIds: sourceIds || [],
      confidence: confidence || 0,
      responseTime: responseTime || 0
    });
  }

  /**
   * Get feedback statistics
   */
  async getFeedbackStats(days: number = 30): Promise<{
    total: number;
    positive: number;
    negative: number;
    positiveRate: number;
    avgConfidencePositive: number;
    avgConfidenceNegative: number;
    commonIssues: string[];
  }> {
    return feedbackService.getStats(days);
  }

  private async parallelVectorSearch(
    embeddings: number[][],
    limit: number
  ): Promise<any[]> {
    const results = await Promise.all(
      embeddings.map(emb => this.vectorSearch(emb, limit))
    );
    
    return results.flat();
  }

  private async vectorSearch(embedding: number[], limit: number): Promise<any[]> {
    // Use Atlas Vector Search if available
    if (atlasVectorSearch.isEnabled()) {
      // This path shouldn't be hit if we're using multiSearch above
      // but keeping as fallback
      return [];
    }

    // Fallback to in-memory search
    const { DocumentChunkModel } = await import('../models/index');
    const allChunks = await DocumentChunkModel.find({}).lean();
    
    const similarities: Array<{ chunk: any; score: number }> = [];
    
    for (const chunk of allChunks) {
      if (!chunk.embedding || chunk.embedding.length === 0) continue;
      
      const score = parallelEmbeddings.cosineSimilarity(embedding, chunk.embedding as number[]);
      if (score >= 0.35) {
        similarities.push({ chunk, score });
      }
    }
    
    similarities.sort((a, b) => b.score - a.score);
    
    return similarities.slice(0, limit).map(s => ({
      documentId: s.chunk.documentId,
      content: s.chunk.content,
      score: s.score,
      metadata: {
        name: s.chunk.documentName,
        documentName: s.chunk.documentName,
        chunkIndex: s.chunk.chunkIndex
      }
    }));
  }

  private deduplicateResults(results: any[]): any[] {
    const seen = new Map<string, any>();
    
    for (const result of results) {
      const key = result.chunkId || (result.documentId?.toString() + ':' + result.content.slice(0, 100));
      const existing = seen.get(key);
      
      if (!existing || result.score > existing.score) {
        seen.set(key, result);
      }
    }
    
    return Array.from(seen.values());
  }

  private async generateAnswer(
    query: string,
    sources: any[],
    model: string
  ): Promise<string> {
    if (sources.length === 0) {
      return "I couldn't find relevant information in your documents to answer this question. Please try rephrasing or upload relevant documents.";
    }

    const sourcesText = sources
      .map((s, i) => `[Source ${i + 1}: ${s.metadata?.name || s.metadata?.documentName || 'Document'}]\n${s.content}`)
      .join('\n\n---\n\n');

    const response = await this.getOpenAI().chat.completions.create({
      model,
      messages: [
        {
          role: 'system',
          content: `You are a highly accurate assistant that answers questions based ONLY on the provided sources. Your primary goal is COMPLETENESS and ACCURACY.

CRITICAL RULES FOR COMPLETENESS (Requirements 4.3, 4.4):
1. Extract and include ALL relevant details from the sources - do not summarize away important information
2. When the question asks for specific information, provide EVERY detail found in the sources
3. For lists and enumerations: Include ALL items mentioned in the sources, not just a subset
4. If sources contain numbered lists, bullet points, or step-by-step instructions, preserve the COMPLETE structure
5. When multiple sources contain complementary information, synthesize ALL of it into your answer
6. Prioritize ACCURACY and COMPLETENESS over brevity - users need comprehensive answers

CRITICAL RULES FOR ACCURACY:
1. ONLY use information explicitly stated in the sources
2. ALWAYS cite sources using [Source N] format for every claim
3. If sources don't contain the answer, clearly state "Based on the available sources, I cannot find information about..."
4. NEVER make up or infer information not in the sources
5. If sources partially answer the question, acknowledge what's missing

SPECIAL INSTRUCTIONS FOR LISTS AND ENUMERATIONS:
- If the question asks "what are the..." or "list all..." or "how many...", ensure you include EVERY item from the sources
- Count items carefully - if a source lists 5 items, your answer must include all 5
- For numbered steps or procedures, include ALL steps in order
- If items span multiple sources, combine them into a complete list
- Explicitly state the total count when listing items (e.g., "There are 5 key points:")

FORMATTING GUIDELINES:
- Structure your answer clearly using bullet points or numbered lists when appropriate
- Use headings or sections for complex multi-part answers
- Double-check that you haven't omitted any important details before finalizing

Your accuracy and completeness are paramount. Users trust your citations and rely on comprehensive answers.`
        },
        {
          role: 'user',
          content: `SOURCES:\n${sourcesText}\n\nQUESTION: ${query}\n\nProvide a comprehensive, well-cited answer that includes ALL relevant details from the sources:`
        }
      ],
      temperature: 0.3, // Lower temperature for more accurate responses
      max_tokens: 1500
    });

    return response.choices[0]?.message?.content || '';
  }

  private calculateConfidence(sources: any[], answer: string): number {
    if (sources.length === 0) return 0;

    // Base confidence from source scores
    const avgSourceScore = sources.reduce((sum, s) => sum + (s.rerankedScore || s.score || 0), 0) / sources.length;
    
    // Citation bonus
    const citationCount = (answer.match(/\[Source \d+\]/g) || []).length;
    const citationBonus = Math.min(citationCount / sources.length, 1) * 0.15;
    
    // Source diversity bonus (multiple documents)
    const uniqueDocs = new Set(sources.map(s => s.documentId)).size;
    const diversityBonus = Math.min(uniqueDocs / sources.length, 1) * 0.1;
    
    // Penalty for uncertainty phrases
    const uncertaintyPhrases = ["i don't know", 'not sure', 'unclear', "couldn't find", 'no information', 'cannot find'];
    const hasUncertainty = uncertaintyPhrases.some(phrase => answer.toLowerCase().includes(phrase));
    const uncertaintyPenalty = hasUncertainty ? 0.25 : 0;
    
    // Length penalty (very short answers might be incomplete)
    const lengthPenalty = answer.length < 100 ? 0.1 : 0;
    
    return Math.max(0, Math.min(1, avgSourceScore + citationBonus + diversityBonus - uncertaintyPenalty - lengthPenalty));
  }

  private generateQueryId(query: string): string {
    const timestamp = Date.now().toString(36);
    const hash = crypto.createHash('md5').update(query).digest('hex').slice(0, 8);
    return `q_${timestamp}_${hash}`;
  }

  /**
   * Get cache statistics
   */
  getCacheStats() {
    return aggressiveCache.getStats();
  }

  /**
   * Get system status
   */
  getSystemStatus() {
    return {
      cohereReranker: cohereReranker.isEnabled() ? 'enabled' : 'fallback',
      atlasVectorSearch: atlasVectorSearch.isEnabled() ? 'enabled' : 'fallback',
      cache: aggressiveCache.getStats()
    };
  }
}

export const ultimateRagService = new UltimateRAGService();
