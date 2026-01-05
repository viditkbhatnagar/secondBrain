import { hybridSearchService } from './hybridSearch';
import { queryProcessor } from './queryProcessor';
import { cacheService } from './cacheService';
import { promptService } from './promptService';
import { responseValidator } from './responseValidator';
import { streamingService } from './streamingService';
import { analyticsService } from './AnalyticsService';
import { metricsService } from './metricsService';
import { logger } from '../utils/logger';
import { OpenAI } from 'openai';
import { Response } from 'express';

interface RAGOptions {
  streaming?: boolean;
  maxSources?: number;
  minConfidence?: number;
  useCache?: boolean;
  validateResponse?: boolean;
  model?: string;
}

interface RAGResponse {
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
  validationResult?: any;
}

export class OptimizedRAGService {
  private openai: OpenAI | null = null;

  private getOpenAI(): OpenAI {
    if (!this.openai) {
      this.openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
    }
    return this.openai;
  }

  // Main RAG method
  async query(
    query: string,
    sessionId: string,
    options: RAGOptions = {}
  ): Promise<RAGResponse> {
    const startTime = Date.now();
    const {
      maxSources = 5,
      minConfidence = 0.5,
      useCache = true,
      validateResponse = true,
      model = 'gpt-5'
    } = options;

    try {
      // 1. Check cache first
      if (useCache) {
        const cached = await cacheService.get<RAGResponse>('rag', query);
        if (cached) {
          logger.info(`RAG cache hit for: ${query.slice(0, 50)}`);
          metricsService.increment('rag.cache.hit');
          return { ...cached, cached: true, responseTime: Date.now() - startTime };
        }
        metricsService.increment('rag.cache.miss');
      }

      // 2. Process query (parallel with search)
      const [processedQuery, searchResults] = await Promise.all([
        queryProcessor.processQuery(query),
        hybridSearchService.search(query, { limit: maxSources * 2, minScore: minConfidence })
      ]);

      metricsService.timing('rag.search', Date.now() - startTime);

      // 3. Filter and prepare sources
      const sources = searchResults
        .slice(0, maxSources)
        .map(r => ({
          documentId: r.documentId,
          documentName: r.documentName,
          content: r.content,
          relevanceScore: r.score
        }));

      // 4. Generate response
      let answer: string;
      let confidence: number;

      if (sources.length === 0) {
        // No sources found
        answer = await this.generateNoSourcesResponse(query);
        confidence = 0;
      } else {
        // Build prompt and generate
        const prompt = promptService.buildRAGPrompt({
          query,
          sources
        });

        const llmStartTime = Date.now();
        answer = await this.generateResponse(prompt, model);
        metricsService.timing('rag.llm', Date.now() - llmStartTime);
        
        // 5. Validate response (optional)
        if (validateResponse) {
          const validation = await responseValidator.validateResponse(
            query,
            answer,
            sources.map(s => s.content)
          );
          confidence = validation.confidence;

          // If validation fails, regenerate with stricter prompt
          if (!validation.isValid && validation.hallucinations.length > 0) {
            logger.warn('Response validation failed, regenerating');
            answer = await this.regenerateWithStricterPrompt(query, sources);
            confidence = validation.confidence * 0.8; // Lower confidence for regenerated
          }
        } else {
          confidence = this.calculateBasicConfidence(sources);
        }
      }

      const response: RAGResponse = {
        answer,
        sources,
        confidence,
        responseTime: Date.now() - startTime,
        cached: false
      };

      // 6. Cache successful response
      if (useCache && confidence > 0.6) {
        await cacheService.set('rag', query, response, { ttl: 1800 }); // 30 min
      }

      // 7. Track analytics
      analyticsService.trackEvent('search', sessionId, {
        query,
        responseTime: response.responseTime,
        confidence,
        searchResultCount: sources.length
      });

      metricsService.timing('rag.total', Date.now() - startTime);

      return response;

    } catch (error) {
      logger.error('RAG query failed:', error);
      metricsService.increment('rag.error');
      throw error;
    }
  }

  // Streaming RAG response
  async streamQuery(
    res: Response,
    query: string,
    sessionId: string,
    options: RAGOptions = {}
  ): Promise<void> {
    const startTime = Date.now();
    const { maxSources = 5, minConfidence = 0.5, model = 'gpt-5' } = options;

    try {
      // Get sources first
      const searchResults = await hybridSearchService.search(query, {
        limit: maxSources,
        minScore: minConfidence
      });

      const sources = searchResults.map(r => ({
        content: r.content,
        documentName: r.documentName,
        score: r.score
      }));

      // Stream response with sources
      await streamingService.streamWithSources(res, query, sources, { model });

      // Track analytics
      analyticsService.trackEvent('search', sessionId, {
        query,
        responseTime: Date.now() - startTime,
        searchResultCount: sources.length,
        streaming: true
      });

    } catch (error) {
      logger.error('Streaming RAG failed:', error);
      res.write(`data: ${JSON.stringify({ type: 'error', message: 'Query failed' })}\n\n`);
      res.end();
    }
  }

  private async generateResponse(prompt: string, model: string): Promise<string> {
    const response = await this.getOpenAI().chat.completions.create({
      model,
      messages: [{ role: 'user', content: prompt }],
      temperature: 1,
      max_completion_tokens: 12000
    });

    return response.choices[0]?.message?.content || '';
  }

  private async generateNoSourcesResponse(query: string): Promise<string> {
    const prompt = promptService.buildNoSourcesPrompt(query);
    return this.generateResponse(prompt, 'gpt-5');
  }

  private async regenerateWithStricterPrompt(
    query: string,
    sources: any[]
  ): Promise<string> {
    const strictPrompt = `IMPORTANT: Only use information DIRECTLY stated in these sources. Do not add any information not explicitly present.

${sources.map((s, i) => `[Source ${i + 1}]: ${s.content}`).join('\n\n')}

Question: ${query}

Answer using ONLY the information above. If something isn't mentioned, don't include it:`;

    return this.generateResponse(strictPrompt, 'gpt-5');
  }

  private calculateBasicConfidence(sources: any[]): number {
    if (sources.length === 0) return 0;
    const avgScore = sources.reduce((sum, s) => sum + s.relevanceScore, 0) / sources.length;
    return Math.min(avgScore + 0.1, 1);
  }
}

export const optimizedRagService = new OptimizedRAGService();
