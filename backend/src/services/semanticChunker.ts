import { OpenAI } from 'openai';
import { logger } from '../utils/logger';

interface SemanticChunk {
  content: string;
  summary: string;
  keywords: string[];
  startIndex: number;
  endIndex: number;
  tokenCount: number;
}

interface ChunkingConfig {
  maxChunkTokens: number;
  minChunkTokens: number;
  overlapTokens: number;
  preserveSentences: boolean;
  generateSummaries: boolean;
}

const DEFAULT_CONFIG: ChunkingConfig = {
  maxChunkTokens: 400,      // ~1600 chars - optimal for ada-002
  minChunkTokens: 100,      // ~400 chars minimum
  overlapTokens: 50,        // ~200 chars overlap
  preserveSentences: true,
  generateSummaries: false  // Disabled by default for speed
};

export class SemanticChunker {
  private openai: OpenAI | null = null;

  private getOpenAI(): OpenAI {
    if (!this.openai) {
      this.openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
    }
    return this.openai;
  }

  async chunkDocument(
    content: string,
    config: Partial<ChunkingConfig> = {}
  ): Promise<SemanticChunk[]> {
    const cfg = { ...DEFAULT_CONFIG, ...config };
    const startTime = Date.now();

    // Step 1: Clean and normalize text
    const cleanedContent = this.cleanText(content);

    // Step 2: Split into sentences
    const sentences = this.splitIntoSentences(cleanedContent);

    // Step 3: Group sentences into semantic chunks
    const chunks = this.groupIntoChunks(sentences, cfg);

    // Step 4: Add overlap between chunks
    const overlappedChunks = this.addOverlap(chunks, cfg.overlapTokens);

    // Step 5: Generate summaries if enabled
    const finalChunks = cfg.generateSummaries
      ? await this.addSummaries(overlappedChunks)
      : overlappedChunks.map(c => ({ ...c, summary: '', keywords: [] }));

    logger.info(`Document chunked in ${Date.now() - startTime}ms`, {
      originalLength: content.length,
      chunkCount: finalChunks.length,
      avgChunkSize: Math.round(content.length / finalChunks.length)
    });

    return finalChunks;
  }

  private cleanText(text: string): string {
    return text
      .replace(/\r\n/g, '\n')
      .replace(/\n{3,}/g, '\n\n')
      .replace(/[^\S\n]+/g, ' ')
      .trim();
  }

  private splitIntoSentences(text: string): string[] {
    // Advanced sentence splitting that handles abbreviations
    const sentenceRegex = /[^.!?\n]+[.!?]+(?:\s|$)|[^.!?\n]+$/g;
    const sentences = text.match(sentenceRegex) || [text];
    
    return sentences
      .map(s => s.trim())
      .filter(s => s.length > 10);
  }

  private groupIntoChunks(
    sentences: string[],
    config: ChunkingConfig
  ): Array<{ content: string; startIndex: number; endIndex: number; tokenCount: number }> {
    const chunks: Array<{ content: string; startIndex: number; endIndex: number; tokenCount: number }> = [];
    
    let currentChunk: string[] = [];
    let currentTokens = 0;
    let startIndex = 0;
    let currentIndex = 0;

    for (let i = 0; i < sentences.length; i++) {
      const sentence = sentences[i];
      const sentenceTokens = this.estimateTokens(sentence);

      // Check if adding this sentence exceeds max tokens
      if (currentTokens + sentenceTokens > config.maxChunkTokens && currentChunk.length > 0) {
        // Save current chunk
        chunks.push({
          content: currentChunk.join(' '),
          startIndex,
          endIndex: currentIndex,
          tokenCount: currentTokens
        });

        // Start new chunk
        currentChunk = [sentence];
        currentTokens = sentenceTokens;
        startIndex = currentIndex;
      } else {
        currentChunk.push(sentence);
        currentTokens += sentenceTokens;
      }

      currentIndex += sentence.length + 1;
    }

    // Add remaining chunk
    if (currentChunk.length > 0) {
      chunks.push({
        content: currentChunk.join(' '),
        startIndex,
        endIndex: currentIndex,
        tokenCount: currentTokens
      });
    }

    return chunks;
  }

  private addOverlap(
    chunks: Array<{ content: string; startIndex: number; endIndex: number; tokenCount: number }>,
    overlapTokens: number
  ): Array<{ content: string; startIndex: number; endIndex: number; tokenCount: number }> {
    if (chunks.length <= 1) return chunks;

    return chunks.map((chunk, index) => {
      let content = chunk.content;

      // Add context from previous chunk
      if (index > 0) {
        const prevContent = chunks[index - 1].content;
        const overlapText = this.getLastNTokens(prevContent, overlapTokens);
        content = `[Previous: ${overlapText}...]\n\n${content}`;
      }

      // Add context from next chunk
      if (index < chunks.length - 1) {
        const nextContent = chunks[index + 1].content;
        const overlapText = this.getFirstNTokens(nextContent, overlapTokens);
        content = `${content}\n\n[Continues: ${overlapText}...]`;
      }

      return { ...chunk, content };
    });
  }

  private async addSummaries(
    chunks: Array<{ content: string; startIndex: number; endIndex: number; tokenCount: number }>
  ): Promise<SemanticChunk[]> {
    // Batch process summaries for efficiency
    const batchSize = 5;
    const results: SemanticChunk[] = [];

    for (let i = 0; i < chunks.length; i += batchSize) {
      const batch = chunks.slice(i, i + batchSize);
      
      const summaries = await Promise.all(
        batch.map(chunk => this.generateChunkMetadata(chunk.content))
      );

      batch.forEach((chunk, idx) => {
        results.push({
          ...chunk,
          summary: summaries[idx].summary,
          keywords: summaries[idx].keywords
        });
      });
    }

    return results;
  }

  private async generateChunkMetadata(content: string): Promise<{ summary: string; keywords: string[] }> {
    try {
      const response = await this.getOpenAI().chat.completions.create({
        model: 'gpt-3.5-turbo',
        messages: [
          {
            role: 'system',
            content: 'Generate a one-sentence summary and 3-5 keywords for this text. Return JSON: {"summary": "...", "keywords": ["k1", "k2"]}'
          },
          { role: 'user', content: content.slice(0, 1000) }
        ],
        temperature: 0,
        max_tokens: 100,
        response_format: { type: 'json_object' }
      });

      return JSON.parse(response.choices[0]?.message?.content || '{"summary":"","keywords":[]}');
    } catch {
      return { summary: content.slice(0, 100), keywords: [] };
    }
  }

  private estimateTokens(text: string): number {
    // Rough estimation: ~4 chars per token for English
    return Math.ceil(text.length / 4);
  }

  private getLastNTokens(text: string, n: number): string {
    const chars = n * 4;
    return text.slice(-chars);
  }

  private getFirstNTokens(text: string, n: number): string {
    const chars = n * 4;
    return text.slice(0, chars);
  }

  // Quick chunking without LLM calls - for speed
  quickChunk(content: string, maxChunkSize: number = 1500): string[] {
    const sentences = this.splitIntoSentences(this.cleanText(content));
    const chunks: string[] = [];
    let currentChunk: string[] = [];
    let currentSize = 0;

    for (const sentence of sentences) {
      if (currentSize + sentence.length > maxChunkSize && currentChunk.length > 0) {
        chunks.push(currentChunk.join(' '));
        currentChunk = [sentence];
        currentSize = sentence.length;
      } else {
        currentChunk.push(sentence);
        currentSize += sentence.length;
      }
    }

    if (currentChunk.length > 0) {
      chunks.push(currentChunk.join(' '));
    }

    return chunks;
  }
}

export const semanticChunker = new SemanticChunker();
