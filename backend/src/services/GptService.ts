import OpenAI from 'openai';
import { EmbeddingCache } from '../utils/cache';
import { logger } from '../utils/logger';
import { ContextAssembler, ChunkWithPosition } from './contextAssembler';
import { AnswerValidator, LOW_CONFIDENCE_DISCLAIMER } from './answerValidator';

export interface SearchResult {
  answer: string;
  relevantChunks: RelevantChunk[];
  confidence: number;
  sources: string[];
}

export interface RelevantChunk {
  content: string;
  documentName: string;
  documentId: string;
  chunkId: string;
  similarity: number;
  lowConfidence?: boolean;
}

/**
 * GPT-5 backed LLM service (replaces former Claude service).
 * All generative calls use OpenAI chat completions with the gpt-5 model.
 */
export class GptService {
  private static openai: OpenAI;
  private static readonly model = 'gpt-5';
  private static readonly maxAnswerTokens = 12000; // use a very high limit for completeness

  /**
   * Initialize the GPT service
   */
  static initialize() {
    if (!process.env.OPENAI_API_KEY) {
      throw new Error('OPENAI_API_KEY is required in environment variables');
    }

    this.openai = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY,
    });

    console.log('GPT service initialized successfully');
  }

  private static client(): OpenAI {
    if (!this.openai) {
      throw new Error('GPT service not initialized. Please check your OPENAI_API_KEY.');
    }
    return this.openai;
  }

  /**
   * Generate an embedding for a single text with caching.
   */
  static async generateEmbedding(text: string): Promise<number[]> {
    const cached = await EmbeddingCache.get(text);
    if (cached) return cached;

    const response = await this.client().embeddings.create({
      model: 'text-embedding-3-small',
      input: text,
      encoding_format: 'float',
    });

    const embedding = response.data?.[0]?.embedding;
    if (!embedding) throw new Error('No embedding data received from OpenAI API');

    await EmbeddingCache.set(text, embedding);
    return embedding;
  }

  /**
   * Generate embeddings for multiple texts with caching.
   */
  static async generateEmbeddings(texts: string[]): Promise<number[][]> {
    if (texts.length === 0) throw new Error('No text provided for embedding generation');

    const cacheResults = await Promise.all(texts.map(text => EmbeddingCache.get(text)));
    const results: (number[] | null)[] = cacheResults.map(r => r || null);
    const uncachedIndices: number[] = [];
    const uncachedTexts: string[] = [];

    results.forEach((result, index) => {
      if (result === null) {
        uncachedIndices.push(index);
        uncachedTexts.push(texts[index]);
      }
    });

    if (uncachedTexts.length === 0) {
      logger.debug(`All ${texts.length} embeddings served from cache`);
      return results as number[][];
    }

    const response = await this.client().embeddings.create({
      model: 'text-embedding-3-small',
      input: uncachedTexts,
      encoding_format: 'float',
    });

    if (!response.data || response.data.length !== uncachedTexts.length) {
      throw new Error('Embedding count mismatch from OpenAI API');
    }

    await Promise.all(response.data.map(async (item, i) => {
      const originalIndex = uncachedIndices[i];
      const embedding = item.embedding;
      results[originalIndex] = embedding;
      await EmbeddingCache.set(uncachedTexts[i], embedding);
    }));

    logger.debug(`Successfully generated ${response.data.length} embeddings`);
    return results as number[][];
  }

  /**
   * Conversation history formatter (last 3 exchanges).
   */
  static formatConversationHistory(history: Array<{ role: 'user' | 'assistant'; content: string }>): string {
    if (!history || history.length === 0) return '';
    const recentHistory = history.slice(-6);
    return recentHistory.map(msg =>
      `${msg.role === 'user' ? 'User' : 'Assistant'}: ${msg.content.substring(0, 500)}${msg.content.length > 500 ? '...' : ''}`
    ).join('\n\n');
  }

  /**
   * Resolve pronouns and references in follow-up questions.
   */
  static async resolveFollowUpQuery(
    currentQuery: string,
    conversationHistory: Array<{ role: 'user' | 'assistant'; content: string }>
  ): Promise<{ resolvedQuery: string; isFollowUp: boolean; searchQueries: string[] }> {
    if (!conversationHistory || conversationHistory.length === 0) {
      return { resolvedQuery: currentQuery, isFollowUp: false, searchQueries: [currentQuery] };
    }

    const followUpPatterns = [
      /\b(it|its|itself)\b/i,
      /\b(this|that|these|those)\b/i,
      /\b(they|them|their|theirs|themselves)\b/i,
      /\b(the same|same thing|same one)\b/i,
      /\b(above|previous|mentioned|earlier|last)\b/i,
      /\b(the one|that one|this one)\b/i,
      /\b(what about|how about|and what|and how)\b/i,
      /\b(also|too|as well|in addition)\b/i,
      /\b(more|another|other|else)\b/i,
      /\b(convert it|change it|update it|modify it|delete it|remove it)\b/i,
      /\b(do that|do this|do the same)\b/i,
      /\b(the amount|the value|the number|the total|the sum)\b/i,
      /\b(the document|the file|the section|the part)\b/i,
      /\b(the answer|the response|the information)\b/i,
      /\b(compared to|versus|vs|instead of)\b/i,
      /^(and|but|so|then|also|however)\b/i,
      /^(why|how come|what if)\b/i,
    ];

    const isFollowUp = followUpPatterns.some(pattern => pattern.test(currentQuery));
    if (!isFollowUp) {
      return { resolvedQuery: currentQuery, isFollowUp: false, searchQueries: [currentQuery] };
    }

    try {
      const recentHistory = conversationHistory.slice(-4);
      const historyText = recentHistory.map(msg =>
        `${msg.role === 'user' ? 'User' : 'Assistant'}: ${msg.content.substring(0, 800)}`
      ).join('\n\n');

      const prompt = `Given this conversation history and the user's follow-up question, rewrite the question to be self-contained and explicit.
CONVERSATION HISTORY:
${historyText}

FOLLOW-UP QUESTION: "${currentQuery}"

Instructions:
- Replace all pronouns (it, this, that, they, them, the amount, etc.) with the actual values/entities from the conversation
- Include the specific amount/currency if user asks to "convert" something
- Include document names if referring to "the document/file"
- Make the question standalone
- Keep intent; be concise

Return ONLY the rewritten question, nothing else.`;

      const response = await this.client().chat.completions.create({
        model: this.model,
        max_completion_tokens: 12000,
        temperature: 1,
        messages: [{ role: 'user', content: prompt }],
      });

      const resolved = response.choices[0]?.message?.content?.trim() || currentQuery;
      if (resolved && resolved.length > 0 && resolved.length < 500 && resolved !== currentQuery) {
        return {
          resolvedQuery: resolved,
          isFollowUp: true,
          searchQueries: [resolved, currentQuery],
        };
      }
      return { resolvedQuery: currentQuery, isFollowUp: true, searchQueries: [currentQuery] };
    } catch (error: any) {
      console.warn('Query resolution failed:', error.message);
      return { resolvedQuery: currentQuery, isFollowUp: true, searchQueries: [currentQuery] };
    }
  }

  /**
   * Answer question based on relevant document chunks using GPT-5.
   */
  static async answerQuestion(
    question: string,
    relevantChunks: RelevantChunk[],
    conversationHistory?: Array<{ role: 'user' | 'assistant'; content: string }>
  ): Promise<SearchResult> {
    if (!question.trim()) {
      throw new Error('Question cannot be empty');
    }
    if (relevantChunks.length === 0) {
      throw new Error('No relevant document chunks provided for answering question');
    }

    // Assemble context
    const assembler = new ContextAssembler({ maxChunks: 10, orderByPosition: true });
    const assembled = assembler.assemble(relevantChunks as ChunkWithPosition[]);
    const orderedChunks = assembled.chunks;
    const context = this.prepareContext(orderedChunks);

    const prompt = this.createAnswerPrompt(question, context, orderedChunks, conversationHistory);

    const response = await this.client().chat.completions.create({
      model: this.model,
      max_completion_tokens: this.maxAnswerTokens,
      temperature: 1,
      messages: [{ role: 'user', content: prompt }],
    });

    const answer = response.choices[0]?.message?.content || '';
    if (!answer.trim()) {
      throw new Error('Empty response received from OpenAI API');
    }

    const confidence = this.calculateConfidence(orderedChunks);
    const validator = new AnswerValidator();
    const finalAnswer = validator.addDisclaimerIfNeeded(answer, confidence);
    const sources = [...new Set(orderedChunks.map(chunk => chunk.documentName))];

    return {
      answer: finalAnswer,
      relevantChunks: orderedChunks,
      confidence,
      sources,
    };
  }

  /**
   * Summarize a document.
   */
  static async summarizeDocument(content: string, documentName: string): Promise<string> {
    if (!content.trim()) throw new Error('Document content cannot be empty');
    if (!documentName.trim()) throw new Error('Document name cannot be empty');

    const prompt = `Please provide a concise summary of the following document titled "${documentName}":

${content.substring(0, 4000)}${content.length > 4000 ? '...' : ''}

Provide a clear, informative summary in 2-3 sentences.`;

      const response = await this.client().chat.completions.create({
        model: this.model,
        max_completion_tokens: 12000,
        temperature: 1,
        messages: [{ role: 'user', content: prompt }],
      });

    const summary = response.choices[0]?.message?.content?.trim() || '';
    if (!summary) throw new Error('Empty summary received from OpenAI API');
    return summary;
  }

  /**
   * Generate a short title for a chat thread based on the first message.
   */
  static async generateThreadTitle(firstMessage: string): Promise<string> {
    const prompt = `Generate a short, descriptive title (max 6 words) for a conversation that starts with: "${firstMessage.substring(0, 200)}". Return ONLY the title, no quotes, no explanation.`;

    try {
      const response = await this.client().chat.completions.create({
        model: this.model,
        max_completion_tokens: 20,
        temperature: 1,
        messages: [{ role: 'user', content: prompt }],
      });
      const title = response.choices[0]?.message?.content?.trim() || '';
      return title || firstMessage.substring(0, 30);
    } catch (error: any) {
      console.warn('Failed to generate thread title:', error.message);
      return firstMessage.substring(0, 30);
    }
  }

  /**
   * Expand query with related terms for better retrieval.
   */
  static async expandQuery(query: string): Promise<string> {
    try {
      const prompt = `Given this search query, generate 2-3 related search terms or synonyms that would help find relevant documents. Return as comma-separated list only, no explanation.

Query: "${query}"

Related terms:`;

      const response = await this.client().chat.completions.create({
        model: this.model,
        max_completion_tokens: 60,
        temperature: 1,
        messages: [{ role: 'user', content: prompt }],
      });

      const expansion = response.choices[0]?.message?.content?.trim() || '';
      if (expansion && expansion.length > 0 && expansion.length < 100) {
        return `${query} ${expansion}`;
      }
      return query;
    } catch (error: any) {
      console.warn('Query expansion failed:', error.message);
      return query;
    }
  }

  /**
   * Generate a concise clarifying question to improve retrieval.
   */
  static async generateClarifyingQuestion(question: string, contextHint?: string): Promise<string> {
    const prompt = `Your task is to craft one short clarifying question that would help retrieve more relevant passages to answer the user's question with high confidence.

User question: "${question}"
${contextHint ? `Context hint: ${contextHint}\n` : ''}

Return only the clarifying question.`;

    const response = await this.client().chat.completions.create({
      model: this.model,
      max_completion_tokens: 80,
      temperature: 1,
      messages: [{ role: 'user', content: prompt }],
    });

    return response.choices[0]?.message?.content?.trim() || '';
  }

  /**
   * Generate related follow-up questions based on Q&A.
   */
  static async generateRelatedQuestions(query: string, answer: string): Promise<string[]> {
    const prompt = `Based on this Q&A, suggest 3 natural follow-up questions the user might ask.

Question: "${query}"
Answer: "${answer.substring(0, 500)}"

Return ONLY a JSON array of 3 strings (questions), no explanation or markdown:`;

    try {
      const response = await this.client().chat.completions.create({
        model: this.model,
        max_completion_tokens: 200,
        temperature: 1,
        messages: [{ role: 'user', content: prompt }],
      });

      const text = response.choices[0]?.message?.content?.trim() || '';
      try {
        const parsed = JSON.parse(text);
        if (Array.isArray(parsed) && parsed.length > 0) {
          return parsed.slice(0, 3);
        }
      } catch {
        const lines = text.split('\n').filter(line => line.trim().length > 0);
        const questions = lines
          .map(line => line.replace(/^[-*•]\s*/, '').replace(/^["']|["']$/g, '').trim())
          .filter(q => q.length > 0)
          .slice(0, 3);
        if (questions.length > 0) return questions;
      }

      return [
        'Can you provide more details?',
        'What are the implications?',
        'Are there any alternatives?',
      ];
    } catch (error: any) {
      console.error('Related questions generation failed:', error.message);
      return [
        'Can you provide more details?',
        'What are the implications?',
        'Are there any alternatives?',
      ];
    }
  }

  /**
   * Extract key topics and tags from document content.
   */
  static async extractTopics(content: string): Promise<string[]> {
    if (!content.trim()) {
      throw new Error('Document content cannot be empty for topic extraction');
    }

    const prompt = `Analyze the following text and extract 5-10 key topics or tags that best represent the content. Return only the topics as a comma-separated list:

${content.substring(0, 2000)}${content.length > 2000 ? '...' : ''}

Topics:`;

    const response = await this.client().chat.completions.create({
      model: this.model,
      max_completion_tokens: 100,
      temperature: 1,
      messages: [{ role: 'user', content: prompt }],
    });

    const topicsText = response.choices[0]?.message?.content || '';
    const topics = topicsText.split(',').map(topic => topic.trim()).filter(topic => topic.length > 0);
    if (topics.length === 0) {
      throw new Error('No valid topics extracted from document');
    }
    return topics;
  }

  /**
   * Prepare context string from relevant chunks.
   */
  private static prepareContext(chunks: RelevantChunk[]): string {
    return chunks
      .map((chunk, index) =>
        `[Source ${index + 1}: ${chunk.documentName}]\n${chunk.content}\n`
      )
      .join('\n---\n\n');
  }

  /**
   * Prompt used for grounded answering.
   */
  private static createAnswerPrompt(
    question: string,
    context: string,
    chunks: RelevantChunk[],
    conversationHistory?: Array<{ role: 'user' | 'assistant'; content: string }>
  ): string {
    const topRelevance = chunks[0]?.similarity || 0;
    const relevanceNote = topRelevance < 0.5
      ? '\n⚠️ Note: The retrieved sources have relatively low relevance scores. Express appropriate uncertainty in your answer.'
      : '';

    let conversationContext = '';
    if (conversationHistory && conversationHistory.length > 0) {
      const recentHistory = conversationHistory.slice(-4);
      conversationContext = `
CONVERSATION HISTORY (for context - understand what "it", "that", "the amount" etc. refer to):
${recentHistory.map(msg => `${msg.role === 'user' ? 'User' : 'Assistant'}: ${msg.content.substring(0, 400)}${msg.content.length > 400 ? '...' : ''}`).join('\n\n')}

---
`;
    }

    return `You are a hyper-personalized research assistant for the user's personal knowledge base. Your job is to answer questions about THEIR documents with COMPLETENESS and precision.

CRITICAL RULES FOR COMPLETENESS:
1. Extract and include ALL relevant details from the sources - do not summarize away important information
2. When the question asks for specific information, provide EVERY detail found in the sources
3. For lists and enumerations: Include ALL items mentioned in the sources, not just a subset
4. If sources contain numbered lists, bullet points, or step-by-step instructions, preserve the COMPLETE structure
5. When multiple sources contain complementary information, synthesize ALL of it into your answer
6. Prioritize ACCURACY and COMPLETENESS over brevity - users need comprehensive answers

CRITICAL RULES FOR ACCURACY:
1. ALWAYS check the conversation history first - if the user is asking a follow-up question, use the values/data from previous messages
2. If the context doesn't contain relevant information AND conversation history doesn't help, say "I couldn't find specific information about this in your documents."
3. Only cite sources that DIRECTLY support your statements
4. If confidence is low, acknowledge uncertainty
5. Be helpful and try to answer the user's actual intent, not just the literal words

${conversationContext}CONTEXT FROM USER'S DOCUMENTS (sorted by relevance - most relevant first):
${chunks.map((chunk, index) =>
  `[Source ${index + 1}] (Relevance: ${Math.round(chunk.similarity * 100)}%) - ${chunk.documentName}
${chunk.content}
`).join('\n---\n\n')}
${relevanceNote}

CURRENT QUESTION: ${question}

SPECIAL INSTRUCTIONS FOR LISTS AND ENUMERATIONS:
- If the question asks "what are the..." or "list all..." or "how many...", ensure you include EVERY item from the sources
- Count items carefully - if a source lists 5 items, your answer must include all 5
- For numbered steps or procedures, include ALL steps in order
- If items span multiple sources, combine them into a complete list
- Explicitly state the total count when listing items (e.g., "There are 5 key points:")

GENERAL INSTRUCTIONS:
- Base your answer primarily on the most relevant sources, but include relevant details from ALL sources
- Cite sources as [1], [2], etc. when making specific claims from documents
- Structure your answer clearly - use bullet points or numbered lists when appropriate
- Double-check that you haven't omitted any important details before finalizing your answer

ANSWER:`;
  }

  /**
   * Multi-factor confidence calculation.
   */
  private static calculateConfidence(chunks: RelevantChunk[]): number {
    if (chunks.length === 0) return 0;

    const topSimilarity = chunks[0]?.similarity || 0;
    const highRelevanceCount = chunks.filter(c => c.similarity > 0.65).length;
    const relevanceDensity = Math.min(highRelevanceCount / 3, 1);
    const top3 = chunks.slice(0, 3);
    const top3Avg = top3.reduce((s, c) => s + c.similarity, 0) / Math.max(top3.length, 1);
    const uniqueDocs = new Set(chunks.map(c => c.documentId)).size;
    const diversityBonus = Math.min(uniqueDocs / 3, 1) * 0.1;

    let confidence = (
      topSimilarity * 0.4 +
      top3Avg * 0.3 +
      relevanceDensity * 0.2 +
      diversityBonus
    );

    confidence = Math.round(confidence * 100);
    if (topSimilarity > 0.8 && confidence < 75) confidence = 75;
    if (topSimilarity > 0.7 && confidence < 65) confidence = 65;
    if (topSimilarity > 0.6 && confidence < 55) confidence = 55;

    return Math.min(confidence, 99);
  }
}

export const gptService = GptService;

