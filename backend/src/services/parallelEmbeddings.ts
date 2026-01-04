import { OpenAI } from 'openai';
import { aggressiveCache } from './aggressiveCache';
import { logger } from '../utils/logger';

interface EmbeddingRequest {
  text: string;
  resolve: (embedding: number[]) => void;
  reject: (error: Error) => void;
}

export class ParallelEmbeddingService {
  private openai: OpenAI | null = null;
  private queue: EmbeddingRequest[] = [];
  private processing = false;
  private readonly BATCH_SIZE = 100;  // OpenAI limit
  private readonly BATCH_DELAY = 10;  // ms to wait for batching
  private batchTimeout: NodeJS.Timeout | null = null;

  private getOpenAI(): OpenAI {
    if (!this.openai) {
      this.openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
    }
    return this.openai;
  }

  // Get single embedding with caching and batching
  async getEmbedding(text: string): Promise<number[]> {
    const normalizedText = this.normalizeText(text);

    // Check cache first
    const cached = await aggressiveCache.getEmbedding(normalizedText);
    if (cached) {
      return cached;
    }

    // Add to batch queue
    return new Promise((resolve, reject) => {
      this.queue.push({ text: normalizedText, resolve, reject });
      this.scheduleBatch();
    });
  }

  // Get multiple embeddings efficiently
  async getEmbeddings(texts: string[]): Promise<number[][]> {
    const normalizedTexts = texts.map(t => this.normalizeText(t));
    const results: (number[] | null)[] = new Array(texts.length).fill(null);
    const uncachedIndices: number[] = [];
    const uncachedTexts: string[] = [];

    // Check cache for all texts
    await Promise.all(
      normalizedTexts.map(async (text, index) => {
        const cached = await aggressiveCache.getEmbedding(text);
        if (cached) {
          results[index] = cached;
        } else {
          uncachedIndices.push(index);
          uncachedTexts.push(text);
        }
      })
    );

    // Generate embeddings for uncached texts
    if (uncachedTexts.length > 0) {
      const newEmbeddings = await this.generateBatchEmbeddings(uncachedTexts);
      
      // Cache and update results
      await Promise.all(
        uncachedIndices.map(async (resultIndex, i) => {
          results[resultIndex] = newEmbeddings[i];
          await aggressiveCache.cacheEmbedding(uncachedTexts[i], newEmbeddings[i]);
        })
      );
    }

    return results as number[][];
  }

  private normalizeText(text: string): string {
    return text
      .toLowerCase()
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, 8000);
  }

  private scheduleBatch(): void {
    if (this.batchTimeout) return;

    this.batchTimeout = setTimeout(() => {
      this.processBatch();
    }, this.BATCH_DELAY);
  }

  private async processBatch(): Promise<void> {
    this.batchTimeout = null;
    
    if (this.queue.length === 0 || this.processing) return;
    
    this.processing = true;

    // Take items from queue
    const batch = this.queue.splice(0, this.BATCH_SIZE);
    
    try {
      const embeddings = await this.generateBatchEmbeddings(
        batch.map(r => r.text)
      );

      // Resolve all promises and cache
      batch.forEach((request, index) => {
        request.resolve(embeddings[index]);
        aggressiveCache.cacheEmbedding(request.text, embeddings[index]);
      });

    } catch (error) {
      // Reject all promises
      batch.forEach(request => {
        request.reject(error as Error);
      });
    }

    this.processing = false;

    // Process remaining items
    if (this.queue.length > 0) {
      this.scheduleBatch();
    }
  }

  private async generateBatchEmbeddings(texts: string[]): Promise<number[][]> {
    const startTime = Date.now();

    try {
      const response = await this.getOpenAI().embeddings.create({
        model: 'text-embedding-ada-002',
        input: texts
      });

      logger.info(`Generated ${texts.length} embeddings in ${Date.now() - startTime}ms`);

      return response.data.map(d => d.embedding);

    } catch (error) {
      logger.error('Batch embedding generation failed:', error);
      throw error;
    }
  }

  // Cosine similarity calculation
  cosineSimilarity(a: number[], b: number[]): number {
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

export const parallelEmbeddings = new ParallelEmbeddingService();
