import express from 'express';
import { VectorService } from '../services/VectorService';
import { GptService } from '../services/GptService';
import { DatabaseService } from '../services/DatabaseService';
import { AgentService } from '../services/AgentService';
import { analyticsService } from '../services/AnalyticsService';
import { optimizedRagService } from '../services/optimizedRagService';
import { OpenAIService } from '../services/OpenAIService';
import { Request, Response } from 'express';
import { aiLimiter, aiSpeedLimiter, searchLimiter } from '../middleware/rateLimiter';
import { validateBody } from '../middleware/validate';
import { searchSchema, agentSearchSchema, relatedQuestionsSchema, optimizedSearchSchema } from '../validation/schemas';
import { logger } from '../utils/logger';
import { SearchCache } from '../utils/cache';
import { aggressiveCache } from '../services/aggressiveCache';
import { z } from 'zod';

export const searchRouter = express.Router();

// Apply search rate limiting to all search routes
searchRouter.use(searchLimiter);

/**
 * @swagger
 * /search/optimized:
 *   post:
 *     summary: Optimized RAG search with streaming support
 *     description: High-performance search with hybrid retrieval, caching, and optional streaming
 *     tags: [Search]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - query
 *             properties:
 *               query:
 *                 type: string
 *                 minLength: 1
 *                 maxLength: 1000
 *               streaming:
 *                 type: boolean
 *                 default: false
 *               maxSources:
 *                 type: number
 *                 minimum: 1
 *                 maximum: 20
 *                 default: 5
 *               minConfidence:
 *                 type: number
 *                 minimum: 0
 *                 maximum: 1
 *                 default: 0.5
 *               model:
 *                 type: string
 *                 enum: [gpt-5]
 *                 default: gpt-5
 *     responses:
 *       200:
 *         description: Search results with AI answer
 *       400:
 *         description: Validation error
 *       429:
 *         description: Rate limit exceeded
 */
searchRouter.post('/optimized', aiLimiter, async (req: Request, res: Response) => {
  const startTime = Date.now();
  
  // Inline validation schema
  const schema = z.object({
    query: z.string().min(1).max(1000),
    streaming: z.boolean().optional().default(false),
    maxSources: z.number().min(1).max(20).optional().default(5),
    minConfidence: z.number().min(0).max(1).optional().default(0.5),
    model: z.enum(['gpt-5']).optional().default('gpt-5')
  });

  try {
    const validated = schema.parse(req.body);
    const sessionId = req.headers['x-session-id'] as string || req.ip || 'anonymous';

    if (validated.streaming) {
      // Streaming response
      return optimizedRagService.streamQuery(res, validated.query, sessionId, {
        maxSources: validated.maxSources,
        minConfidence: validated.minConfidence,
        model: validated.model
      });
    }

    // Regular response
    const result = await optimizedRagService.query(validated.query, sessionId, {
      maxSources: validated.maxSources,
      minConfidence: validated.minConfidence,
      model: validated.model
    });

    res.json({
      success: true,
      data: result,
      meta: {
        processingTime: Date.now() - startTime,
        cached: result.cached
      }
    });

  } catch (error: any) {
    if (error.name === 'ZodError') {
      return res.status(400).json({
        error: 'Validation Error',
        message: 'Invalid request parameters',
        details: error.errors
      });
    }
    
    logger.error('Optimized search error:', { error: error.message, requestId: req.requestId });
    res.status(500).json({
      error: 'Search Failed',
      message: error.message || 'An unexpected error occurred',
      code: 'OPTIMIZED_SEARCH_ERROR'
    });
  }
});

/**
 * @swagger
 * /search/quick:
 *   get:
 *     summary: Quick search with lower latency
 *     description: Fast search with fewer sources and no response validation
 *     tags: [Search]
 *     parameters:
 *       - in: query
 *         name: q
 *         required: true
 *         schema:
 *           type: string
 *         description: Search query
 *     responses:
 *       200:
 *         description: Quick search results
 *       400:
 *         description: Query required
 */
searchRouter.get('/quick', async (req: Request, res: Response) => {
  const query = req.query.q as string;
  const sessionId = req.headers['x-session-id'] as string || req.ip || 'anonymous';

  if (!query) {
    return res.status(400).json({ error: 'Query required' });
  }

  try {
    const result = await optimizedRagService.query(query, sessionId, {
      maxSources: 3,
      validateResponse: false,
      model: 'gpt-5'
    });

    res.json(result);
  } catch (error: any) {
    logger.error('Quick search error:', { error: error.message });
    res.status(500).json({ error: 'Search failed', message: error.message });
  }
});

/**
 * @swagger
 * /search:
 *   post:
 *     summary: Search documents with AI
 *     description: Performs semantic search across all documents and returns AI-generated answer
 *     tags: [Search]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/SearchRequest'
 *     responses:
 *       200:
 *         description: Search results with AI answer
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/SearchResult'
 *       400:
 *         description: Validation error
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 *       404:
 *         description: No documents available
 *       429:
 *         description: Rate limit exceeded
 *       500:
 *         description: Server error
 */
searchRouter.post('/', validateBody(searchSchema), async (req, res) => {
  try {
    const { query, strategy, rerank } = req.body;
    const effectiveStrategy = strategy === 'hybrid' ? 'hybrid' : 'vector';

    logger.info(`Processing search query: "${query.substring(0, 50)}..."`, { requestId: req.requestId });

    // Check cache first
    const cacheKey = `${query}:${effectiveStrategy}:${rerank !== false}`;
    const cachedResult = await SearchCache.get(query, cacheKey);
    if (cachedResult) {
      logger.debug('Search cache hit', { requestId: req.requestId });
      res.setHeader('X-Cache', 'HIT');
      return res.json(cachedResult);
    }

    // Check if any documents exist
    const documentStats = await VectorService.getDocumentStats();
    if (documentStats.length === 0) {
      return res.status(404).json({
        error: 'No Documents Available',
        message: 'Please upload some documents first before searching.',
        code: 'NO_DOCUMENTS'
      });
    }

    // Find relevant document chunks based on strategy
    // IMPROVED: Higher thresholds for better precision
    const relevantChunks = effectiveStrategy === 'hybrid'
      ? await VectorService.searchSimilarHybrid(query, { limit: 5, minSimilarity: 0.45, alpha: 0.55, rerank: rerank !== false })
      : await VectorService.searchSimilar(query, 5, 0.45);

    if (relevantChunks.length === 0) {
      // Try OpenAI for general knowledge answer
      if (OpenAIService.isConfigured()) {
        try {
          logger.info('No documents found, falling back to OpenAI for general knowledge', { requestId: req.requestId });
          const openAIResult = await OpenAIService.generateGeneralAnswer(query);
          
          const response = {
            answer: openAIResult.answer,
            relevantChunks: [],
            confidence: 70,
            sources: [],
            isGeneralKnowledge: true,
            metadata: {
              strategy: effectiveStrategy,
              rerankUsed: false,
              rerankModel: VectorService.getRerankModelName(),
              source: 'openai'
            }
          };
          
          // Track analytics
          const sessionId = req.headers['x-session-id'] as string || req.ip || 'anonymous';
          await analyticsService.trackEvent('search', sessionId, {
            query: query.substring(0, 200),
            resultsCount: 0,
            confidence: 70,
            responseTime: 0,
            strategy: effectiveStrategy
          });
          
          return res.json(response);
        } catch (openAIError: any) {
          logger.error('OpenAI fallback failed:', { error: openAIError.message, requestId: req.requestId });
        }
      }
      
      // Final fallback if OpenAI also fails or not configured
      return res.json({
        answer: "I couldn't find any relevant information in your documents to answer this question. This could mean:\n\n• The information isn't in your uploaded documents\n• Try rephrasing your question with different keywords\n• Consider uploading more relevant documents",
        relevantChunks: [],
        confidence: 0,
        sources: []
      });
    }

    // Generate answer using GPT-5
    const startTime = Date.now();
    const searchResult = await GptService.answerQuestion(query, relevantChunks);
    const responseTime = Date.now() - startTime;

    // Check if GPT's answer indicates it couldn't find relevant info
    // If so, fall back to OpenAI for general knowledge
    const noInfoPatterns = [
      /i('m| am) afraid i don't have/i,
      /i couldn't find (any |specific )?information/i,
      /i don't have (any |specific )?information/i,
      /the documents (provided |)don't contain/i,
      /without any relevant information/i,
      /no (relevant |specific )?information (about|on|regarding)/i,
      /not (find|contain|have) (any )?(details|information|data) about/i,
      /couldn't provide a detailed answer/i,
      /i cannot find/i,
      /there is no information/i
    ];
    
    const answerIndicatesNoInfo = noInfoPatterns.some(pattern => pattern.test(searchResult.answer));
    
    if (answerIndicatesNoInfo && OpenAIService.isConfigured()) {
      try {
        logger.info('GPT indicated no relevant info found, falling back to OpenAI', { requestId: req.requestId });
        const openAIResult = await OpenAIService.generateGeneralAnswer(query);
        
        const response = {
          answer: openAIResult.answer,
          relevantChunks: [],
          confidence: 70,
          sources: [],
          isGeneralKnowledge: true,
          metadata: {
            strategy: effectiveStrategy,
            rerankUsed: VectorService.getLastRerankUsed(),
            rerankModel: VectorService.getRerankModelName(),
            source: 'openai'
          }
        };
        
        // Track analytics
        const sessionId = req.headers['x-session-id'] as string || req.ip || 'anonymous';
        await analyticsService.trackEvent('search', sessionId, {
          query: query.substring(0, 200),
          resultsCount: 0,
          confidence: 70,
          responseTime,
          strategy: effectiveStrategy
        });
        
        // Cache the result
        await SearchCache.set(query, cacheKey, response);
        res.setHeader('X-Cache', 'MISS');
        
        return res.json(response);
      } catch (openAIError: any) {
        logger.error('OpenAI fallback failed:', { error: openAIError.message, requestId: req.requestId });
        // Continue with GPT's original answer
      }
    }

    // Log search query for analytics
    await DatabaseService.logSearchQuery(
      query, 
      relevantChunks.length, 
      searchResult.confidence, 
      responseTime
    );

    // Track analytics event
    const sessionId = req.headers['x-session-id'] as string || req.ip || 'anonymous';
    await analyticsService.trackEvent('search', sessionId, {
      query: query.substring(0, 200),
      resultsCount: relevantChunks.length,
      confidence: searchResult.confidence,
      responseTime,
      strategy: effectiveStrategy
    });

    logger.debug(`Generated answer with ${searchResult.confidence}% confidence`);

    const response = {
      ...searchResult,
      metadata: {
        strategy: effectiveStrategy,
        rerankUsed: VectorService.getLastRerankUsed(),
        rerankModel: VectorService.getRerankModelName()
      }
    };

    // Cache the result
    await SearchCache.set(query, cacheKey, response);
    res.setHeader('X-Cache', 'MISS');

    res.json(response);

  } catch (error: any) {
    logger.error('Search error:', { error: error.message, requestId: req.requestId });

    // Handle specific error types with user-friendly messages
    let errorResponse = {
      error: 'Search Failed',
      message: 'An unexpected error occurred during search.',
      code: 'UNKNOWN_ERROR'
    };

    const errorMessage = error.message || '';

    // OpenAI embedding errors
    if (errorMessage.includes('OpenAI API authentication')) {
      errorResponse = {
        error: 'Configuration Error',
        message: 'Search service authentication failed. Please contact the administrator.',
        code: 'OPENAI_AUTH_ERROR'
      };
    } else if (errorMessage.includes('OpenAI API rate limit')) {
      errorResponse = {
        error: 'Service Temporarily Unavailable',
        message: 'Search service is temporarily rate-limited. Please try again in a few minutes.',
        code: 'OPENAI_RATE_LIMIT'
      };
    } else if (errorMessage.includes('OpenAI API quota exceeded')) {
      errorResponse = {
        error: 'Service Quota Exceeded',
        message: 'Search service has exceeded its quota. Please contact the administrator.',
        code: 'OPENAI_QUOTA_ERROR'
      };
    }
    // Vector search errors
    else if (errorMessage.includes('Failed to search similar chunks')) {
      errorResponse = {
        error: 'Search Index Error',
        message: 'There was an issue searching through your documents. Please try again.',
        code: 'SEARCH_INDEX_ERROR'
      };
    }
    // Question answering errors
    else if (errorMessage.includes('No relevant document chunks')) {
      errorResponse = {
        error: 'No Relevant Content',
        message: 'No relevant information found in your documents for this question.',
        code: 'NO_RELEVANT_CONTENT'
      };
    } else if (errorMessage.includes('Question cannot be empty')) {
      errorResponse = {
        error: 'Empty Question',
        message: 'Please provide a valid question to search for.',
        code: 'EMPTY_QUESTION'
      };
    }

    res.status(500).json(errorResponse);
  }
});

/**
 * @swagger
 * /search/recent:
 *   get:
 *     summary: Get recent searches
 *     description: Returns the last 10 search queries
 *     tags: [Search]
 *     responses:
 *       200:
 *         description: Recent searches
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 recent:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       query:
 *                         type: string
 *                       timestamp:
 *                         type: string
 *                         format: date-time
 *       500:
 *         description: Server error
 */
searchRouter.get('/recent', async (_req, res) => {
  try {
    const recent = await DatabaseService.getRecentSearches(10);
    res.json({ recent });
  } catch (error) {
    console.error('Recent searches error:', error);
    res.status(500).json({ error: 'Failed to fetch recent searches' });
  }
});

/**
 * @swagger
 * /search/related-questions:
 *   post:
 *     summary: Generate related questions
 *     description: Uses AI to generate follow-up questions based on a Q&A pair
 *     tags: [Search]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - query
 *               - answer
 *             properties:
 *               query:
 *                 type: string
 *                 description: Original question
 *               answer:
 *                 type: string
 *                 description: AI-generated answer
 *     responses:
 *       200:
 *         description: Related questions
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 questions:
 *                   type: array
 *                   items:
 *                     type: string
 *       429:
 *         description: Rate limit exceeded
 */
searchRouter.post('/related-questions', aiLimiter, validateBody(relatedQuestionsSchema), async (req, res) => {
  try {
    const { query, answer } = req.body;

    const questions = await GptService.generateRelatedQuestions(query, answer);
    res.json({ questions });
  } catch (error: any) {
    logger.error('Related questions error:', { error: error.message, requestId: req.requestId });
    // Return fallback questions on error
    res.json({
      questions: [
        'Can you provide more details?',
        'What are the implications?',
        'Are there any alternatives?',
      ],
    });
  }
});

/**
 * @swagger
 * /search/documents:
 *   post:
 *     summary: Find similar documents
 *     description: Searches for documents similar to the query without generating an AI answer
 *     tags: [Search]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - query
 *             properties:
 *               query:
 *                 type: string
 *                 minLength: 3
 *                 description: Search query
 *     responses:
 *       200:
 *         description: Similar documents
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 query:
 *                   type: string
 *                 similarDocuments:
 *                   type: array
 *                 count:
 *                   type: number
 *       400:
 *         description: Invalid query
 *       500:
 *         description: Server error
 */
searchRouter.post('/documents', async (req, res) => {
  try {
    const { query } = req.body;

    if (!query || typeof query !== 'string') {
      return res.status(400).json({ 
        error: 'Invalid Query',
        message: 'Please provide a valid search query.',
        code: 'INVALID_QUERY'
      });
    }

    if (query.trim().length < 3) {
      return res.status(400).json({
        error: 'Query Too Short',
        message: 'Please enter at least 3 characters for document search.',
        code: 'QUERY_TOO_SHORT'
      });
    }

    const similarDocuments = await VectorService.findSimilarDocuments(query, 5);

    res.json({
      query,
      similarDocuments,
      count: similarDocuments.length
    });

  } catch (error: any) {
    logger.error('Document search error:', { error: error.message, requestId: req.requestId });
    
    let errorResponse = {
      error: 'Document Search Failed',
      message: 'An unexpected error occurred while searching documents.',
      code: 'UNKNOWN_ERROR'
    };

    const errorMessage = error.message || '';

    if (errorMessage.includes('OpenAI')) {
      errorResponse = {
        error: 'Search Service Error',
        message: 'Document search service is currently unavailable.',
        code: 'SEARCH_SERVICE_ERROR'
      };
    }

    res.status(500).json(errorResponse);
  }
});

/**
 * @swagger
 * /search/agent/stream:
 *   get:
 *     summary: Stream AI response
 *     description: Server-Sent Events endpoint for streaming AI responses with real-time progress
 *     tags: [Search]
 *     parameters:
 *       - in: query
 *         name: query
 *         required: true
 *         schema:
 *           type: string
 *           maxLength: 2000
 *         description: Search query
 *       - in: query
 *         name: threadId
 *         schema:
 *           type: string
 *         description: Optional thread ID for conversation context
 *       - in: query
 *         name: strategy
 *         schema:
 *           type: string
 *           enum: [hybrid, vector]
 *           default: hybrid
 *         description: Search strategy
 *       - in: query
 *         name: rerank
 *         schema:
 *           type: boolean
 *           default: true
 *         description: Whether to rerank results
 *     responses:
 *       200:
 *         description: SSE stream of AI response
 *         content:
 *           text/event-stream:
 *             schema:
 *               type: string
 *               description: Server-sent events with thread, step, retrieval, answer, and done events
 *       400:
 *         description: Missing or invalid query parameter
 *       429:
 *         description: Rate limit exceeded
 */
searchRouter.get('/agent/stream', aiLimiter, aiSpeedLimiter, async (req: Request, res: Response) => {
  try {
    const overallStartTime = Date.now();
    const query = String(req.query.query || '');
    const strategy = (req.query.strategy as string) === 'vector' ? 'vector' : 'hybrid';
    const rerank = req.query.rerank !== 'false';
    const threadId = String(req.query.threadId || '');
    const mode = (req.query.mode as string) === 'detail' ? 'detail' : 'fast';
    const smart = req.query.smart === 'true'; // Enable smart category-based search

    if (!query || query.length > 2000) {
      res.status(400).end();
      return;
    }

    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.flushHeaders?.();

    const send = (event: string, data: any) => {
      res.write(`event: ${event}\n`);
      res.write(`data: ${JSON.stringify(data)}\n\n`);
    };

    // Track timing for each stage
    const timings: Record<string, number> = {};

    // Step 1: optionally create thread
    let stageStart = Date.now();
    let tid = threadId || (await DatabaseService.createThread(strategy as any, rerank)).threadId;
    timings.threadCreation = Date.now() - stageStart;
    send('thread', { threadId: tid });

    // Step 1.5: Fetch conversation history for context
    stageStart = Date.now();
    let conversationHistory: Array<{ role: 'user' | 'assistant'; content: string }> = [];
    if (threadId) {
      try {
        const messages = await DatabaseService.getMessages(threadId, 10);
        conversationHistory = messages.map((m: any) => ({
          role: m.role as 'user' | 'assistant',
          content: m.content
        }));
      } catch (e) {
        console.warn('Failed to fetch conversation history:', e);
      }
    }
    timings.historyFetch = Date.now() - stageStart;

    // Step 2: log user message
    stageStart = Date.now();
    await DatabaseService.addMessage(tid, 'user', query);
    timings.messageLog = Date.now() - stageStart;
    send('step', { label: 'User message stored' });

    // Step 3: Resolve follow-up references if this is a continuation
    stageStart = Date.now();
    let effectiveQuery = query;
    let searchQueries = [query];
    let isFollowUp = false;
    
    if (conversationHistory.length > 0) {
      const resolution = await GptService.resolveFollowUpQuery(query, conversationHistory);
      effectiveQuery = resolution.resolvedQuery;
      searchQueries = resolution.searchQueries;
      isFollowUp = resolution.isFollowUp;
      
      if (isFollowUp && effectiveQuery !== query) {
        send('step', { label: 'Query resolved', detail: { original: query, resolved: effectiveQuery } });
      }
    }
    timings.queryResolution = Date.now() - stageStart;

    // Step 4: clarify (skip if query was resolved)
    stageStart = Date.now();
    let clarifying: string | null = null;
    if (!isFollowUp) {
      clarifying = await AgentService.maybeClarify(effectiveQuery);
      if (clarifying) send('clarify', { question: clarifying });
    }
    timings.clarification = Date.now() - stageStart;

    // Step 4.5: Check for cached answer (only for non-follow-up queries)
    if (!isFollowUp) {
      const cachedResponse = await aggressiveCache.getRAGResponse(effectiveQuery);
      if (cachedResponse) {
        logger.info(`💨 Returning cached answer for query`, { query: effectiveQuery.substring(0, 50) });
        
        // Stream the cached answer
        const cachedAnswer = cachedResponse.answer || '';
        const chunkSize = 50;
        for (let i = 0; i < cachedAnswer.length; i += chunkSize) {
          send('answer', { partial: cachedAnswer.substring(i, i + chunkSize) });
        }
        
        // Send done with cached metadata
        send('done', { 
          metadata: { 
            strategy, 
            rerank, 
            isFollowUp: false,
            cached: true,
            confidence: cachedResponse.confidence || 85,
            timings: {
              threadCreation: timings.threadCreation,
              historyFetch: timings.historyFetch,
              messageLog: timings.messageLog,
              queryResolution: timings.queryResolution,
              clarification: timings.clarification,
              retrieval: 0, // Cached
              answerGeneration: 0, // Cached
              persistence: timings.persistence || 0,
              total: Date.now() - overallStartTime
            }
          }, 
          agentTrace: cachedResponse.trace || [] 
        });
        
        res.end();
        return;
      }
    }

    // Step 5: retrieve - search with all queries and combine results
    const searchQuery = clarifying ? `${effectiveQuery}\nClarification: ${clarifying}` : effectiveQuery;
    let allChunks: any[] = [];
    let trace: any[] = [];

    // Search with primary query - use smart retrieval if enabled
    stageStart = Date.now();
    if (smart) {
      // Send classification progress
      send('step', { 
        label: 'Analyzing query', 
        detail: { stage: 'classification' } 
      });

      // Smart category-based retrieval (faster for large KBs)
      const smartResult = await AgentService.retrieveSmart(searchQuery, { strategy: strategy as any, rerank });
      allChunks = [...smartResult.chunks];
      trace = [...smartResult.trace];
      timings.retrieval = Date.now() - stageStart;

      // Get total document count for context
      const totalDocs = await DatabaseService.getTotalDocumentCount();

      // Send detailed smart search progress
      if (smartResult.classification.categories.length > 0) {
        send('step', {
          label: 'Smart search',
          detail: {
            type: 'smart_search',
            categories: smartResult.classification.categories,
            searchedDocuments: smartResult.searchedDocuments,
            totalDocuments: totalDocs,
            confidence: smartResult.classification.confidence,
            reasoning: smartResult.classification.reasoning,
            chunksFound: smartResult.chunks.length,
            timing: timings.retrieval
          }
        });
      } else {
        // No category match - searching all documents
        send('step', {
          label: 'Searching all documents',
          detail: {
            type: 'full_search',
            searchedDocuments: totalDocs,
            totalDocuments: totalDocs,
            chunksFound: smartResult.chunks.length,
            timing: timings.retrieval,
            reason: 'No category match found'
          }
        });
      }
    } else {
      // Standard retrieval (searches all documents)
      const totalDocs = await DatabaseService.getTotalDocumentCount();
      send('step', { 
        label: `Searching all ${totalDocs} documents`, 
        detail: { 
          type: 'full_search',
          searchedDocuments: totalDocs,
          totalDocuments: totalDocs
        } 
      });
      
      const primaryResult = await AgentService.retrieve(searchQuery, strategy as any, rerank);
      allChunks = [...primaryResult.chunks];
      trace = [...primaryResult.trace];
      timings.retrieval = Date.now() - stageStart;
    }
    
    // If follow-up, also search with original query to get more context
    if (isFollowUp && searchQueries.length > 1) {
      for (const sq of searchQueries.slice(1)) {
        try {
          const additionalResult = await AgentService.retrieve(sq, strategy as any, rerank);
          // Add unique chunks
          for (const chunk of additionalResult.chunks) {
            if (!allChunks.find(c => c.chunkId === chunk.chunkId)) {
              allChunks.push(chunk);
            }
          }
        } catch (e) {
          console.warn('Additional search failed:', e);
        }
      }
      // Re-sort by similarity
      allChunks.sort((a, b) => b.similarity - a.similarity);
      // Limit to top 6
      allChunks = allChunks.slice(0, 6);
    }
    
    // Send detailed retrieval results
    send('retrieval', { 
      strategy, 
      rerank, 
      count: allChunks.length,
      detail: {
        foundChunks: allChunks.length,
        uniqueDocuments: new Set(allChunks.map(c => c.documentId)).size,
        topSimilarity: allChunks.length > 0 ? Math.round(allChunks[0].similarity * 100) : 0,
        timing: timings.retrieval
      }
    });

    // Step 6: answer with conversation history (simulate token streaming by chunking the answer)
    // If no chunks found, use OpenAI for general knowledge streaming
    let isGeneralKnowledge = false;
    const CONFIDENCE_THRESHOLD = 50; // Confidence threshold for fallback to OpenAI (raised for better UX)
    
    if (allChunks.length === 0 && OpenAIService.isConfigured()) {
      // Stream from OpenAI for general knowledge
      isGeneralKnowledge = true;
      send('step', { label: 'No relevant documents found - Using general knowledge' });
      
      try {
        for await (const chunk of OpenAIService.streamGeneralAnswer(effectiveQuery, conversationHistory, mode === 'fast')) {
          send('answer', { partial: chunk });
        }
        
        // Get full answer for storage
        const fullResult = await OpenAIService.generateGeneralAnswer(effectiveQuery, conversationHistory, mode === 'fast');
        
        // Step 7: finalize and persist
        await DatabaseService.logSearchQuery(query, 0, 70, 0);
        await DatabaseService.addMessage(tid, 'assistant', fullResult.answer, { metadata: { strategy, rerank, isFollowUp, isGeneralKnowledge: true, fallbackReason: 'no_documents' } }, trace);
        
        // Track chat message analytics with token usage
        const sessionId = req.headers['x-session-id'] as string || req.ip || 'anonymous';
        const tokensUsed = fullResult.tokensUsed || 0;
        
        await analyticsService.trackEvent('chat_message', sessionId, {
          threadId: tid,
          query: query.substring(0, 200),
          resultsCount: 0,
          confidence: 70,
          isFollowUp,
          isGeneralKnowledge: true,
          tokensUsed
        });
        
        // Track ai_response for token aggregation with aiSource
        if (tokensUsed > 0) {
          await analyticsService.trackEvent('ai_response', sessionId, {
            aiSource: 'chat',
            tokensUsed,
            query: query.substring(0, 200),
            confidence: 70,
            isGeneralKnowledge: true
          });
        }

        send('done', { metadata: { strategy, rerank, isFollowUp, isGeneralKnowledge: true, confidence: 70 }, agentTrace: trace });
        res.end();
        return;
      } catch (openAIError) {
        logger.error('OpenAI streaming fallback failed:', { error: (openAIError as any).message });
        // Fall through to regular answer handling
      }
    }
    
    // Generate answer from documents with the selected mode
    const result = await AgentService.answer(effectiveQuery, allChunks, conversationHistory, mode);

    // Patterns that indicate the KB doesn't have the answer
    const noInfoPatterns = [
      /sources do not contain/i,
      /provided sources do not contain/i,
      /i('m| am) afraid i don't have/i,
      /i couldn't find (any |specific )?information/i,
      /i don't have (any |specific )?information/i,
      /the documents (provided |)don't contain/i,
      /without any relevant information/i,
      /no (relevant |specific )?information (about|on|regarding|found)/i,
      /not (find|contain|have) (any )?(details|information|data) about/i,
      /couldn't provide a detailed answer/i,
      /i cannot find/i,
      /there is no information/i,
      /no information (is )?available/i,
      /unable to find/i,
      /does not (contain|include|have)/i,
      /couldn't locate/i,
      /not covered in/i,
      /outside (the |my )?knowledge/i,
      /beyond (the |my )?scope/i,
      /please provide more details/i
    ];

    const answerIndicatesNoInfo = noInfoPatterns.some(pattern => pattern.test(result.answer));

    // Check if confidence is too low OR answer indicates no info - fallback to OpenAI
    if ((result.confidence < CONFIDENCE_THRESHOLD || answerIndicatesNoInfo) && OpenAIService.isConfigured()) {
      const fallbackReason = answerIndicatesNoInfo
        ? 'Answer indicates information not in KB'
        : `Low confidence (${result.confidence}%)`;
      logger.info(`${fallbackReason} - Falling back to OpenAI general knowledge`);
      isGeneralKnowledge = true;
      send('step', { label: `${fallbackReason} - Using general knowledge` });
      
      try {
        // Stream answer from OpenAI
        for await (const chunk of OpenAIService.streamGeneralAnswer(effectiveQuery, conversationHistory, mode === 'fast')) {
          send('answer', { partial: chunk });
        }
        
        // Get full answer for storage
        const fullResult = await OpenAIService.generateGeneralAnswer(effectiveQuery, conversationHistory, mode === 'fast');
        
        // Step 7: finalize and persist with general knowledge flag
        await DatabaseService.logSearchQuery(query, allChunks.length, 70, 0);
        await DatabaseService.addMessage(tid, 'assistant', fullResult.answer, { 
          metadata: { 
            strategy, 
            rerank, 
            isFollowUp, 
            isGeneralKnowledge: true, 
            fallbackReason: 'low_confidence',
            originalConfidence: result.confidence 
          } 
        }, trace);
        
        // Track chat message analytics with token usage
        const sessionId = req.headers['x-session-id'] as string || req.ip || 'anonymous';
        const tokensUsed = fullResult.tokensUsed || 0;
        
        await analyticsService.trackEvent('chat_message', sessionId, {
          threadId: tid,
          query: query.substring(0, 200),
          resultsCount: allChunks.length,
          confidence: 70,
          isFollowUp,
          isGeneralKnowledge: true,
          originalConfidence: result.confidence,
          tokensUsed
        });
        
        // Track ai_response for token aggregation with aiSource
        if (tokensUsed > 0) {
          await analyticsService.trackEvent('ai_response', sessionId, {
            aiSource: 'chat',
            tokensUsed,
            query: query.substring(0, 200),
            confidence: 70,
            isGeneralKnowledge: true
          });
        }

        send('done', {
          metadata: {
            strategy,
            rerank,
            isFollowUp,
            isGeneralKnowledge: true,
            confidence: 70,
            originalConfidence: result.confidence
          },
          agentTrace: trace
        });
        res.end();
        return;
      } catch (openAIError) {
        logger.error('OpenAI low-confidence fallback failed:', { error: (openAIError as any).message });
        // Fall through to use the original low-confidence answer
      }
    }
    
    // Use answer from documents
    stageStart = Date.now();
    const answer = result.answer || '';
    const tokenSize = 80;
    for (let i = 0; i < answer.length; i += tokenSize) {
      const slice = answer.slice(i, i + tokenSize);
      send('answer', { partial: slice });
      await new Promise(r => setTimeout(r, 20));
    }
    timings.answerGeneration = Date.now() - stageStart;

    // Step 7: finalize and persist
    stageStart = Date.now();
    await DatabaseService.logSearchQuery(query, allChunks.length, result.confidence, 0);
    await DatabaseService.addMessage(tid, 'assistant', result.answer, { metadata: { strategy, rerank, isFollowUp, isGeneralKnowledge: false } }, trace);
    timings.persistence = Date.now() - stageStart;
    
    // Cache the answer for future queries (only for non-follow-up, non-general-knowledge queries)
    if (!isFollowUp && !isGeneralKnowledge) {
      await aggressiveCache.cacheRAGResponse(effectiveQuery, {
        answer: result.answer,
        confidence: result.confidence,
        trace: trace,
        chunks: allChunks.length
      });
      logger.info(`📦 Cached RAG response`, { query: effectiveQuery.substring(0, 50), confidence: result.confidence });
    }
    
    // Track chat message analytics with token usage
    const sessionId = req.headers['x-session-id'] as string || req.ip || 'anonymous';
    const tokensUsed = (result as any).tokensUsed || 0;
    
    await analyticsService.trackEvent('chat_message', sessionId, {
      threadId: tid,
      query: query.substring(0, 200),
      resultsCount: allChunks.length,
      confidence: result.confidence,
      isFollowUp,
      tokensUsed
    });
    
    // Also track ai_response for token aggregation with aiSource
    if (tokensUsed > 0) {
      await analyticsService.trackEvent('ai_response', sessionId, {
        aiSource: 'chat',
        tokensUsed,
        query: query.substring(0, 200),
        confidence: result.confidence
      });
    }
    
    // Calculate total time
    timings.total = Date.now() - overallStartTime;
    
    send('done', { 
      metadata: { 
        strategy, 
        rerank, 
        isFollowUp, 
        isGeneralKnowledge: false, 
        confidence: result.confidence,
        timings 
      }, 
      agentTrace: trace 
    });
    res.end();
  } catch (error) {
    logger.error('Agent stream error:', { error: (error as any).message, requestId: req.requestId });
    try { res.write(`event: error\n` + `data: ${JSON.stringify({ message: (error as any).message })}\n\n`); } catch {}
    res.end();
  }
});

/**
 * @swagger
 * /search/agent:
 *   post:
 *     summary: AI agent search
 *     description: Performs AI-powered search with conversation context and returns complete response
 *     tags: [Search]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - query
 *             properties:
 *               query:
 *                 type: string
 *                 minLength: 1
 *                 maxLength: 2000
 *                 description: Search query
 *               strategy:
 *                 type: string
 *                 enum: [hybrid, vector]
 *                 default: hybrid
 *               rerank:
 *                 type: boolean
 *                 default: true
 *               threadId:
 *                 type: string
 *                 description: Thread ID for conversation context
 *     responses:
 *       200:
 *         description: Agent response with answer and sources
 *         content:
 *           application/json:
 *             schema:
 *               allOf:
 *                 - $ref: '#/components/schemas/SearchResult'
 *                 - type: object
 *                   properties:
 *                     threadId:
 *                       type: string
 *                     isFollowUp:
 *                       type: boolean
 *                     agentTrace:
 *                       type: array
 *       400:
 *         description: Validation error
 *       429:
 *         description: Rate limit exceeded
 *       500:
 *         description: Server error
 */
searchRouter.post('/agent', aiLimiter, aiSpeedLimiter, validateBody(agentSearchSchema), async (req, res) => {
  try {
    const { query, strategy = 'hybrid', rerank = true, threadId } = req.body;

    const start = Date.now();
    let tid = threadId as string | undefined;
    if (!tid) {
      const t = await DatabaseService.createThread(strategy, rerank);
      tid = t.threadId;
    }

    // Fetch conversation history for context
    let conversationHistory: Array<{ role: 'user' | 'assistant'; content: string }> = [];
    if (threadId) {
      try {
        const messages = await DatabaseService.getMessages(threadId, 10);
        conversationHistory = messages.map((m: any) => ({
          role: m.role as 'user' | 'assistant',
          content: m.content
        }));
      } catch (e) {
        console.warn('Failed to fetch conversation history:', e);
      }
    }

    await DatabaseService.addMessage(tid, 'user', query);

    // Resolve follow-up query if needed
    let effectiveQuery = query;
    let isFollowUp = false;
    
    if (conversationHistory.length > 0) {
      const resolution = await GptService.resolveFollowUpQuery(query, conversationHistory);
      effectiveQuery = resolution.resolvedQuery;
      isFollowUp = resolution.isFollowUp;
    }

    // Process with conversation history for hyper-personalized responses
    const result = await AgentService.processQuestion(effectiveQuery, strategy, rerank, conversationHistory);
    const responseTime = Date.now() - start;

    await DatabaseService.logSearchQuery(query, result.relevantChunks.length, result.confidence, responseTime);
    await DatabaseService.addMessage(tid, 'assistant', result.answer, { metadata: { ...result.metadata, isFollowUp } }, result.agentTrace);

    // Track chat message analytics
    const sessionId = req.headers['x-session-id'] as string || req.ip || 'anonymous';
    await analyticsService.trackEvent('chat_message', sessionId, {
      threadId: tid,
      query: query.substring(0, 200),
      resultsCount: result.relevantChunks.length,
      confidence: result.confidence,
      responseTime,
      isFollowUp
    });

    res.json({ threadId: tid, ...result, isFollowUp });
  } catch (error: any) {
    logger.error('Agent error:', { error: error.message, requestId: req.requestId });
    res.status(500).json({ error: 'Agent Failed', message: error.message || 'Unknown error', code: 'AGENT_ERROR' });
  }
});