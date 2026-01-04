import { OpenAI } from 'openai';
import { logger } from '../utils/logger';

interface CompressedContext {
  original: string;
  compressed: string;
  relevanceScore: number;
  keyPoints: string[];
}

export class ContextualCompressor {
  private openai: OpenAI | null = null;

  private getOpenAI(): OpenAI {
    if (!this.openai) {
      this.openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
    }
    return this.openai;
  }

  // Compress retrieved contexts to only include relevant information
  async compressContexts(
    query: string,
    contexts: string[],
    maxOutputTokens: number = 1500
  ): Promise<CompressedContext[]> {
    const startTime = Date.now();

    // Process contexts in parallel
    const compressed = await Promise.all(
      contexts.map(context => this.compressContext(query, context))
    );

    // Sort by relevance and trim to token limit
    const sorted = compressed
      .filter(c => c.relevanceScore > 0.3)
      .sort((a, b) => b.relevanceScore - a.relevanceScore);

    // Calculate total tokens and trim if needed
    let totalTokens = 0;
    const result: CompressedContext[] = [];
    
    for (const ctx of sorted) {
      const tokens = this.estimateTokens(ctx.compressed);
      if (totalTokens + tokens <= maxOutputTokens) {
        result.push(ctx);
        totalTokens += tokens;
      } else {
        break;
      }
    }

    const originalTokens = contexts.join('').length / 4;
    logger.info(`Contexts compressed in ${Date.now() - startTime}ms`, {
      inputContexts: contexts.length,
      outputContexts: result.length,
      compressionRatio: originalTokens > 0 ? (1 - totalTokens / originalTokens).toFixed(2) : '0'
    });

    return result;
  }

  private async compressContext(query: string, context: string): Promise<CompressedContext> {
    // For short contexts, skip compression
    if (context.length < 500) {
      return {
        original: context,
        compressed: context,
        relevanceScore: 0.7,
        keyPoints: []
      };
    }

    try {
      const response = await this.getOpenAI().chat.completions.create({
        model: 'gpt-3.5-turbo',
        messages: [
          {
            role: 'system',
            content: `Extract ONLY the parts of the context that are relevant to answering the question.

Remove irrelevant information. Keep essential facts, data, and explanations.
Return JSON: {"compressed": "relevant text only", "relevanceScore": 0.0-1.0, "keyPoints": ["point1", "point2"]}`
          },
          {
            role: 'user',
            content: `Question: ${query}\n\nContext: ${context.slice(0, 2000)}`
          }
        ],
        temperature: 0,
        max_tokens: 500,
        response_format: { type: 'json_object' }
      });

      const result = JSON.parse(response.choices[0]?.message?.content || '{}');

      return {
        original: context,
        compressed: result.compressed || context,
        relevanceScore: result.relevanceScore || 0.5,
        keyPoints: result.keyPoints || []
      };

    } catch (error) {
      logger.error('Context compression failed:', error);
      return {
        original: context,
        compressed: context,
        relevanceScore: 0.5,
        keyPoints: []
      };
    }
  }

  // Fast extraction without LLM - uses keyword matching
  extractRelevantSentences(query: string, context: string, maxSentences: number = 5): string {
    const queryTerms = new Set(
      query.toLowerCase()
        .replace(/[^\w\s]/g, ' ')
        .split(/\s+/)
        .filter(w => w.length > 3)
    );

    const sentences = context.split(/[.!?]+/).filter(s => s.trim().length > 20);
    
    const scored = sentences.map(sentence => {
      const words = sentence.toLowerCase().split(/\s+/);
      let score = 0;
      for (const word of words) {
        if (queryTerms.has(word)) score += 2;
        for (const qt of queryTerms) {
          if (word.includes(qt) || qt.includes(word)) score += 0.5;
        }
      }
      return { sentence: sentence.trim(), score };
    });

    return scored
      .sort((a, b) => b.score - a.score)
      .slice(0, maxSentences)
      .map(s => s.sentence)
      .join('. ') + '.';
  }

  private estimateTokens(text: string): number {
    return Math.ceil(text.length / 4);
  }
}

export const contextualCompressor = new ContextualCompressor();
