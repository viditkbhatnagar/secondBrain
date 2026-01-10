import OpenAI from 'openai';
import { CategoryModel, ICategory } from '../models/index';
import { GptService } from './GptService';

export interface QueryClassification {
  categories: string[];           // Matched categories (1-3)
  confidence: number;             // Overall confidence
  shouldSearchAll: boolean;       // If true, search all documents (cross-category query)
  reasoning?: string;             // Why these categories were selected
}

export class QueryClassifierService {
  private static openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

  // Cache for categories to avoid repeated DB calls
  private static categoryCache: ICategory[] = [];
  private static cacheExpiry: number = 0;
  private static CACHE_TTL = 5 * 60 * 1000; // 5 minutes

  /**
   * Get categories with caching
   */
  private static async getCategories(): Promise<ICategory[]> {
    const now = Date.now();
    if (this.categoryCache.length > 0 && now < this.cacheExpiry) {
      return this.categoryCache;
    }

    this.categoryCache = await CategoryModel.find({ isActive: true }).exec();
    this.cacheExpiry = now + this.CACHE_TTL;
    return this.categoryCache;
  }

  /**
   * Invalidate category cache (call after category updates)
   */
  static invalidateCache(): void {
    this.categoryCache = [];
    this.cacheExpiry = 0;
  }

  /**
   * Classify a user query to determine which categories to search
   * This is the main entry point - fast and efficient
   */
  static async classifyQuery(query: string): Promise<QueryClassification> {
    const categories = await this.getCategories();

    // If no categories, search all
    if (categories.length === 0) {
      return {
        categories: [],
        confidence: 1.0,
        shouldSearchAll: true,
        reasoning: 'No categories defined'
      };
    }

    // Step 1: Quick keyword matching (very fast, no API call)
    const keywordMatch = this.keywordMatch(query, categories);
    if (keywordMatch.confidence > 0.8) {
      console.log(`🎯 Query classified via keywords: ${keywordMatch.categories.join(', ')}`);
      return keywordMatch;
    }

    // Step 2: Semantic matching using embeddings (fast, uses cached embeddings)
    const semanticMatch = await this.semanticMatch(query, categories);
    if (semanticMatch.confidence > 0.7) {
      console.log(`🎯 Query classified via semantics: ${semanticMatch.categories.join(', ')}`);
      return semanticMatch;
    }

    // Step 3: LLM classification (slower but most accurate)
    const llmMatch = await this.llmClassify(query, categories);
    console.log(`🎯 Query classified via LLM: ${llmMatch.categories.join(', ')}`);
    return llmMatch;
  }

  /**
   * Fast keyword-based classification
   */
  private static keywordMatch(query: string, categories: ICategory[]): QueryClassification {
    const queryLower = query.toLowerCase();
    const queryWords = new Set(queryLower.split(/\s+/).filter(w => w.length > 2));
    const matches: Array<{ category: string; score: number }> = [];

    for (const cat of categories) {
      let score = 0;

      // Check category name in query
      if (queryLower.includes(cat.name.toLowerCase())) {
        score += 0.5;
      }

      // Check keywords
      for (const keyword of cat.keywords || []) {
        const kwLower = keyword.toLowerCase();
        if (queryLower.includes(kwLower)) {
          score += 0.2;
        }
        // Partial word match
        for (const word of queryWords) {
          if (kwLower.includes(word) || word.includes(kwLower)) {
            score += 0.1;
          }
        }
      }

      if (score > 0.1) {
        matches.push({ category: cat.name, score: Math.min(score, 1) });
      }
    }

    if (matches.length === 0) {
      return {
        categories: [],
        confidence: 0,
        shouldSearchAll: true,
        reasoning: 'No keyword matches'
      };
    }

    // Sort by score and take top 2
    matches.sort((a, b) => b.score - a.score);
    const topMatches = matches.slice(0, 2);
    const avgConfidence = topMatches.reduce((sum, m) => sum + m.score, 0) / topMatches.length;

    return {
      categories: topMatches.map(m => m.category),
      confidence: avgConfidence,
      shouldSearchAll: avgConfidence < 0.3,
      reasoning: 'Keyword matching'
    };
  }

  /**
   * Semantic matching using embeddings
   */
  private static async semanticMatch(query: string, categories: ICategory[]): Promise<QueryClassification> {
    try {
      const queryEmbedding = await GptService.generateEmbedding(query);
      const matches: Array<{ category: string; score: number }> = [];

      for (const cat of categories) {
        if (!cat.embedding || cat.embedding.length === 0) continue;

        const similarity = this.cosineSimilarity(queryEmbedding, cat.embedding);
        if (similarity > 0.4) {
          matches.push({ category: cat.name, score: similarity });
        }
      }

      if (matches.length === 0) {
        return {
          categories: [],
          confidence: 0,
          shouldSearchAll: true,
          reasoning: 'No semantic matches above threshold'
        };
      }

      matches.sort((a, b) => b.score - a.score);
      const topMatches = matches.slice(0, 2);
      const avgConfidence = topMatches.reduce((sum, m) => sum + m.score, 0) / topMatches.length;

      return {
        categories: topMatches.map(m => m.category),
        confidence: avgConfidence,
        shouldSearchAll: avgConfidence < 0.5,
        reasoning: 'Semantic embedding matching'
      };
    } catch (error) {
      console.error('Semantic matching error:', error);
      return {
        categories: [],
        confidence: 0,
        shouldSearchAll: true,
        reasoning: 'Semantic matching failed'
      };
    }
  }

  /**
   * LLM-based classification (most accurate but slower)
   */
  private static async llmClassify(query: string, categories: ICategory[]): Promise<QueryClassification> {
    const categoryList = categories.map(c => ({
      name: c.name,
      description: c.description,
      keywords: c.keywords?.slice(0, 5) || []
    }));

    const prompt = `You are a query router for a knowledge base. Determine which category/categories a user's question relates to.

USER QUERY: "${query}"

AVAILABLE CATEGORIES:
${categoryList.map(c => `- ${c.name}: ${c.description} (keywords: ${c.keywords.join(', ') || 'none'})`).join('\n')}

TASK:
1. Analyze the query intent
2. Match to 1-2 most relevant categories
3. If query spans multiple topics or is too general, set shouldSearchAll to true

OUTPUT FORMAT (JSON only):
{
  "categories": ["category1", "category2"],
  "confidence": 0.85,
  "shouldSearchAll": false,
  "reasoning": "Brief explanation"
}

RULES:
- Category names must exactly match the available categories
- Use shouldSearchAll=true for: comparative questions, general overviews, or when unsure
- Confidence should reflect how well the query matches the selected categories

Return ONLY valid JSON.`;

    try {
      const response = await this.openai.chat.completions.create({
        model: 'gpt-4o-mini', // Fast model for routing
        max_tokens: 200,
        temperature: 0.1,
        messages: [{ role: 'user', content: prompt }]
      });

      const raw = response.choices[0]?.message?.content || '{}';
      const parsed = JSON.parse(this.extractJson(raw));

      // Validate categories exist
      const validCategories = (parsed.categories || []).filter((c: string) =>
        categories.some(cat => cat.name.toLowerCase() === c.toLowerCase())
      );

      return {
        categories: validCategories.map((c: string) => c.toLowerCase()),
        confidence: parsed.confidence || 0.5,
        shouldSearchAll: parsed.shouldSearchAll || validCategories.length === 0,
        reasoning: parsed.reasoning
      };
    } catch (error) {
      console.error('LLM classification error:', error);
      return {
        categories: [],
        confidence: 0,
        shouldSearchAll: true,
        reasoning: 'LLM classification failed'
      };
    }
  }

  /**
   * Quick classification - keyword only (for streaming/fast responses)
   */
  static async classifyQueryFast(query: string): Promise<QueryClassification> {
    const categories = await this.getCategories();

    if (categories.length === 0) {
      return {
        categories: [],
        confidence: 1.0,
        shouldSearchAll: true
      };
    }

    // Only use keyword matching for speed
    const result = this.keywordMatch(query, categories);

    // If no good keyword match, check semantic quickly
    if (result.confidence < 0.5) {
      const semantic = await this.semanticMatch(query, categories);
      if (semantic.confidence > result.confidence) {
        return semantic;
      }
    }

    return result;
  }

  /**
   * Cosine similarity helper
   */
  private static cosineSimilarity(a: number[], b: number[]): number {
    if (a.length !== b.length) return 0;

    let dotProduct = 0;
    let normA = 0;
    let normB = 0;

    for (let i = 0; i < a.length; i++) {
      dotProduct += a[i] * b[i];
      normA += a[i] * a[i];
      normB += b[i] * b[i];
    }

    normA = Math.sqrt(normA);
    normB = Math.sqrt(normB);

    if (normA === 0 || normB === 0) return 0;
    return dotProduct / (normA * normB);
  }

  /**
   * Extract JSON from potentially wrapped response
   */
  private static extractJson(s: string): string {
    const start = s.indexOf('{');
    const end = s.lastIndexOf('}');
    return start >= 0 && end >= start ? s.slice(start, end + 1) : '{}';
  }
}
