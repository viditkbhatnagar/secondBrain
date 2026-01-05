import { OpenAI } from 'openai';
import { logger } from '../utils/logger';
import { redisService } from './RedisService';

interface ProcessedQuery {
  original: string;
  expanded: string[];
  intent: 'question' | 'search' | 'command' | 'comparison';
  entities: string[];
  keywords: string[];
  filters: Record<string, string>;
}

export class QueryProcessor {
  private openai: OpenAI | null = null;
  private cache: Map<string, ProcessedQuery> = new Map();

  private getOpenAI(): OpenAI {
    if (!this.openai) {
      this.openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
    }
    return this.openai;
  }

  async processQuery(query: string): Promise<ProcessedQuery> {
    // Check cache first
    const cacheKey = `query:${query.toLowerCase().trim()}`;
    
    // Check Redis cache
    try {
      if (redisService?.isAvailable()) {
        const cached = await redisService.get<string>(cacheKey);
        if (cached) {
          return JSON.parse(cached);
        }
      }
    } catch (e) {
      // Continue without cache
    }

    const startTime = Date.now();

    try {
      // Use LLM to understand and expand query
      const response = await this.getOpenAI().chat.completions.create({
        model: 'gpt-5',
        messages: [
          {
            role: 'system',
            content: `You are a query understanding system. Analyze the user's query and return JSON with:
- expanded: array of 3-5 alternative phrasings/related queries
- intent: "question", "search", "command", or "comparison"
- entities: named entities mentioned
- keywords: important keywords
- filters: any filters like date, type, author

Return only valid JSON.`
          },
          {
            role: 'user',
            content: query
          }
        ],
        temperature: 1,
        max_completion_tokens: 300,
        response_format: { type: 'json_object' }
      });

      const result = JSON.parse(response.choices[0]?.message?.content || '{}');

      const processed: ProcessedQuery = {
        original: query,
        expanded: result.expanded || [query],
        intent: result.intent || 'search',
        entities: result.entities || [],
        keywords: result.keywords || [],
        filters: result.filters || {}
      };

      // Cache for 1 hour
      try {
        if (redisService?.isAvailable()) {
          await redisService.setex(cacheKey, 3600, JSON.stringify(processed));
        }
      } catch (e) {
        // Cache failure is non-critical
      }

      logger.info(`Query processed in ${Date.now() - startTime}ms`, {
        query: query.slice(0, 50),
        intent: processed.intent,
        expansionCount: processed.expanded.length
      });

      return processed;

    } catch (error) {
      logger.error('Query processing failed:', error);
      
      // Fallback to basic processing
      return {
        original: query,
        expanded: [query],
        intent: 'search',
        entities: [],
        keywords: this.extractBasicKeywords(query),
        filters: {}
      };
    }
  }

  private extractBasicKeywords(query: string): string[] {
    return query
      .toLowerCase()
      .replace(/[^\w\s]/g, '')
      .split(/\s+/)
      .filter(word => word.length > 3);
  }

  // Expand acronyms and abbreviations
  async expandAcronyms(query: string): Promise<string> {
    const commonAcronyms: Record<string, string> = {
      'ai': 'artificial intelligence',
      'ml': 'machine learning',
      'nlp': 'natural language processing',
      'api': 'application programming interface',
      'db': 'database',
      'ui': 'user interface',
      'ux': 'user experience',
    };

    let expanded = query.toLowerCase();
    for (const [acronym, full] of Object.entries(commonAcronyms)) {
      const regex = new RegExp(`\\b${acronym}\\b`, 'gi');
      expanded = expanded.replace(regex, `${acronym} (${full})`);
    }

    return expanded;
  }
}

export const queryProcessor = new QueryProcessor();
