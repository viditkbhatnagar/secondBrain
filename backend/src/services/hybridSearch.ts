import { ClaudeService, RelevantChunk } from './ClaudeService';
import { DocumentChunkModel } from '../models/index';
import { logger } from '../utils/logger';
import { EmbeddingCache } from '../utils/cache';

interface SearchResult {
  documentId: string;
  documentName: string;
  content: string;
  score: number;
  semanticScore: number;
  keywordScore: number;
  metadata: any;
  chunkId: string;
}

interface HybridSearchOptions {
  semanticWeight: number;  // 0-1, how much to weight semantic search
  keywordWeight: number;   // 0-1, how much to weight keyword search
  limit: number;
  minScore: number;
  rerank: boolean;
}

const DEFAULT_OPTIONS: HybridSearchOptions = {
  semanticWeight: 0.7,     // 70% semantic
  keywordWeight: 0.3,      // 30% keyword
  limit: 10,
  minScore: 0.5,
  rerank: true
};

export class HybridSearchService {
  
  async search(
    query: string,
    options: Partial<HybridSearchOptions> = {}
  ): Promise<SearchResult[]> {
    const opts = { ...DEFAULT_OPTIONS, ...options };
    const startTime = Date.now();

    try {
      // Run both searches in parallel
      const [semanticResults, keywordResults] = await Promise.all([
        this.semanticSearch(query, opts.limit * 2),
        this.keywordSearch(query, opts.limit * 2)
      ]);

      // Merge and normalize scores
      const mergedResults = this.mergeResults(
        semanticResults,
        keywordResults,
        opts.semanticWeight,
        opts.keywordWeight
      );

      // Optional: Re-rank using cross-encoder or LLM
      const finalResults = opts.rerank 
        ? await this.rerankResults(query, mergedResults, opts.limit)
        : mergedResults.slice(0, opts.limit);

      // Filter by minimum score
      const filteredResults = finalResults.filter(r => r.score >= opts.minScore);

      logger.info(`Hybrid search completed in ${Date.now() - startTime}ms`, {
        query: query.slice(0, 50),
        semanticCount: semanticResults.length,
        keywordCount: keywordResults.length,
        finalCount: filteredResults.length
      });

      return filteredResults;

    } catch (error) {
      logger.error('Hybrid search failed:', error);
      // Fallback to semantic only
      return this.semanticSearch(query, opts.limit);
    }
  }

  // Semantic search using vector similarity
  private async semanticSearch(query: string, limit: number): Promise<SearchResult[]> {
    const embedding = await ClaudeService.generateEmbedding(query);
    const allChunks = await DocumentChunkModel.find({}).exec();

    if (allChunks.length === 0) return [];

    const results: SearchResult[] = [];

    for (const chunk of allChunks) {
      if (!chunk.embedding || chunk.embedding.length === 0) continue;

      const similarity = this.cosineSimilarity(embedding, chunk.embedding);
      
      if (similarity >= 0.3) {
        results.push({
          documentId: chunk.documentId,
          documentName: chunk.documentName,
          content: chunk.content,
          score: similarity,
          semanticScore: similarity,
          keywordScore: 0,
          metadata: { chunkIndex: chunk.chunkIndex },
          chunkId: chunk.chunkId
        });
      }
    }

    return results.sort((a, b) => b.score - a.score).slice(0, limit);
  }


  // Keyword search using MongoDB text search
  private async keywordSearch(query: string, limit: number): Promise<SearchResult[]> {
    // Extract keywords (remove stop words)
    const keywords = this.extractKeywords(query);
    
    if (keywords.length === 0) return [];

    try {
      // Use MongoDB text search
      const results = await DocumentChunkModel.aggregate([
        {
          $match: {
            $text: { $search: keywords.join(' ') }
          }
        },
        {
          $addFields: {
            score: { $meta: 'textScore' }
          }
        },
        { $sort: { score: -1 } },
        { $limit: limit }
      ]);

      // Normalize scores to 0-1
      const maxScore = Math.max(...results.map((r: any) => r.score), 1);
      
      return results.map((r: any) => ({
        documentId: r.documentId,
        documentName: r.documentName,
        content: r.content,
        score: r.score / maxScore,
        semanticScore: 0,
        keywordScore: r.score / maxScore,
        metadata: { chunkIndex: r.chunkIndex },
        chunkId: r.chunkId
      }));
    } catch (error) {
      // Text index might not exist, fallback to regex search
      logger.warn('Text search failed, using regex fallback:', error);
      return this.regexKeywordSearch(keywords, limit);
    }
  }

  // Fallback regex-based keyword search
  private async regexKeywordSearch(keywords: string[], limit: number): Promise<SearchResult[]> {
    const regexPattern = keywords.map(k => `(?=.*${k})`).join('');
    
    const results = await DocumentChunkModel.find({
      content: { $regex: regexPattern, $options: 'i' }
    }).limit(limit).exec();

    return results.map((r: any) => {
      const matchCount = keywords.filter(k => 
        r.content.toLowerCase().includes(k.toLowerCase())
      ).length;
      const score = matchCount / keywords.length;

      return {
        documentId: r.documentId,
        documentName: r.documentName,
        content: r.content,
        score,
        semanticScore: 0,
        keywordScore: score,
        metadata: { chunkIndex: r.chunkIndex },
        chunkId: r.chunkId
      };
    });
  }

  // Merge results from both searches
  private mergeResults(
    semanticResults: SearchResult[],
    keywordResults: SearchResult[],
    semanticWeight: number,
    keywordWeight: number
  ): SearchResult[] {
    const resultMap = new Map<string, SearchResult>();

    // Add semantic results
    for (const result of semanticResults) {
      resultMap.set(result.chunkId, {
        ...result,
        semanticScore: result.score,
        keywordScore: 0,
        score: result.score * semanticWeight
      });
    }

    // Merge keyword results
    for (const result of keywordResults) {
      const key = result.chunkId;
      const existing = resultMap.get(key);
      
      if (existing) {
        existing.keywordScore = result.keywordScore;
        existing.score = (existing.semanticScore * semanticWeight) +
                          (result.keywordScore * keywordWeight);
      } else {
        resultMap.set(key, {
          ...result,
          semanticScore: 0,
          keywordScore: result.keywordScore,
          score: result.keywordScore * keywordWeight
        });
      }
    }

    // Sort by combined score
    return Array.from(resultMap.values())
      .sort((a, b) => b.score - a.score);
  }

  // Re-rank results using LLM
  private async rerankResults(
    query: string,
    results: SearchResult[],
    limit: number
  ): Promise<SearchResult[]> {
    if (results.length <= limit) return results;

    // Use LLM to score relevance
    const scoringPrompt = `Rate the relevance of each passage to the query on a scale of 0-10.
Query: "${query}"

${results.slice(0, 20).map((r, i) => `[${i}] ${r.content.slice(0, 200)}...`).join('\n\n')}

Return JSON array of scores: [{"index": 0, "score": 8}, ...]`;

    try {
      const response = await this.callLLMForScoring(scoringPrompt);
      const scores = JSON.parse(response);

      // Apply LLM scores
      for (const { index, score } of scores) {
        if (results[index]) {
          results[index].score = (results[index].score + score / 10) / 2;
        }
      }

      return results.sort((a, b) => b.score - a.score).slice(0, limit);
    } catch (error) {
      logger.warn('Re-ranking failed, using original order:', error);
      return results.slice(0, limit);
    }
  }

  private extractKeywords(query: string): string[] {
    const stopWords = new Set([
      'a', 'an', 'the', 'is', 'are', 'was', 'were', 'be', 'been',
      'being', 'have', 'has', 'had', 'do', 'does', 'did', 'will',
      'would', 'could', 'should', 'may', 'might', 'must', 'shall',
      'can', 'need', 'to', 'of', 'in', 'for', 'on', 'with', 'at',
      'by', 'from', 'as', 'into', 'through', 'during', 'before',
      'after', 'above', 'below', 'between', 'under', 'again',
      'what', 'which', 'who', 'whom', 'this', 'that', 'these',
      'those', 'and', 'but', 'if', 'or', 'because', 'until', 'while',
      'about', 'against', 'up', 'down', 'out', 'off', 'over',
      'here', 'there', 'when', 'where', 'why', 'how', 'all',
      'each', 'few', 'more', 'most', 'other', 'some', 'such',
      'no', 'nor', 'not', 'only', 'own', 'same', 'so', 'than',
      'too', 'very', 'just', 'now', 'i', 'me', 'my', 'we', 'our',
      'you', 'your', 'he', 'him', 'his', 'she', 'her', 'it', 'its',
      'they', 'them', 'their'
    ]);

    return query
      .toLowerCase()
      .replace(/[^\w\s]/g, '')
      .split(/\s+/)
      .filter(word => word.length > 2 && !stopWords.has(word));
  }

  private async callLLMForScoring(prompt: string): Promise<string> {
    const { OpenAI } = await import('openai');
    const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
    
    const response = await openai.chat.completions.create({
      model: 'gpt-3.5-turbo',
      messages: [{ role: 'user', content: prompt }],
      temperature: 0,
      max_tokens: 500
    });

    return response.choices[0]?.message?.content || '[]';
  }

  private cosineSimilarity(a: number[], b: number[]): number {
    let dotProduct = 0;
    let normA = 0;
    let normB = 0;

    for (let i = 0; i < a.length; i++) {
      dotProduct += a[i] * b[i];
      normA += a[i] * a[i];
      normB += b[i] * b[i];
    }

    return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));
  }
}

export const hybridSearchService = new HybridSearchService();
