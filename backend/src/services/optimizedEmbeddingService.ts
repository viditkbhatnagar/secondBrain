import { OpenAI } from 'openai';
import { cacheService } from './cacheService';
import { logger } from '../utils/logger';

export class OptimizedEmbeddingService {
  private openai: OpenAI | null = null;
  private pendingBatch: Map<string, { resolve: Function; reject: Function }> = new Map();
  private batchTexts: string[] = [];
  private batchTimeout: NodeJS.Timeout | null = null;
  private readonly BATCH_SIZE = 50;
  private readonly BATCH_DELAY = 50; // ms

  private getOpenAI(): OpenAI {
    if (!this.openai) {
      this.openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
    }
    return this.openai;
  }

  // Get embedding with caching and batching
  async getEmbedding(text: string): Promise<number[]> {
    // Normalize text
    const normalizedText = this.normalizeText(text);

    // Check cache first
    const cached = await cacheService.getEmbedding(normalizedText);
    if (cached) {
      return cached;
    }

    // Add to batch
    return this.addToBatch(normalizedText);
  }

  // Get embeddings for multiple texts
  async getEmbeddings(texts: string[]): Promise<number[][]> {
    const normalizedTexts = texts.map(t => this.normalizeText(t));
    
    // Check cache for all
    const results: (number[] | null)[] = await Promise.all(
      normalizedTexts.map(t => cacheService.getEmbedding(t))
    );

    // Find uncached texts
    const uncachedIndices: number[] = [];
    const uncachedTexts: string[] = [];
    
    results.forEach((result, index) => {
      if (!result) {
        uncachedIndices.push(index);
        uncachedTexts.push(normalizedTexts[index]);
      }
    });

    // Generate embeddings for uncached texts
    if (uncachedTexts.length > 0) {
      const newEmbeddings = await this.generateBatchEmbeddings(uncachedTexts);
      
      // Cache new embeddings and update results
      uncachedIndices.forEach((resultIndex, i) => {
        results[resultIndex] = newEmbeddings[i];
        cacheService.cacheEmbedding(uncachedTexts[i], newEmbeddings[i]);
      });
    }

    return results as number[][];
  }

  private normalizeText(text: string): string {
    return text
      .toLowerCase()
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, 8000); // OpenAI limit
  }

  private addToBatch(text: string): Promise<number[]> {
    return new Promise((resolve, reject) => {
      this.pendingBatch.set(text, { resolve, reject });
      this.batchTexts.push(text);

      // Process batch if full
      if (this.batchTexts.length >= this.BATCH_SIZE) {
        this.processBatch();
      } else {
        // Set timeout for partial batch
        if (!this.batchTimeout) {
          this.batchTimeout = setTimeout(() => this.processBatch(), this.BATCH_DELAY);
        }
      }
    });
  }

  private async processBatch(): Promise<void> {
    if (this.batchTimeout) {
      clearTimeout(this.batchTimeout);
      this.batchTimeout = null;
    }

    if (this.batchTexts.length === 0) return;

    const textsToProcess = [...this.batchTexts];
    const pending = new Map(this.pendingBatch);

    this.batchTexts = [];
    this.pendingBatch.clear();

    try {
      const embeddings = await this.generateBatchEmbeddings(textsToProcess);

      textsToProcess.forEach((text, index) => {
        const callbacks = pending.get(text);
        if (callbacks) {
          callbacks.resolve(embeddings[index]);
          // Cache the embedding
          cacheService.cacheEmbedding(text, embeddings[index]);
        }
      });
    } catch (error) {
      // Reject all pending
      for (const callbacks of pending.values()) {
        callbacks.reject(error);
      }
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
      logger.error('Batch embedding failed:', error);
      throw error;
    }
  }

  // Calculate similarity between embeddings
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

export const optimizedEmbeddingService = new OptimizedEmbeddingService();
