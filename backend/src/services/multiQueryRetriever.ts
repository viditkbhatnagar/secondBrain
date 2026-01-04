import { OpenAI } from 'openai';
import { logger } from '../utils/logger';
import { redisService } from './RedisService';
import * as crypto from 'crypto';

interface DecomposedQuery {
  original: string;
  subQueries: string[];
  queryType: 'simple' | 'multi-hop' | 'comparison' | 'aggregation';
  entities: string[];
}

export class MultiQueryRetriever {
  private openai: OpenAI | null = null;
  private readonly CACHE_TTL = 3600; // 1 hour

  private getOpenAI(): OpenAI {
    if (!this.openai) {
      this.openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
    }
    return this.openai;
  }

  async decomposeQuery(query: string): Promise<DecomposedQuery> {
    const cacheKey = `decompose:${this.hashQuery(query)}`;
    const cached = await redisService.get<DecomposedQuery>(cacheKey);
    if (cached) {
      logger.debug('Query decomposition cache hit');
      return cached;
    }

    const startTime = Date.now();

    try {
      const response = await this.getOpenAI().chat.completions.create({
        model: 'gpt-3.5-turbo',
        messages: [
          {
            role: 'system',
            content: `You are a query decomposition expert. Analyze the user's question and break it down into simpler sub-queries that can be searched independently.

Rules:
1. For simple factual questions, return just the original query
2. For complex questions, break into 2-4 focused sub-queries
3. Identify the query type: simple, multi-hop, comparison, or aggregation
4. Extract key entities mentioned

Return JSON only:
{
  "subQueries": ["query1", "query2"],
  "queryType": "multi-hop",
  "entities": ["entity1", "entity2"]
}`
          },
          { role: 'user', content: query }
        ],
        temperature: 0,
        max_tokens: 300,
        response_format: { type: 'json_object' }
      });

      const result = JSON.parse(response.choices[0]?.message?.content || '{}');

      const decomposed: DecomposedQuery = {
        original: query,
        subQueries: result.subQueries?.length ? result.subQueries : [query],
        queryType: result.queryType || 'simple',
        entities: result.entities || []
      };

      await redisService.set(cacheKey, decomposed, this.CACHE_TTL);

      logger.info(`Query decomposed in ${Date.now() - startTime}ms`, {
        original: query.slice(0, 50),
        subQueryCount: decomposed.subQueries.length,
        type: decomposed.queryType
      });

      return decomposed;

    } catch (error) {
      logger.error('Query decomposition failed:', error);
      return {
        original: query,
        subQueries: [query],
        queryType: 'simple',
        entities: []
      };
    }
  }

  // Generate hypothetical answer for HyDE (Hypothetical Document Embeddings)
  async generateHypotheticalAnswer(query: string): Promise<string> {
    const cacheKey = `hyde:${this.hashQuery(query)}`;
    const cached = await redisService.get<string>(cacheKey);
    if (cached) return cached;

    try {
      const response = await this.getOpenAI().chat.completions.create({
        model: 'gpt-3.5-turbo',
        messages: [
          {
            role: 'system',
            content: 'Generate a brief, factual answer to this question as if you had perfect knowledge. This will be used for semantic search. Keep it under 100 words.'
          },
          { role: 'user', content: query }
        ],
        temperature: 0.3,
        max_tokens: 150
      });

      const hypothetical = response.choices[0]?.message?.content || query;
      await redisService.set(cacheKey, hypothetical, this.CACHE_TTL);
      return hypothetical;

    } catch (error) {
      logger.error('HyDE generation failed:', error);
      return query;
    }
  }

  // Expand query with synonyms and related terms
  async expandQuery(query: string): Promise<string[]> {
    const cacheKey = `expand:${this.hashQuery(query)}`;
    const cached = await redisService.get<string[]>(cacheKey);
    if (cached) return cached;

    try {
      const response = await this.getOpenAI().chat.completions.create({
        model: 'gpt-3.5-turbo',
        messages: [
          {
            role: 'system',
            content: 'Generate 2-3 alternative phrasings of this query using synonyms and related terms. Return JSON: {"expansions": ["alt1", "alt2"]}'
          },
          { role: 'user', content: query }
        ],
        temperature: 0.3,
        max_tokens: 150,
        response_format: { type: 'json_object' }
      });

      const result = JSON.parse(response.choices[0]?.message?.content || '{}');
      const expansions = [query, ...(result.expansions || [])];
      await redisService.set(cacheKey, expansions, this.CACHE_TTL);
      return expansions;

    } catch (error) {
      logger.error('Query expansion failed:', error);
      return [query];
    }
  }

  private hashQuery(query: string): string {
    return crypto.createHash('md5').update(query.toLowerCase().trim()).digest('hex').slice(0, 16);
  }
}

export const multiQueryRetriever = new MultiQueryRetriever();
