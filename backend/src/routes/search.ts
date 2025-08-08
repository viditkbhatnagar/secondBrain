import express from 'express';
import { VectorService } from '../services/VectorService';
import { ClaudeService } from '../services/ClaudeService';
import { DatabaseService } from '../services/DatabaseService';
import { AgentService } from '../services/AgentService';
import { Request, Response } from 'express';

export const searchRouter = express.Router();

searchRouter.post('/', async (req, res) => {
  try {
    const { query, strategy, rerank } = req.body;

    if (!query || typeof query !== 'string') {
      return res.status(400).json({ 
        error: 'Invalid Query',
        message: 'Please provide a valid search question.',
        code: 'INVALID_QUERY'
      });
    }

    if (query.trim().length < 3) {
      return res.status(400).json({
        error: 'Query Too Short',
        message: 'Please enter at least 3 characters for your search.',
        code: 'QUERY_TOO_SHORT'
      });
    }

    if (query.length > 1000) {
      return res.status(400).json({
        error: 'Query Too Long',
        message: 'Please limit your question to 1000 characters.',
        code: 'QUERY_TOO_LONG'
      });
    }

    console.log(`Processing search query: "${query}"`);

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
    const relevantChunks = strategy === 'hybrid'
      ? await VectorService.searchSimilarHybrid(query, { limit: 5, minSimilarity: 0.2, alpha: 0.6, rerank: rerank !== false })
      : await VectorService.searchSimilar(query, 5, 0.3);

    if (relevantChunks.length === 0) {
      return res.json({
        answer: "I couldn't find any relevant information in your documents to answer this question. This could mean:\n\n• The information isn't in your uploaded documents\n• Try rephrasing your question with different keywords\n• Consider uploading more relevant documents",
        relevantChunks: [],
        confidence: 0,
        sources: []
      });
    }

    // Generate answer using Claude
    const startTime = Date.now();
    const searchResult = await ClaudeService.answerQuestion(query, relevantChunks);
    const responseTime = Date.now() - startTime;

    // Log search query for analytics
    await DatabaseService.logSearchQuery(
      query, 
      relevantChunks.length, 
      searchResult.confidence, 
      responseTime
    );

    console.log(`Generated answer with ${searchResult.confidence}% confidence`);

    res.json({
      ...searchResult,
      metadata: {
        strategy: strategy === 'hybrid' ? 'hybrid' : 'vector',
        rerankUsed: VectorService.getLastRerankUsed(),
        rerankModel: VectorService.getRerankModelName()
      }
    });

  } catch (error: any) {
    console.error('Search error:', error);

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
    // Claude API errors
    else if (errorMessage.includes('Claude API authentication')) {
      errorResponse = {
        error: 'Configuration Error',
        message: 'AI service authentication failed. Please contact the administrator.',
        code: 'CLAUDE_AUTH_ERROR'
      };
    } else if (errorMessage.includes('Claude API rate limit')) {
      errorResponse = {
        error: 'Service Temporarily Unavailable',
        message: 'AI service is temporarily rate-limited. Please try again in a few minutes.',
        code: 'CLAUDE_RATE_LIMIT'
      };
    } else if (errorMessage.includes('credit balance too low')) {
      errorResponse = {
        error: 'Service Credits Exhausted',
        message: 'AI service has insufficient credits. Please contact the administrator to add credits.',
        code: 'CLAUDE_CREDITS_ERROR'
      };
    } else if (errorMessage.includes('Claude model not found')) {
      errorResponse = {
        error: 'Service Configuration Error',
        message: 'AI model configuration issue. Please contact the administrator.',
        code: 'MODEL_NOT_FOUND'
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

// Get recent searches (last 10)
searchRouter.get('/recent', async (_req, res) => {
  try {
    const recent = await DatabaseService.getRecentSearches(10);
    res.json({ recent });
  } catch (error) {
    console.error('Recent searches error:', error);
    res.status(500).json({ error: 'Failed to fetch recent searches' });
  }
});

// Alternative search endpoint for finding similar documents
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
    console.error('Document search error:', error);
    
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

// Agentic chat-style endpoint (phase 2 minimal non-streaming)
// SSE streaming agent endpoint
searchRouter.get('/agent/stream', async (req: Request, res: Response) => {
  try {
    const query = String(req.query.query || '');
    const strategy = (req.query.strategy as string) === 'vector' ? 'vector' : 'hybrid';
    const rerank = req.query.rerank !== 'false';
    const threadId = String(req.query.threadId || '');

    if (!query) {
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

    // Step 1: optionally create thread
    let tid = threadId || (await DatabaseService.createThread(strategy as any, rerank)).threadId;
    send('thread', { threadId: tid });

    // Step 2: log user message
    await DatabaseService.addMessage(tid, 'user', query);
    send('step', { label: 'User message stored' });

    // Step 3: clarify
    const clarifying = await AgentService.maybeClarify(query);
    if (clarifying) send('clarify', { question: clarifying });

    // Step 4: retrieve
    const effectiveQuery = clarifying ? `${query}\nClarification: ${clarifying}` : query;
    const { chunks, trace } = await AgentService.retrieve(effectiveQuery, strategy as any, rerank);
    send('retrieval', { strategy, rerank, count: chunks.length });

    // Step 5: answer (simulate token streaming by chunking the answer)
    const result = await AgentService.answer(query, chunks);
    const answer = result.answer || '';
    const tokenSize = 80;
    for (let i = 0; i < answer.length; i += tokenSize) {
      const slice = answer.slice(i, i + tokenSize);
      send('answer', { partial: slice });
      await new Promise(r => setTimeout(r, 20));
    }

    // Step 6: finalize and persist
    await DatabaseService.logSearchQuery(query, chunks.length, result.confidence, 0);
    await DatabaseService.addMessage(tid, 'assistant', result.answer, { metadata: { strategy, rerank } }, trace);
    send('done', { metadata: { strategy, rerank }, agentTrace: trace });
    res.end();
  } catch (error) {
    try { res.write(`event: error\n` + `data: ${JSON.stringify({ message: (error as any).message })}\n\n`); } catch {}
    res.end();
  }
});

searchRouter.post('/agent', async (req, res) => {
  try {
    const { query, strategy = 'hybrid', rerank = true, threadId } = req.body;
    if (!query || typeof query !== 'string') {
      return res.status(400).json({ error: 'Invalid Query', message: 'Please provide a valid search question.', code: 'INVALID_QUERY' });
    }

    const start = Date.now();
    let tid = threadId as string | undefined;
    if (!tid) {
      const t = await DatabaseService.createThread(strategy, rerank);
      tid = t.threadId;
    }
    await DatabaseService.addMessage(tid, 'user', query);

    const result = await AgentService.processQuestion(query, strategy, rerank);
    const responseTime = Date.now() - start;

    await DatabaseService.logSearchQuery(query, result.relevantChunks.length, result.confidence, responseTime);
    await DatabaseService.addMessage(tid, 'assistant', result.answer, { metadata: result.metadata }, result.agentTrace);

    res.json({ threadId: tid, ...result });
  } catch (error: any) {
    console.error('Agent error:', error);
    res.status(500).json({ error: 'Agent Failed', message: error.message || 'Unknown error', code: 'AGENT_ERROR' });
  }
});