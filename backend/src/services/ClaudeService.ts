import Anthropic from '@anthropic-ai/sdk';
import { OpenAI } from 'openai';

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
   * Generate embeddings for text chunks using OpenAI
   */
  static async generateEmbedding(text: string): Promise<number[]> {
    if (!this.openai) {
      throw new Error('OpenAI service not initialized. Please check your OPENAI_API_KEY.');
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

      return response.data[0].embedding;
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
   * Generate embeddings for multiple texts in batch
   */
  static async generateEmbeddings(texts: string[]): Promise<number[][]> {
    if (!this.openai) {
      throw new Error('OpenAI service not initialized. Please check your OPENAI_API_KEY.');
    }

    if (texts.length === 0) {
      throw new Error('No text provided for embedding generation');
    }

    try {
      console.log(`Generating embeddings for ${texts.length} text chunks`);

      const response = await this.openai.embeddings.create({
        model: 'text-embedding-3-small',
        input: texts,
        encoding_format: 'float',
      });

      if (!response.data || response.data.length === 0) {
        throw new Error('No embedding data received from OpenAI API');
      }

      if (response.data.length !== texts.length) {
        throw new Error(`Embedding count mismatch: expected ${texts.length}, got ${response.data.length}`);
      }

      console.log(`Successfully generated ${response.data.length} embeddings`);
      return response.data.map(item => item.embedding);
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
   * Answer question based on relevant document chunks using Claude
   */
  static async answerQuestion(
    question: string, 
    relevantChunks: RelevantChunk[]
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
      // Prepare context from relevant chunks
      const context = this.prepareContext(relevantChunks);
      
      // Create the prompt for Claude
      const prompt = this.createAnswerPrompt(question, context, relevantChunks);

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
      
      // Calculate confidence based on chunk relevance scores
      const confidence = this.calculateConfidence(relevantChunks);
      
      // Extract unique source documents
      const sources = [...new Set(relevantChunks.map(chunk => chunk.documentName))];

      return {
        answer,
        relevantChunks,
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
   * Create a well-structured prompt for Claude
   */
  private static createAnswerPrompt(
    question: string, 
    context: string, 
    chunks: RelevantChunk[]
  ): string {
    return `You are a helpful assistant that answers questions based on provided document content. Use only the information provided in the context below to answer the question.

CONTEXT:
${context}

QUESTION: ${question}

Instructions:
1. Answer the question based ONLY on the provided context
2. If the context doesn't contain enough information to answer the question, say so
3. Cite which sources you're using by referencing the document names
4. Keep your answer clear and concise
5. If you find conflicting information, mention it

ANSWER:`;
  }

  /**
   * Calculate confidence score based on chunk similarity scores
   */
  private static calculateConfidence(chunks: RelevantChunk[]): number {
    if (chunks.length === 0) return 0;
    
    const avgSimilarity = chunks.reduce((sum, chunk) => sum + chunk.similarity, 0) / chunks.length;
    const topSimilarity = Math.max(...chunks.map(chunk => chunk.similarity));
    
    // Confidence is a weighted average of average and top similarity
    return Math.round((avgSimilarity * 0.3 + topSimilarity * 0.7) * 100);
  }
}