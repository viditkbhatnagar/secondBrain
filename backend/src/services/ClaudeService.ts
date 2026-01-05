import Anthropic from '@anthropic-ai/sdk';
import { OpenAI } from 'openai';
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
  lowConfidence?: boolean; // Flag for fallback results when threshold not met (Requirements 5.5)
}

export class ClaudeService {
  private static anthropic: Anthropic;
  private static openai: OpenAI;

  /**
   * Initialize the Claude service
   */
  static initialize() {
    if (!process.env.ANTHROPIC_API_KEY) {
      throw new Error('ANTHROPIC_API_KEY is required in environment variables');
    }

    if (!process.env.OPENAI_API_KEY) {
      throw new Error('OPENAI_API_KEY is required in environment variables for embeddings');
    }

    this.anthropic = new Anthropic({
      apiKey: process.env.ANTHROPIC_API_KEY,
    });

    this.openai = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY,
    });

    console.log('Claude and OpenAI services initialized successfully');
  }

  /**
   * Generate embeddings for text chunks using OpenAI with caching
   */
  static async generateEmbedding(text: string): Promise<number[]> {
    if (!this.openai) {
      throw new Error('OpenAI service not initialized. Please check your OPENAI_API_KEY.');
    }

    // Check cache first (now async with Redis support)
    const cached = await EmbeddingCache.get(text);
    if (cached) {
      return cached;
    }

    try {
      const response = await this.openai.embeddings.create({
        model: 'text-embedding-3-small',
        input: text,
        encoding_format: 'float',
      });

      if (!response.data || response.data.length === 0) {
        throw new Error('No embedding data received from OpenAI API');
      }

      const embedding = response.data[0].embedding;
      
      // Cache the result (async with Redis support)
      await EmbeddingCache.set(text, embedding);
      
      return embedding;
    } catch (error: any) {
      if (error.status === 401) {
        throw new Error('OpenAI API authentication failed. Please check your OPENAI_API_KEY.');
      } else if (error.status === 429) {
        throw new Error('OpenAI API rate limit exceeded. Please try again later.');
      } else if (error.status === 402) {
        throw new Error('OpenAI API quota exceeded. Please add credits to your account.');
      }
      
      throw new Error(`OpenAI embedding generation failed: ${error.message}`);
    }
  }

  /**
   * Generate embeddings for multiple texts in batch with caching
   */
  static async generateEmbeddings(texts: string[]): Promise<number[][]> {
    if (!this.openai) {
      throw new Error('OpenAI service not initialized. Please check your OPENAI_API_KEY.');
    }

    if (texts.length === 0) {
      throw new Error('No text provided for embedding generation');
    }

    try {
      // Check cache for each text (now async)
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

      // If all cached, return immediately
      if (uncachedTexts.length === 0) {
        logger.debug(`All ${texts.length} embeddings served from cache`);
        return results as number[][];
      }

      logger.debug(`Generating ${uncachedTexts.length} embeddings (${texts.length - uncachedTexts.length} cached)`);

      const response = await this.openai.embeddings.create({
        model: 'text-embedding-3-small',
        input: uncachedTexts,
        encoding_format: 'float',
      });

      if (!response.data || response.data.length === 0) {
        throw new Error('No embedding data received from OpenAI API');
      }

      if (response.data.length !== uncachedTexts.length) {
        throw new Error(`Embedding count mismatch: expected ${uncachedTexts.length}, got ${response.data.length}`);
      }

      // Cache new embeddings and fill in results (async)
      await Promise.all(response.data.map(async (item, i) => {
        const originalIndex = uncachedIndices[i];
        const embedding = item.embedding;
        results[originalIndex] = embedding;
        await EmbeddingCache.set(uncachedTexts[i], embedding);
      }));

      logger.debug(`Successfully generated ${response.data.length} embeddings`);
      return results as number[][];
    } catch (error: any) {
      if (error.status === 401) {
        throw new Error('OpenAI API authentication failed. Please check your OPENAI_API_KEY.');
      } else if (error.status === 429) {
        throw new Error('OpenAI API rate limit exceeded. Please try again later.');
      } else if (error.status === 402) {
        throw new Error('OpenAI API quota exceeded. Please add credits to your account.');
      }
      
      throw new Error(`OpenAI batch embedding generation failed: ${error.message}`);
    }
  }

  /**
   * Conversation message for context
   */
  static formatConversationHistory(history: Array<{ role: 'user' | 'assistant'; content: string }>): string {
    if (!history || history.length === 0) return '';
    
    // Take last 6 messages for context (3 exchanges)
    const recentHistory = history.slice(-6);
    
    return recentHistory.map(msg => 
      `${msg.role === 'user' ? 'User' : 'Assistant'}: ${msg.content.substring(0, 500)}${msg.content.length > 500 ? '...' : ''}`
    ).join('\n\n');
  }

  /**
   * Resolve pronouns and references in follow-up questions
   * Returns both the resolved query AND the original for hybrid search
   * 
   * Requirements 4.6: Resolve pronouns (it, this, that, these, those) when conversation history exists
   */
  static async resolveFollowUpQuery(
    currentQuery: string,
    conversationHistory: Array<{ role: 'user' | 'assistant'; content: string }>
  ): Promise<{ resolvedQuery: string; isFollowUp: boolean; searchQueries: string[] }> {
    if (!this.anthropic || !conversationHistory || conversationHistory.length === 0) {
      return { resolvedQuery: currentQuery, isFollowUp: false, searchQueries: [currentQuery] };
    }

    // Enhanced pronoun and reference patterns for follow-up detection (Requirements 4.6)
    const followUpPatterns = [
      // Basic pronouns
      /\b(it|its|itself)\b/i,
      /\b(this|that|these|those)\b/i,
      /\b(they|them|their|theirs|themselves)\b/i,
      /\b(he|him|his|himself|she|her|hers|herself)\b/i,
      
      // Reference phrases
      /\b(the same|same thing|same one)\b/i,
      /\b(above|previous|mentioned|earlier|last)\b/i,
      /\b(the one|that one|this one)\b/i,
      
      // Conversational follow-ups
      /\b(what about|how about|and what|and how)\b/i,
      /\b(also|too|as well|in addition)\b/i,
      /\b(more|another|other|else)\b/i,
      
      // Action references
      /\b(convert it|change it|update it|modify it|delete it|remove it)\b/i,
      /\b(do that|do this|do the same)\b/i,
      /\b(show me|tell me more|explain)\b/i,
      
      // Quantity/value references
      /\b(the amount|the value|the number|the total|the sum)\b/i,
      /\b(the fee|the cost|the price|the rate)\b/i,
      /\b(the payment|the balance|the result)\b/i,
      
      // Document/content references
      /\b(the document|the file|the section|the part)\b/i,
      /\b(the answer|the response|the information)\b/i,
      
      // Comparison references
      /\b(compared to|versus|vs|instead of)\b/i,
      /\b(better|worse|different|similar)\b/i,
      
      // Continuation patterns
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

      const prompt = `Given this conversation history and the user's follow-up question, I need you to:
1. Identify what the user is referring to (the specific values, amounts, entities mentioned in previous messages)
2. Rewrite the question to be self-contained and explicit

CONVERSATION HISTORY:
${historyText}

FOLLOW-UP QUESTION: "${currentQuery}"

INSTRUCTIONS:
- Replace ALL pronouns (it, this, that, they, them, the amount, etc.) with the ACTUAL VALUES or ENTITIES from the conversation
- If the user asks to "convert" something, include the SPECIFIC amount and currency from the previous answer
- If the user refers to "the document" or "the file", include the actual document name
- If the user says "more" or "also", include what they want more of
- Make the question standalone so it can be understood without context
- Keep the intent of the original question
- Be specific with numbers, names, and values
- If multiple things could be referenced, choose the most recent/relevant one

Examples:
- If previous answer mentioned "34,913.0024 USD" and user asks "convert it to AED", rewrite as "convert 34,913.0024 USD to AED"
- If previous answer discussed "Project Alpha" and user asks "what about the deadline?", rewrite as "what is the deadline for Project Alpha?"
- If user asks "and the budget?" after discussing a project, rewrite as "what is the budget for [project name]?"

REWRITTEN QUESTION (return ONLY the rewritten question, nothing else):`;

      const response = await this.anthropic.messages.create({
        model: 'claude-3-haiku-20240307',
        max_tokens: 200,
        temperature: 0.1,
        messages: [{ role: 'user', content: prompt }]
      });

      const resolved = response.content[0].type === 'text' ? response.content[0].text.trim() : currentQuery;
      
      // Only use resolved if it's meaningfully different and not too long
      if (resolved && resolved.length > 0 && resolved.length < 500 && resolved !== currentQuery) {
        console.log(`Query resolved: "${currentQuery}" -> "${resolved}"`);
        // Return both queries for hybrid search - original for document retrieval, resolved for context
        return { 
          resolvedQuery: resolved, 
          isFollowUp: true, 
          searchQueries: [resolved, currentQuery] // Search with both
        };
      }
      
      return { resolvedQuery: currentQuery, isFollowUp: true, searchQueries: [currentQuery] };
    } catch (error: any) {
      console.warn('Query resolution failed:', error.message);
      return { resolvedQuery: currentQuery, isFollowUp: true, searchQueries: [currentQuery] };
    }
  }

  /**
   * Answer question based on relevant document chunks using Claude
   * Now supports conversation history for context
   * Uses ContextAssembler to order chunks by document position (Requirements 4.2)
   */
  static async answerQuestion(
    question: string, 
    relevantChunks: RelevantChunk[],
    conversationHistory?: Array<{ role: 'user' | 'assistant'; content: string }>
  ): Promise<SearchResult> {
    if (!this.anthropic) {
      throw new Error('Claude service not initialized. Please check your ANTHROPIC_API_KEY.');
    }

    if (!question.trim()) {
      throw new Error('Question cannot be empty');
    }

    if (relevantChunks.length === 0) {
      throw new Error('No relevant document chunks provided for answering question');
    }

    try {
      // Use ContextAssembler to order chunks by document position (Requirements 4.2)
      const assembler = new ContextAssembler({ maxChunks: 6, orderByPosition: true });
      const assembled = assembler.assemble(relevantChunks as ChunkWithPosition[]);
      const orderedChunks = assembled.chunks;
      
      // Prepare context from ordered chunks
      const context = this.prepareContext(orderedChunks);
      
      // Create the prompt for Claude with conversation history
      const prompt = this.createAnswerPrompt(question, context, orderedChunks, conversationHistory);

      // Get response from Claude
      const response = await this.anthropic.messages.create({
        model: 'claude-3-haiku-20240307',
        max_tokens: 1000,
        temperature: 0.3,
        messages: [{
          role: 'user',
          content: prompt
        }]
      });

      if (!response.content || response.content.length === 0) {
        throw new Error('No response received from Claude API');
      }

      const answer = response.content[0].type === 'text' ? response.content[0].text : '';
      
      if (!answer.trim()) {
        throw new Error('Empty response received from Claude API');
      }
      
      // Calculate confidence based on chunk relevance scores (use ordered chunks)
      const confidence = this.calculateConfidence(orderedChunks);
      
      // Add low confidence disclaimer if needed (Requirements 6.3)
      const validator = new AnswerValidator();
      const finalAnswer = validator.addDisclaimerIfNeeded(answer, confidence);
      
      // Extract unique source documents from ordered chunks
      const sources = [...new Set(orderedChunks.map(chunk => chunk.documentName))];

      return {
        answer: finalAnswer,
        relevantChunks: orderedChunks,
        confidence,
        sources
      };
    } catch (error: any) {
      if (error.status === 401) {
        throw new Error('Claude API authentication failed. Please check your ANTHROPIC_API_KEY.');
      } else if (error.status === 429) {
        throw new Error('Claude API rate limit exceeded. Please try again later.');
      } else if (error.status === 400 && error.error?.error?.message?.includes('credit balance')) {
        throw new Error('Claude API credit balance too low. Please add credits to your Anthropic account.');
      } else if (error.status === 404) {
        throw new Error('Claude model not found. The API may have been updated.');
      }
      
      throw new Error(`Claude question answering failed: ${error.message}`);
    }
  }

  /**
   * Summarize a document using Claude
   */
  static async summarizeDocument(content: string, documentName: string): Promise<string> {
    if (!this.anthropic) {
      throw new Error('Claude service not initialized. Please check your ANTHROPIC_API_KEY.');
    }

    if (!content.trim()) {
      throw new Error('Document content cannot be empty');
    }

    if (!documentName.trim()) {
      throw new Error('Document name cannot be empty');
    }

    try {
      const prompt = `Please provide a concise summary of the following document titled "${documentName}":

${content.substring(0, 4000)}${content.length > 4000 ? '...' : ''}

Provide a clear, informative summary in 2-3 sentences.`;

      const response = await this.anthropic.messages.create({
        model: 'claude-3-haiku-20240307',
        max_tokens: 300,
        temperature: 0.3,
        messages: [{
          role: 'user',
          content: prompt
        }]
      });

      if (!response.content || response.content.length === 0) {
        throw new Error('No summary received from Claude API');
      }

      const summary = response.content[0].type === 'text' ? response.content[0].text : '';
      
      if (!summary.trim()) {
        throw new Error('Empty summary received from Claude API');
      }

      return summary;
    } catch (error: any) {
      if (error.status === 401) {
        throw new Error('Claude API authentication failed. Please check your ANTHROPIC_API_KEY.');
      } else if (error.status === 429) {
        throw new Error('Claude API rate limit exceeded. Please try again later.');
      } else if (error.status === 400 && error.error?.error?.message?.includes('credit balance')) {
        throw new Error('Claude API credit balance too low. Please add credits to your Anthropic account.');
      }
      
      throw new Error(`Claude document summarization failed: ${error.message}`);
    }
  }

  /**
   * Generate a short title for a chat thread based on the first message
   */
  static async generateThreadTitle(firstMessage: string): Promise<string> {
    if (!this.anthropic) {
      throw new Error('Claude service not initialized. Please check your ANTHROPIC_API_KEY.');
    }

    try {
      const prompt = `Generate a short, descriptive title (max 6 words) for a conversation that starts with: "${firstMessage.substring(0, 200)}". Return ONLY the title, no quotes, no explanation.`;

      const response = await this.anthropic.messages.create({
        model: 'claude-3-haiku-20240307',
        max_tokens: 30,
        temperature: 0.3,
        messages: [{ role: 'user', content: prompt }]
      });

      const title = response.content[0].type === 'text' ? response.content[0].text.trim() : '';
      return title || firstMessage.substring(0, 30);
    } catch (error: any) {
      console.warn('Failed to generate thread title:', error.message);
      return firstMessage.substring(0, 30);
    }
  }

  /**
   * Expand query with related terms for better retrieval
   */
  static async expandQuery(query: string): Promise<string> {
    if (!this.anthropic) {
      return query;
    }

    try {
      const prompt = `Given this search query, generate 2-3 related search terms or synonyms that would help find relevant documents. Return as comma-separated list only, no explanation.

Query: "${query}"

Related terms:`;

      const response = await this.anthropic.messages.create({
        model: 'claude-3-haiku-20240307',
        max_tokens: 50,
        temperature: 0.3,
        messages: [{ role: 'user', content: prompt }]
      });

      const expansion = response.content[0].type === 'text' ? response.content[0].text.trim() : '';
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
   * Generate a concise clarifying question to improve retrieval
   */
  static async generateClarifyingQuestion(question: string, contextHint?: string): Promise<string> {
    if (!this.anthropic) {
      throw new Error('Claude service not initialized. Please check your ANTHROPIC_API_KEY.');
    }

    const prompt = `Your task is to craft one short clarifying question that would help retrieve more relevant passages to answer the user's question with high confidence.

User question: "${question}"
${contextHint ? `Context hint: ${contextHint}\n` : ''}

Return only the clarifying question.`;

    try {
      const response = await this.anthropic.messages.create({
        model: 'claude-3-haiku-20240307',
        max_tokens: 80,
        temperature: 0.3,
        messages: [{ role: 'user', content: prompt }]
      });

      const text = response.content[0].type === 'text' ? response.content[0].text : '';
      return text.trim();
    } catch (error: any) {
      throw new Error(`Claude clarifying question generation failed: ${error.message}`);
    }
  }

  /**
   * Generate related follow-up questions based on Q&A
   */
  static async generateRelatedQuestions(query: string, answer: string): Promise<string[]> {
    if (!this.anthropic) {
      throw new Error('Claude service not initialized. Please check your ANTHROPIC_API_KEY.');
    }

    const prompt = `Based on this Q&A, suggest 3 natural follow-up questions the user might ask.

Question: "${query}"
Answer: "${answer.substring(0, 500)}"

Return ONLY a JSON array of 3 strings (questions), no explanation or markdown:`;

    try {
      const response = await this.anthropic.messages.create({
        model: 'claude-3-haiku-20240307',
        max_tokens: 200,
        temperature: 0.7,
        messages: [{ role: 'user', content: prompt }]
      });

      const text = response.content[0].type === 'text' ? response.content[0].text.trim() : '';
      
      // Try to parse as JSON
      try {
        const questions = JSON.parse(text);
        if (Array.isArray(questions) && questions.length > 0) {
          return questions.slice(0, 3);
        }
      } catch {
        // If JSON parsing fails, try to extract questions manually
        const lines = text.split('\n').filter(line => line.trim().length > 0);
        const questions = lines
          .map(line => line.replace(/^[-*•]\s*/, '').replace(/^["']|["']$/g, '').trim())
          .filter(q => q.length > 0)
          .slice(0, 3);
        
        if (questions.length > 0) {
          return questions;
        }
      }

      // Fallback questions
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
   * Extract key topics and tags from document content
   */
  static async extractTopics(content: string): Promise<string[]> {
    if (!this.anthropic) {
      throw new Error('Claude service not initialized. Please check your ANTHROPIC_API_KEY.');
    }

    if (!content.trim()) {
      throw new Error('Document content cannot be empty for topic extraction');
    }

    try {
      const prompt = `Analyze the following text and extract 5-10 key topics or tags that best represent the content. Return only the topics as a comma-separated list:

${content.substring(0, 2000)}${content.length > 2000 ? '...' : ''}

Topics:`;

      const response = await this.anthropic.messages.create({
        model: 'claude-3-haiku-20240307',
        max_tokens: 100,
        temperature: 0.3,
        messages: [{
          role: 'user',
          content: prompt
        }]
      });

      if (!response.content || response.content.length === 0) {
        throw new Error('No topics received from Claude API');
      }

      const topicsText = response.content[0].type === 'text' ? response.content[0].text : '';
      
      if (!topicsText.trim()) {
        throw new Error('Empty topics response received from Claude API');
      }

      const topics = topicsText.split(',').map(topic => topic.trim()).filter(topic => topic.length > 0);
      
      if (topics.length === 0) {
        throw new Error('No valid topics extracted from document');
      }

      return topics;
    } catch (error: any) {
      if (error.status === 401) {
        throw new Error('Claude API authentication failed. Please check your ANTHROPIC_API_KEY.');
      } else if (error.status === 429) {
        throw new Error('Claude API rate limit exceeded. Please try again later.');
      } else if (error.status === 400 && error.error?.error?.message?.includes('credit balance')) {
        throw new Error('Claude API credit balance too low. Please add credits to your Anthropic account.');
      }
      
      throw new Error(`Claude topic extraction failed: ${error.message}`);
    }
  }

  /**
   * Prepare context string from relevant chunks
   */
  private static prepareContext(chunks: RelevantChunk[]): string {
    return chunks
      .map((chunk, index) => 
        `[Source ${index + 1}: ${chunk.documentName}]\n${chunk.content}\n`
      )
      .join('\n---\n\n');
  }

  /**
   * IMPROVED: Create a well-structured prompt for Claude with better grounding and conversation context
   * Enhanced for completeness per Requirements 4.3, 4.4, 6.5
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

    // Include conversation history if available
    let conversationContext = '';
    if (conversationHistory && conversationHistory.length > 0) {
      const recentHistory = conversationHistory.slice(-4); // Last 2 exchanges
      conversationContext = `
CONVERSATION HISTORY (for context - understand what "it", "that", "the amount" etc. refer to):
${recentHistory.map(msg => `${msg.role === 'user' ? 'User' : 'Assistant'}: ${msg.content.substring(0, 400)}${msg.content.length > 400 ? '...' : ''}`).join('\n\n')}

---
`;
    }

    return `You are a hyper-personalized research assistant for the user's personal knowledge base. Your job is to answer questions about THEIR documents with COMPLETENESS and precision.

CRITICAL RULES FOR COMPLETENESS (Requirements 4.3, 4.4, 6.5):
1. Extract and include ALL relevant details from the sources - do not summarize away important information
2. When the question asks for specific information, provide EVERY detail found in the sources
3. For lists and enumerations: Include ALL items mentioned in the sources, not just a subset
4. If sources contain numbered lists, bullet points, or step-by-step instructions, preserve the COMPLETE structure
5. When multiple sources contain complementary information, synthesize ALL of it into your answer
6. Prioritize ACCURACY and COMPLETENESS over brevity - users need comprehensive answers

CRITICAL RULES FOR ACCURACY:
1. ALWAYS check the conversation history first - if the user is asking a follow-up question, use the values/data from previous messages
2. For conversion questions: Use the EXACT values from the conversation history, not from documents
3. If the context doesn't contain relevant information AND conversation history doesn't help, say "I couldn't find specific information about this in your documents."
4. Only cite sources that DIRECTLY support your statements
5. If confidence is low, acknowledge uncertainty
6. Be helpful and try to answer the user's actual intent, not just the literal words

${conversationContext}CONTEXT FROM USER'S DOCUMENTS (sorted by relevance - most relevant first):
${chunks.map((chunk, index) => 
  `[Source ${index + 1}] (Relevance: ${Math.round(chunk.similarity * 100)}%) - ${chunk.documentName}
${chunk.content}
`).join('\n---\n\n')}
${relevanceNote}

CURRENT QUESTION: ${question}

SPECIAL INSTRUCTIONS FOR LISTS AND ENUMERATIONS (Requirement 6.5):
- If the question asks "what are the..." or "list all..." or "how many...", ensure you include EVERY item from the sources
- Count items carefully - if a source lists 5 items, your answer must include all 5
- For numbered steps or procedures, include ALL steps in order
- If items span multiple sources, combine them into a complete list
- Explicitly state the total count when listing items (e.g., "There are 5 key points:")

SPECIAL INSTRUCTIONS FOR FOLLOW-UP QUESTIONS:
- If the user asks to "convert" something, look at the CONVERSATION HISTORY for the specific amount
- If the user says "it", "that", "the amount", refer to the most recent relevant value in the conversation
- For currency conversions: If you have the amount from conversation history, you can use general knowledge for exchange rates OR look for rates in the documents

GENERAL INSTRUCTIONS:
- Base your answer PRIMARILY on Source 1 and Source 2 (highest relevance), but include relevant details from ALL sources
- Cite sources as [1], [2], etc. when making specific claims from documents
- Structure your answer clearly - use bullet points or numbered lists when appropriate
- Be proactive: if you can provide additional helpful information from the sources, do so
- Double-check that you haven't omitted any important details before finalizing your answer

ANSWER:`;
  }

  /**
   * IMPROVED: Multi-factor confidence calculation
   */
  private static calculateConfidence(chunks: RelevantChunk[]): number {
    if (chunks.length === 0) return 0;
    
    // Factor 1: Top chunk similarity (most important)
    const topSimilarity = chunks[0]?.similarity || 0;
    
    // Factor 2: How many chunks are highly relevant?
    const highRelevanceCount = chunks.filter(c => c.similarity > 0.65).length;
    const relevanceDensity = Math.min(highRelevanceCount / 3, 1);
    
    // Factor 3: Score spread (if top 3 are all high, more confident)
    const top3 = chunks.slice(0, 3);
    const top3Avg = top3.reduce((s, c) => s + c.similarity, 0) / Math.max(top3.length, 1);
    
    // Factor 4: Source diversity (multiple docs = more confident)
    const uniqueDocs = new Set(chunks.map(c => c.documentId)).size;
    const diversityBonus = Math.min(uniqueDocs / 3, 1) * 0.1;
    
    // Combined formula
    let confidence = (
      topSimilarity * 0.4 +           // 40% weight on best match
      top3Avg * 0.3 +                  // 30% weight on top 3 average
      relevanceDensity * 0.2 +         // 20% weight on how many good matches
      diversityBonus                   // 10% bonus for multiple sources
    );
    
    // Scale to percentage
    confidence = Math.round(confidence * 100);
    
    // Apply minimum thresholds based on top result quality
    if (topSimilarity > 0.8 && confidence < 75) confidence = 75;
    if (topSimilarity > 0.7 && confidence < 65) confidence = 65;
    if (topSimilarity > 0.6 && confidence < 55) confidence = 55;
    
    // Cap at 99%
    return Math.min(confidence, 99);
  }
}