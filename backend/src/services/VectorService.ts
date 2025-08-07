import { ClaudeService, RelevantChunk } from './ClaudeService';
import { DocumentChunk } from './FileProcessor';

export interface StoredVector {
  id: string;
  documentId: string;
  documentName: string;
  chunkId: string;
  content: string;
  embedding: number[];
  metadata: {
    chunkIndex: number;
    wordCount: number;
    createdAt: Date;
  };
}

export class VectorService {
  private static vectors: Map<string, StoredVector> = new Map();

  /**
   * Initialize the vector service
   */
  static async initialize(): Promise<void> {
    console.log('Vector service initialized');
    // In a production app, you'd connect to a vector database here
  }

  /**
   * Store document chunks as vectors
   */
  static async storeDocumentChunks(
    chunks: DocumentChunk[], 
    documentName: string
  ): Promise<void> {
    try {
      // Extract text content for embedding generation
      const texts = chunks.map(chunk => chunk.content);
      
      // Generate embeddings in batch for efficiency
      const embeddings = await ClaudeService.generateEmbeddings(texts);

      // Store each chunk with its embedding
      for (let i = 0; i < chunks.length; i++) {
        const chunk = chunks[i];
        const embedding = embeddings[i];

        const storedVector: StoredVector = {
          id: `vector_${chunk.id}`,
          documentId: chunk.documentId,
          documentName,
          chunkId: chunk.id,
          content: chunk.content,
          embedding,
          metadata: {
            chunkIndex: chunk.chunkIndex,
            wordCount: chunk.wordCount,
            createdAt: new Date()
          }
        };

        this.vectors.set(storedVector.id, storedVector);
      }

      console.log(`Stored ${chunks.length} chunks for document: ${documentName}`);
    } catch (error) {
      console.error('Error storing document chunks:', error);
      throw new Error('Failed to store document chunks');
    }
  }

  /**
   * Search for similar chunks based on query
   */
  static async searchSimilar(
    query: string, 
    limit: number = 5,
    minSimilarity: number = 0.5
  ): Promise<RelevantChunk[]> {
    try {
      // Generate embedding for the query
      const queryEmbedding = await ClaudeService.generateEmbedding(query);

      // Calculate similarity scores for all stored vectors
      const similarities: Array<{ vector: StoredVector; similarity: number }> = [];

      for (const vector of this.vectors.values()) {
        const similarity = this.cosineSimilarity(queryEmbedding, vector.embedding);
        
        if (similarity >= minSimilarity) {
          similarities.push({ vector, similarity });
        }
      }

      // Sort by similarity (highest first) and limit results
      similarities.sort((a, b) => b.similarity - a.similarity);
      const topResults = similarities.slice(0, limit);

      // Convert to RelevantChunk format
      const relevantChunks: RelevantChunk[] = topResults.map(result => ({
        content: result.vector.content,
        documentName: result.vector.documentName,
        documentId: result.vector.documentId,
        chunkId: result.vector.chunkId,
        similarity: result.similarity
      }));

      console.log(`Found ${relevantChunks.length} relevant chunks for query: "${query}"`);
      return relevantChunks;
    } catch (error) {
      console.error('Error searching similar chunks:', error);
      throw new Error('Failed to search similar chunks');
    }
  }

  /**
   * Get all documents with their chunk counts
   */
  static getDocumentStats(): Array<{ documentId: string; documentName: string; chunkCount: number }> {
    const stats = new Map<string, { documentName: string; chunkCount: number }>();

    for (const vector of this.vectors.values()) {
      const existing = stats.get(vector.documentId);
      if (existing) {
        existing.chunkCount++;
      } else {
        stats.set(vector.documentId, {
          documentName: vector.documentName,
          chunkCount: 1
        });
      }
    }

    return Array.from(stats.entries()).map(([documentId, info]) => ({
      documentId,
      documentName: info.documentName,
      chunkCount: info.chunkCount
    }));
  }

  /**
   * Delete all vectors for a document
   */
  static deleteDocument(documentId: string): number {
    let deletedCount = 0;
    
    for (const [vectorId, vector] of this.vectors.entries()) {
      if (vector.documentId === documentId) {
        this.vectors.delete(vectorId);
        deletedCount++;
      }
    }

    console.log(`Deleted ${deletedCount} vectors for document: ${documentId}`);
    return deletedCount;
  }

  /**
   * Clear all stored vectors
   */
  static clearAll(): number {
    const count = this.vectors.size;
    this.vectors.clear();
    console.log(`Cleared ${count} vectors`);
    return count;
  }

  /**
   * Get total vector count
   */
  static getVectorCount(): number {
    return this.vectors.size;
  }

  /**
   * Calculate cosine similarity between two vectors
   */
  private static cosineSimilarity(a: number[], b: number[]): number {
    if (a.length !== b.length) {
      throw new Error('Vectors must have the same length');
    }

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

    if (normA === 0 || normB === 0) {
      return 0;
    }

    return dotProduct / (normA * normB);
  }

  /**
   * Find similar documents (not chunks) based on query
   */
  static async findSimilarDocuments(
    query: string, 
    limit: number = 3
  ): Promise<Array<{ documentId: string; documentName: string; avgSimilarity: number }>> {
    const chunks = await this.searchSimilar(query, 20, 0.3); // Get more chunks with lower threshold
    
    // Group by document and calculate average similarity
    const documentSimilarities = new Map<string, { name: string; similarities: number[] }>();
    
    for (const chunk of chunks) {
      const existing = documentSimilarities.get(chunk.documentId);
      if (existing) {
        existing.similarities.push(chunk.similarity);
      } else {
        documentSimilarities.set(chunk.documentId, {
          name: chunk.documentName,
          similarities: [chunk.similarity]
        });
      }
    }

    // Calculate average similarities and sort
    const results = Array.from(documentSimilarities.entries())
      .map(([documentId, data]) => ({
        documentId,
        documentName: data.name,
        avgSimilarity: data.similarities.reduce((sum, sim) => sum + sim, 0) / data.similarities.length
      }))
      .sort((a, b) => b.avgSimilarity - a.avgSimilarity)
      .slice(0, limit);

    return results;
  }
}