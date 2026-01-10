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
  tokensUsed?: number;
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
  private static readonly maxAnswerTokens = 16384; // maximum limit for comprehensive answers

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

      const prompt = `You are a precision query resolver. Your task is to transform follow-up questions into self-contained, explicit queries by resolving all pronouns and implicit references from conversation history.

========================================
CONVERSATION HISTORY
========================================
${historyText}

========================================
FOLLOW-UP QUESTION TO RESOLVE
========================================
"${currentQuery}"

========================================
RESOLUTION RULES
========================================
1. PRONOUN RESOLUTION: Replace ALL pronouns with their specific referents
   - it, this, that, these, those → specific entity/concept names
   - they, them, their → specific group/list items
   - the amount, the value, the number → actual numeric values with units
   
2. IMPLICIT REFERENCE RESOLUTION: Make all implicit references explicit
   - "the document/file" → actual document name from history
   - "the course/module" → specific course/module name
   - "the price/cost" → specific pricing mentioned
   - "above/previous/mentioned" → specific item referenced

3. CONTEXT PRESERVATION: Keep all context that makes the question answerable
   - If user asks to "convert" something, include: what to convert, from what unit, to what unit
   - If comparing items, include both items being compared
   - If asking "more about X", include what X is

4. INTENT PRESERVATION: Maintain the user's original question intent and scope
   - Don't add information not implied in the original question
   - Don't change the question type (e.g., "what" to "how")
   - Keep the same level of specificity requested

5. CONCISENESS: Make it standalone but not verbose
   - Remove conversational fillers ("um", "so", "well")
   - Combine related elements efficiently
   - Target 10-30 words for most queries

========================================
QUALITY CHECKS
========================================
Before finalizing, verify:
- ✓ No pronouns remain (it, this, that, they, etc.)
- ✓ All implicit references are explicit
- ✓ Question is answerable without prior context
- ✓ Original intent is preserved
- ✓ Length is reasonable (not overly verbose)

========================================
OUTPUT REQUIREMENTS
========================================
Return ONLY the resolved question as plain text.
Do NOT include:
- Explanations of what you changed
- Quotes around the question
- Preambles like "Here is..." or "The resolved question is..."
- Any formatting or punctuation beyond the question itself

RESOLVED QUESTION:`;

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
   * Answer question based on relevant document chunks using GPT-5 or GPT-5-nano.
   * Supports two modes: 'fast' (concise, gpt-5-nano) and 'detail' (comprehensive, gpt-5).
   */
  static async answerQuestion(
    question: string,
    relevantChunks: RelevantChunk[],
    conversationHistory?: Array<{ role: 'user' | 'assistant'; content: string }>,
    mode: 'fast' | 'detail' = 'fast'
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

    // Select model and prompt based on mode
    // Use gpt-4o-mini for fast mode as it's optimized for speed and actually returns content
    // gpt-5-nano is a reasoning model that returns empty content
    const selectedModel = mode === 'fast' ? 'gpt-4o-mini' : this.model;
    const prompt = mode === 'fast' 
      ? this.createFastAnswerPrompt(question, context, orderedChunks, conversationHistory)
      : this.createAnswerPrompt(question, context, orderedChunks, conversationHistory);

    const response = await this.client().chat.completions.create({
      model: selectedModel,
      max_completion_tokens: mode === 'fast' ? 500 : this.maxAnswerTokens,
      temperature: 1,
      messages: [{ role: 'user', content: prompt }],
    });

    const answer = response.choices[0]?.message?.content || '';
    const tokensUsed = response.usage?.total_tokens || 0;
    
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
      tokensUsed,
    };
  }

  /**
   * Summarize a document.
   */
  static async summarizeDocument(content: string, documentName: string): Promise<string> {
    if (!content.trim()) throw new Error('Document content cannot be empty');
    if (!documentName.trim()) throw new Error('Document name cannot be empty');

    const prompt = `You are an expert document analyzer. Your task is to create a comprehensive yet concise summary that captures the essence, key points, and value of the document for quick reference.

========================================
DOCUMENT TO SUMMARIZE
========================================
Document Name: "${documentName}"
Content Length: ${content.length} characters

${content.substring(0, 4000)}${content.length > 4000 ? '\n\n[Content truncated - full document is longer]' : ''}

========================================
SUMMARY REQUIREMENTS
========================================

1. CONTENT COVERAGE:
   - Identify the document's primary purpose and main topic
   - Extract 3-5 most important key points, facts, or takeaways
   - Note the document type (course material, reference doc, guide, policy, etc.)
   - Identify target audience if evident

2. STRUCTURE: Provide summary in 2-3 well-crafted sentences that include:
   - Sentence 1: Document type, main topic, and primary purpose
   - Sentence 2: Key points, important details, or core information
   - Sentence 3 (if needed): Notable specifics, outcomes, or unique value

3. ACCURACY RULES:
   - Base summary ONLY on content provided
   - Use specific terms and names from the document
   - Preserve important numbers, dates, or technical terms
   - Do NOT invent or infer information not present

4. STYLE GUIDELINES:
   - Use clear, professional language
   - Be informative and substantive (avoid vague statements like "covers various topics")
   - Write for someone who needs to quickly decide if this document is relevant
   - Balance brevity with informativeness

========================================
EXAMPLES OF QUALITY SUMMARIES
========================================

POOR: "This document contains information about a course. It covers various topics and includes details."

GOOD: "This is a comprehensive course curriculum for 'Advanced Python Programming', a 12-week intensive program covering data structures, algorithms, web development with Django, and machine learning fundamentals. The document outlines module-by-module learning objectives, prerequisites (basic Python knowledge required), assessment criteria including 3 projects and a final exam, and certification requirements with a minimum 70% pass rate."

========================================
OUTPUT
========================================
Provide ONLY the 2-3 sentence summary, no preamble or additional formatting.

SUMMARY:`;

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
    const prompt = `You are a conversation title generator. Create a concise, descriptive title that captures the core topic of the conversation.

========================================
FIRST MESSAGE
========================================
"${firstMessage.substring(0, 200)}"

========================================
TITLE REQUIREMENTS
========================================

1. LENGTH: Maximum 6 words (strictly enforce)

2. CONTENT RULES:
   - Capture the MAIN topic or question being asked
   - Use specific terms from the message (e.g., actual course names, concepts)
   - Be descriptive enough to identify the conversation later
   - Focus on the subject matter, not the question format

3. STYLE GUIDELINES:
   - Use title case (capitalize main words)
   - Avoid question words (What, How, Why) - state the topic instead
   - Avoid articles (a, an, the) unless necessary for clarity
   - Be specific over generic (e.g., "Python Course Pricing" not "Course Information")

4. EXAMPLES:
   - Message: "What are the prerequisites for the Advanced Data Science course?"
     Good Title: "Advanced Data Science Prerequisites"
     Bad Title: "What Are Course Prerequisites" (too generic, uses question format)
   
   - Message: "How much does the web development bootcamp cost?"
     Good Title: "Web Development Bootcamp Pricing"
     Bad Title: "Bootcamp Cost Question" (vague, uses "question")
   
   - Message: "Tell me about the certification requirements"
     Good Title: "Certification Requirements Overview"
     Bad Title: "Information About Requirements" (too generic)

========================================
OUTPUT
========================================
Return ONLY the title (max 6 words, no quotes, no punctuation, no explanation).

TITLE:`;

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
      const prompt = `You are a search query expansion specialist. Your task is to generate semantically related terms that will improve document retrieval by capturing alternative phrasings, synonyms, and related concepts.

========================================
ORIGINAL QUERY
========================================
"${query}"

========================================
EXPANSION STRATEGY
========================================

1. IDENTIFY CORE CONCEPTS:
   - Extract the main topic, subject, or entity
   - Identify the intent (seeking information, comparison, procedure, etc.)
   - Note any domain-specific terms

2. GENERATE RELATED TERMS (2-3 terms total):
   
   Type A - SYNONYMS & ALTERNATIVE PHRASINGS:
   - Direct synonyms (e.g., "cost" → "price", "pricing", "fee")
   - Common alternative terms (e.g., "course" → "program", "training")
   - Abbreviated and full forms (e.g., "AI" → "artificial intelligence")
   
   Type B - RELATED CONCEPTS:
   - Broader terms (e.g., "Python module" → "Python curriculum")
   - Related aspects (e.g., "enrollment" → "registration", "admission")
   - Domain terminology (e.g., "bootcamp" → "intensive program")
   
   Type C - CONTEXTUAL VARIATIONS:
   - Different question phrasings with same intent
   - Related queries users might also search for
   - Common co-occurring terms in the domain

3. QUALITY CRITERIA:
   - Terms must be semantically related to original query
   - Avoid overly broad terms that would retrieve irrelevant documents
   - Avoid terms that narrow the search scope too much
   - Each term should be 1-4 words maximum
   - Terms should feel natural for document search

4. DOMAIN AWARENESS:
   - For educational content: consider learning, teaching, assessment terms
   - For technical content: consider implementation, configuration, troubleshooting terms
   - For business content: consider process, policy, requirement terms

========================================
EXAMPLES
========================================

Query: "course prerequisites"
Good Expansion: "course requirements, entry requirements, admission criteria"
Bad Expansion: "education, school, learning" (too broad and generic)

Query: "enrollment deadline"
Good Expansion: "registration deadline, admission cutoff, signup due date"
Bad Expansion: "calendar, dates, timeline" (too vague)

Query: "Python certification cost"
Good Expansion: "Python certification price, certification fee, exam cost"
Bad Expansion: "Python, certification, money" (disconnected terms)

========================================
OUTPUT FORMAT
========================================
Return ONLY 2-3 related terms as a comma-separated list.
No quotes, no numbering, no explanation.

Format: term1, term2, term3

RELATED TERMS:`;

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
    const prompt = `You are a precision information retrieval assistant. Your task is to generate ONE strategic clarifying question that will help retrieve the most relevant document passages to answer the user's question with high confidence.

========================================
USER'S QUESTION
========================================
"${question}"
${contextHint ? `\nContext Hint: ${contextHint}` : ''}

========================================
CLARIFYING QUESTION STRATEGY
========================================

1. IDENTIFY AMBIGUITY OR MISSING SPECIFICITY:
   Analyze the user's question for:
   - Vague terms that could refer to multiple things (e.g., "the course" when multiple courses exist)
   - Missing scope or context (e.g., "pricing" without specifying individual vs. corporate)
   - Implicit assumptions that might not hold
   - Multiple possible interpretations of the question
   - Missing parameters needed for a complete answer

2. QUESTION DESIGN PRINCIPLES:
   - Focus on ONE specific aspect that would most improve retrieval accuracy
   - Ask about information that likely exists in the documents
   - Make the question easy to answer (prefer yes/no or multiple choice when possible)
   - Target disambiguation rather than additional detail
   - Keep it conversational and natural

3. PRIORITIZATION (what to clarify first):
   HIGH PRIORITY:
   - Ambiguous entity references ("the program" - which program?)
   - Missing scope specifiers (individual vs. group, beginner vs. advanced)
   - Time-related context (current vs. past offerings, specific cohort)
   
   MEDIUM PRIORITY:
   - Format preferences (online vs. in-person, full-time vs. part-time)
   - Depth of information needed (overview vs. detailed breakdown)
   
   LOW PRIORITY:
   - Optional details that don't affect core answer
   - Personal preferences vs. factual information

4. QUALITY CRITERIA:
   ✓ Addresses the MOST critical ambiguity or gap
   ✓ Can be answered with information likely in the knowledge base
   ✓ Would significantly improve answer quality if answered
   ✓ Is concise (under 20 words)
   ✓ Sounds natural and conversational
   ✗ Don't ask for information already implied in the original question
   ✗ Don't ask multiple questions (use "or" carefully, only for simple either/or)

========================================
EXAMPLES
========================================

User Question: "What's the cost?"
Poor Clarifying Question: "Can you tell me more about what you want to know?" (too vague)
Good Clarifying Question: "Are you asking about the individual enrollment price or corporate training packages?"

User Question: "Tell me about the prerequisites"
Poor Clarifying Question: "What prerequisites do you need?" (just rephrases original)
Good Clarifying Question: "Which course or program are you interested in?"

User Question: "How long does it take?"
Poor Clarifying Question: "What time frame are you looking for?" (vague)
Good Clarifying Question: "Are you asking about the full course duration or the time commitment per week?"

========================================
OUTPUT
========================================
Return ONLY the clarifying question as plain text.
No quotes, no preamble, no explanation.

CLARIFYING QUESTION:`;

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
    const prompt = `You are a conversational flow expert. Based on the Q&A provided, generate 3 natural, relevant follow-up questions that users would logically ask next to deepen their understanding or move forward in their decision-making process.

========================================
ORIGINAL Q&A
========================================
Question: "${query}"

Answer (first 500 chars): "${answer.substring(0, 500)}"

========================================
FOLLOW-UP QUESTION GENERATION STRATEGY
========================================

1. ANALYZE THE ANSWER CONTENT:
   - What topics or concepts were mentioned?
   - What details were provided that might spark related questions?
   - What information might naturally lead to next steps?
   - Were there any limitations, conditions, or prerequisites mentioned?

2. FOLLOW-UP QUESTION TYPES (generate one of each):

   Type A - DEPTH QUESTION (dig deeper into a mentioned topic):
   - Ask for more detail about a specific aspect mentioned in the answer
   - Explore implications or applications of the information
   - Request clarification or examples of concepts mentioned
   Examples:
   - "What are the specific prerequisites for [mentioned course]?"
   - "Can you explain more about [mentioned concept]?"
   - "What does [mentioned term] involve?"

   Type B - RELATED TOPIC QUESTION (explore adjacent information):
   - Ask about related but not directly mentioned aspects
   - Explore complementary information
   - Compare or contrast with alternatives
   Examples:
   - "What about [related aspect]?"
   - "How does this compare to [alternative]?"
   - "Are there options for [related scenario]?"

   Type C - NEXT STEP / ACTION QUESTION (practical follow-up):
   - Ask about practical implementation or next actions
   - Inquire about logistics, timeline, or process
   - Request information needed for decision-making
   Examples:
   - "How do I enroll in [mentioned program]?"
   - "What's the timeline for [mentioned process]?"
   - "Where can I find [mentioned resource]?"

3. QUALITY CRITERIA:
   ✓ Each question should be specific and contextual (reference concepts from the answer)
   ✓ Questions should feel natural and conversational
   ✓ Questions should be answerable with information likely in the knowledge base
   ✓ Vary the question types (don't ask 3 similar questions)
   ✓ Keep questions concise (10-20 words each)
   ✗ Don't ask questions already answered in the provided answer
   ✗ Don't ask vague questions like "Tell me more" or "What else?"
   ✗ Don't ask questions unrelated to the original topic

4. DOMAIN CONTEXT AWARENESS:
   - For course/education queries: consider curriculum, schedule, cost, outcomes, prerequisites
   - For technical queries: consider implementation, troubleshooting, configuration, best practices
   - For policy/process queries: consider exceptions, timeline, requirements, next steps

========================================
EXAMPLES
========================================

Q: "How much does the Python bootcamp cost?"
A: "The Python bootcamp costs $2,999 for individual enrollment, with payment plans available..."

Poor Follow-ups:
- "Tell me more" (too vague)
- "What is Python?" (already off-topic)
- "How much does it cost?" (already answered)

Good Follow-ups:
["What payment plan options are available?", "What does the Python bootcamp curriculum cover?", "How long does the bootcamp take to complete?"]

========================================
OUTPUT FORMAT
========================================
Return ONLY a valid JSON array of exactly 3 strings.
Each string is one follow-up question.
No markdown formatting, no code blocks, no explanation.

Format: ["Question 1?", "Question 2?", "Question 3?"]

JSON ARRAY:`;

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

    // Use more content (up to 5000 chars) for better topic extraction
    const contentSample = content.substring(0, 5000);
    
    const prompt = `You are an expert document classifier and topic extraction specialist. Your task is to analyze the document content and extract 8-15 precise, descriptive topics that best represent the document's content for search, categorization, and retrieval purposes.

========================================
DOCUMENT TO ANALYZE
========================================
Content Length: ${content.length} characters
Sample (first 5000 characters):

${contentSample}${content.length > 5000 ? '\n\n[Document continues beyond this sample...]' : ''}

========================================
TOPIC EXTRACTION STRATEGY
========================================

1. IDENTIFY MULTIPLE TOPIC LAYERS:

   Layer 1 - PRIMARY SUBJECT MATTER (2-3 topics):
   - The main domain or field (e.g., "data science", "web development", "project management")
   - The document type if significant (e.g., "course curriculum", "technical guide", "policy document")
   
   Layer 2 - KEY CONCEPTS & TECHNOLOGIES (3-5 topics):
   - Specific technologies, tools, or frameworks mentioned (e.g., "Python", "Django", "React")
   - Important methodologies or approaches (e.g., "agile methodology", "machine learning")
   - Core concepts central to the content (e.g., "neural networks", "authentication", "pricing models")
   
   Layer 3 - THEMES & FOCUS AREAS (3-5 topics):
   - Specific topics covered (e.g., "data structures", "API development", "certification requirements")
   - Audience or use case if evident (e.g., "beginner level", "professional training")
   - Notable features or aspects (e.g., "hands-on projects", "self-paced learning")

2. TOPIC QUALITY CRITERIA:
   ✓ Use specific terms from the document (preserve exact names, technologies, etc.)
   ✓ Use commonly understood terminology in the domain
   ✓ Balance specificity with searchability
   ✓ Include both broad categories and specific details
   ✓ Use 1-4 word phrases (prefer 2-3 words)
   ✓ Use lowercase for consistency (except proper nouns/acronyms)
   
   ✗ Avoid overly generic terms ("information", "content", "document")
   ✗ Avoid redundant variations ("Python programming" + "Python coding")
   ✗ Avoid full sentences or questions
   ✗ Avoid terms not actually discussed in the content

3. FORMATTING RULES:
   - Use lowercase except for proper nouns and acronyms (e.g., "machine learning", "Python", "AWS")
   - Use singular form when possible (e.g., "module" not "modules")
   - Use common abbreviations when appropriate (e.g., "API" not "Application Programming Interface")
   - Hyphenate compound terms (e.g., "full-stack development", "real-time processing")

4. PRIORITIZATION:
   - Prioritize topics mentioned multiple times or in important sections (titles, headers)
   - Include both what the document IS (type/domain) and what it COVERS (specific topics)
   - Balance breadth (general categories) with depth (specific details)

========================================
EXAMPLES
========================================

POOR TOPICS (for a Python course document):
"education, learning, information, course, program, technology, computer science, teaching"
Problems: Too generic, not specific to the document's actual content

GOOD TOPICS (for a Python course document):
"Python programming, web development, Django framework, data structures, machine learning basics, course curriculum, beginner to intermediate, hands-on projects, certification program, 12-week duration, API development, database design"
Strengths: Specific, varied levels of detail, searchable, descriptive

========================================
OUTPUT FORMAT
========================================
Return ONLY 8-15 topics as a comma-separated list.
No numbering, no bullet points, no quotes, no explanation.

Format: topic1, topic2, topic3, topic4, ...

Ensure you provide between 8 and 15 topics total.

TOPICS:`;

    try {
      const response = await this.client().chat.completions.create({
        model: this.model,
        max_completion_tokens: 500, // Increased from 150 for more comprehensive extraction
        // Note: gpt-5 only supports default temperature (1)
        messages: [{ role: 'user', content: prompt }],
      });

      const topicsText = response.choices[0]?.message?.content || '';
      console.log('[DEBUG] Raw topics response:', topicsText);

      if (!topicsText.trim()) {
        console.warn('[WARN] Empty topics response from GPT');
        return ['general', 'document'];
      }

      // Try to parse comma-separated first
      let topics = topicsText
        .split(',')
        .map(topic => topic.trim())
        .filter(topic => topic.length > 0);

      // If no comma-separated topics found, try splitting by newlines (handles numbered/bulleted lists)
      if (topics.length === 0) {
        topics = topicsText
          .split('\n')
          .map(line => line.replace(/^[\d\.\-\*\)\]]+\s*/, '').trim()) // Remove numbering/bullets
          .filter(topic => topic.length > 0 && topic.length < 100); // Filter out empty and too long lines
      }

      // If still no topics, try to extract words
      if (topics.length === 0) {
        topics = topicsText
          .replace(/[^\w\s,]/g, ' ')
          .split(/\s+/)
          .filter(word => word.length > 3)
          .slice(0, 10);
      }

      // Final fallback
      if (topics.length === 0) {
        console.warn('[WARN] Could not extract any topics, using defaults');
        return ['general', 'document'];
      }

      // Limit to 15 topics and ensure they're reasonable length
      const validTopics = topics
        .slice(0, 15)
        .map(topic => topic.substring(0, 50))
        .filter(topic => topic.length > 0);

      console.log('[INFO] Extracted topics:', validTopics);
      return validTopics;
    } catch (error) {
      console.error('[ERROR] Topic extraction failed:', error);
      // Return default topics instead of throwing
      return ['general', 'document'];
    }
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
   * Fast mode prompt - concise, direct answers optimized for gpt-5-nano.
   */
  private static createFastAnswerPrompt(
    question: string,
    context: string,
    chunks: RelevantChunk[],
    conversationHistory?: Array<{ role: 'user' | 'assistant'; content: string }>
  ): string {
    // Prepare conversation history
    let conversationContext = '';
    if (conversationHistory && conversationHistory.length > 0) {
      const recentHistory = conversationHistory.slice(-3);
      conversationContext = `
CONVERSATION HISTORY:
${recentHistory.map((msg, idx) => `${msg.role === 'user' ? 'User' : 'Assistant'}: ${msg.content.substring(0, 300)}`).join('\n')}

---
`;
    }

    // Prepare retrieved chunks
    const chunksWithMetadata = chunks.map((chunk, index) => 
      `[Source ${index + 1}: ${chunk.documentName}]
${chunk.content}`
    ).join('\n\n---\n\n');

    return `You are a helpful research assistant. Provide concise, accurate answers based on the provided sources.

${conversationContext}SOURCES:
${chunksWithMetadata}

QUESTION: ${question}

INSTRUCTIONS:
- Provide a direct, concise answer in 2-4 sentences
- Use **bold** for key points or headings if needed
- Use bullet points (- item) for lists
- Base your answer ONLY on the provided sources
- If the answer is not in the sources, say so briefly
- Be accurate and to-the-point
- Do NOT include source citations

ANSWER:`;
  }

  /**
   * Prompt used for grounded answering with conditional formatting based on query type.
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

    // Prepare conversation history
    let conversationContext = '';
    if (conversationHistory && conversationHistory.length > 0) {
      const recentHistory = conversationHistory.slice(-4);
      conversationContext = `
CONVERSATION HISTORY (for context - understand follow-up references):
${recentHistory.map((msg, idx) => `[Message ${idx + 1}] ${msg.role === 'user' ? 'User' : 'Assistant'}: ${msg.content.substring(0, 500)}${msg.content.length > 500 ? '...' : ''}`).join('\n\n')}

---
`;
    }

    // Prepare retrieved chunks with metadata (simplified - just document names for cleaner citations)
    const chunksWithMetadata = chunks.map((chunk, index) => 
      `[Source ${index + 1}: ${chunk.documentName}]
${chunk.content}`
    ).join('\n\n---\n\n');
    
    // Create document name mapping for citations
    const docNames = chunks.map(chunk => chunk.documentName);
    const uniqueDocs = [...new Set(docNames)];
    const docCitationGuide = uniqueDocs.map((doc, idx) => `Document: "${doc}"`).join(', ');

    // Detect if this is a sales/course-related query
    const salesKeywords = [
      'course', 'module', 'curriculum', 'enrollment', 'price', 'pricing', 'cost', 
      'certification', 'certificate', 'training', 'learning', 'student', 'prerequisite',
      'schedule', 'duration', 'assessment', 'exam', 'pitch', 'sell', 'sales', 'objection'
    ];
    const isSalesQuery = salesKeywords.some(keyword => 
      question.toLowerCase().includes(keyword) || 
      chunksWithMetadata.toLowerCase().includes(keyword)
    );

    if (isSalesQuery) {
      // SALES ENABLEMENT MODE - Comprehensive course/training assistant
      return `You are a world-class sales enablement research assistant specializing in educational courses and training programs. Your users are sales consultants and trainers who pitch courses to prospective students.

========================================
INPUTS VALIDATION
========================================
Retrieved document chunks: ${chunks.length} chunks provided
Conversation history: ${conversationHistory && conversationHistory.length > 0 ? `${conversationHistory.length} messages` : 'None'}
${relevanceNote}

========================================
CORE OPERATING PRINCIPLES
========================================

COMPLETENESS RULES:
1. Extract and include ALL relevant details from sources - never summarize away important information
2. When questions ask for specific information, provide EVERY detail found in sources
3. For lists and enumerations: Include ALL items mentioned, not just a subset
4. If sources contain numbered lists, bullet points, or step-by-step instructions, preserve COMPLETE structure verbatim
5. When multiple sources contain complementary information, synthesize ALL of it into your response
6. Prioritize ACCURACY and COMPLETENESS over brevity - sales teams need comprehensive, reliable answers

ACCURACY RULES:
1. ALWAYS check conversation history first - if user asks follow-up questions, reference prior context
2. If context doesn't contain relevant information AND conversation history doesn't help, explicitly state: "No information found in provided documents about [specific detail]. Recommended next step: [action]"
3. Only cite sources that DIRECTLY support your statements
4. If confidence is low, acknowledge uncertainty with confidence tags
5. Be helpful and answer user's actual intent, not just literal words
6. Never invent facts not present in provided chunks or conversation history

CONTENT RULES:
- Extract all factual information from sources and present it clearly
- When quoting verbatim, enclose in double quotes
- For each major claim, add confidence tag: (Confidence: High/Medium/Low)
- Preserve original numbered lists and step-by-step instructions verbatim; if paraphrasing for clarity, show verbatim excerpt first, then paraphrase
- NO source citations needed - focus on delivering clean, professional content

CHRONOLOGICAL ORDERING:
- Build canonical chronological flow for course delivery: pre-enrollment → enrollment → onboarding → module sequence → assessments → certification → post-course
- If chronology is ambiguous, present multiple orderings ranked by evidence strength with citations

========================================
CONVERSATION HISTORY
========================================
${conversationContext || 'No prior conversation history available.\n'}
========================================
RETRIEVED KNOWLEDGE BASE CHUNKS
========================================
${chunksWithMetadata}

========================================
CURRENT QUESTION
========================================
${question}

========================================
RESPONSE FORMAT REQUIREMENTS
========================================

Structure your response using these sections with clear headings:

--- SUMMARY ---
Provide 3-6 bullet points with crisp, client-ready highlights

--- QUICK FACTS ---
One-line key values (Course Name, Duration, Price, Certificate, Prerequisites, Enrollment method, etc.)
Present facts clearly without source citations

--- DETAILED EXTRACTION ---

**Course Overview:**
Verbatim high-value sentences quoted from sources

**Curriculum & Chronology:**
Ordered module list with module-level details; preserve original numbering; include durations
Format: Module N: [Name] - [Duration] - [Key topics]

**Assessments & Certification:**
Complete criteria, requirements, and processes

**Pricing, Billing, & Refunds:**
All financial information, payment terms, refund/cancellation policies

**Enrollment & Onboarding Steps:**
Step-by-step instructions; preserve structure verbatim

**Learning Outcomes & Objectives:**
Complete list of what students will learn/achieve

**FAQs & Policies:**
Official answers to common questions

--- SYNTHESIS & CONFIDENCE ASSESSMENT ---
Merge complementary facts from multiple sources
Highlight any conflicts between sources
Format: [Claim] - Confidence: High/Medium/Low

--- SALES ENABLEMENT OUTPUTS ---

**Elevator Pitch (1 line):**
[One compelling sentence with key differentiator]

**30-60 Second Pitch:**
3-5 sentences optimized for phone conversations

**2-3 Minute Pitch:**
Full paragraph with complete value proposition

**Top 5 Selling Points:**
- Bullet list of unique differentiators

**Top 5 Likely Objections & Rebuttals:**
- Objection 1: [objection]
  Rebuttal: [1-2 sentence response]
[Repeat for 5 objections]

**Trainer Briefing Bullets:**
10 concise bullets for internal training sessions

**Call-Ready Checklist:**
- Pre-call preparation items
- Key points to cover
- Closing techniques

**Next-Step Templates:**
Email follow-up subject: [subject line]
Email body: [3-line professional follow-up]
Scheduling script: [2-3 sentences to book demo/consultation]

--- ACTION ITEMS & CLARIFYING QUESTIONS ---
List specific follow-up questions to ask content owners if information is missing or conflicting
Format: "Question: [specific question] - Reason: [why this is needed]"

========================================
FINAL INSTRUCTIONS
========================================
- Use **bold** formatting for ALL section headings (e.g., **2-3 Minute Pitch:** or **Course Overview:**)
- NO source citations - present information cleanly without references
- Use layman-friendly language for consumer-facing content
- Preserve technical/legal terminology when present in sources; provide definitions
- Never hallucinate - if information is missing, explicitly state it and suggest next steps
- When time/token constraints require trimming, truncate lower-confidence details first and indicate: "[TRUNCATED: lower-confidence details omitted]"

BEGIN RESPONSE:`;
    } else {
      // GENERAL KNOWLEDGE MODE - Standard research assistant
      return `You are a hyper-personalized research assistant for the user's personal knowledge base. Your job is to answer questions about THEIR documents with COMPLETENESS, ACCURACY, and clear structure.

========================================
INPUTS PROVIDED
========================================
Retrieved document chunks: ${chunks.length} chunks provided
Conversation history: ${conversationHistory && conversationHistory.length > 0 ? `${conversationHistory.length} messages` : 'None'}
${relevanceNote}

========================================
CRITICAL RULES FOR COMPLETENESS
========================================
1. Extract and include ALL relevant details from sources - do not summarize away important information
2. When questions ask for specific information, provide EVERY detail found in sources
3. For lists and enumerations: Include ALL items mentioned in sources, not just a subset
4. If sources contain numbered lists, bullet points, or step-by-step instructions, preserve COMPLETE structure
5. When multiple sources contain complementary information, synthesize ALL of it into your answer
6. Prioritize ACCURACY and COMPLETENESS over brevity - users need comprehensive answers

========================================
CRITICAL RULES FOR ACCURACY
========================================
1. ALWAYS check conversation history first - if user is asking a follow-up question, use values/data from previous messages
2. If context doesn't contain relevant information AND conversation history doesn't help, say: "I couldn't find specific information about this in your documents."
3. Base all statements on the provided sources
4. If confidence is low, acknowledge uncertainty
5. Be helpful and answer the user's actual intent, not just literal words

========================================
CONVERSATION HISTORY
========================================
${conversationContext || 'No prior conversation history available.\n'}
========================================
RETRIEVED KNOWLEDGE BASE CHUNKS
========================================
${chunksWithMetadata}

========================================
CURRENT QUESTION
========================================
${question}

========================================
RESPONSE FORMAT REQUIREMENTS
========================================

Structure your response with clear headings and subheadings:

--- SUMMARY ---
[2-4 sentence overview of the complete answer]

--- DETAILED ANSWER ---

[Organize content with clear subheadings based on the topic]
[Use this structure to break down complex information:]

**[Main Topic 1]:**
[Complete information from sources]

**[Main Topic 2]:**
[Complete information from sources]

[Continue with additional subheadings as needed - use **bold:** for all subheadings]

--- KEY POINTS ---
- [Bullet point 1]
- [Bullet point 2]
- [Continue for all important points]

========================================
SPECIAL INSTRUCTIONS
========================================

FOR LISTS AND ENUMERATIONS:
- If question asks "what are the..." or "list all..." or "how many...", include EVERY item from sources
- Count items carefully - if a source lists 5 items, your answer must include all 5
- For numbered steps or procedures, include ALL steps in order
- If items span multiple sources, combine them into a complete list
- Explicitly state total count when listing items (e.g., "There are 5 key points:")

CONTENT PRESENTATION:
- NO source citations - present information cleanly without references
- When quoting verbatim, use double quotes
- Base answer primarily on most relevant sources, but include relevant details from ALL sources

FORMATTING:
- Use **bold:** for section headings (e.g., **Course Overview:**, **2-3 Minute Pitch:**)
- Use --- or === for major section separators
- Use bullet points or numbered lists when appropriate
- Preserve original structure from sources (especially numbered lists and procedures)

QUALITY CONTROL:
- Double-check you haven't omitted any important details before finalizing
- Present information comprehensively based on sources
- If information is incomplete or missing, explicitly state what's unavailable

BEGIN RESPONSE:`;
    }
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

