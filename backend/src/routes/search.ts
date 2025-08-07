import express from 'express';
import { VectorService } from '../services/VectorService';
import { ClaudeService } from '../services/ClaudeService';
import { DatabaseService } from '../services/DatabaseService';

export const searchRouter = express.Router();

searchRouter.post('/', async (req, res) => {
  try {
    const { query } = req.body;

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

    // Find relevant document chunks
    const relevantChunks = await VectorService.searchSimilar(query, 5, 0.3);

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

    res.json(searchResult);

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