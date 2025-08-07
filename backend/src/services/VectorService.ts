import { ClaudeService, RelevantChunk } from './ClaudeService';
import { DocumentChunk } from './FileProcessor';
import { DocumentChunkModel } from '../models/index';

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
  /**
   * Initialize the vector service with MongoDB
   */
  static async initialize(): Promise<void> {
    console.log('✅ Vector service initialized with MongoDB storage');
  }

  /**
   * Store document chunks as vectors in MongoDB
   */
  static async storeDocumentChunks(
    chunks: DocumentChunk[], 
    documentName: string
  ): Promise<void> {
    try {
      if (chunks.length === 0) {
        throw new Error('No chunks provided to store');
      }

      // Extract text content for embedding generation
      const texts = chunks.map(chunk => chunk.content);
      
      // Generate embeddings in batch for efficiency
      const embeddings = await ClaudeService.generateEmbeddings(texts);

      if (embeddings.length !== chunks.length) {
        throw new Error(`Embedding count mismatch: expected ${chunks.length}, got ${embeddings.length}`);
      }

      // Prepare documents for batch insert
      const chunkDocuments = chunks.map((chunk, index) => ({
        id: `vector_${chunk.id}`,
        documentId: chunk.documentId,
        documentName,
        chunkId: chunk.id,
        content: chunk.content,
        chunkIndex: chunk.chunkIndex,
        startPosition: chunk.startPosition,
        endPosition: chunk.endPosition,
        wordCount: chunk.wordCount,
        embedding: embeddings[index],
        createdAt: new Date()
      }));

      // Batch insert into MongoDB
      await DocumentChunkModel.insertMany(chunkDocuments, { ordered: false });

      console.log(`✅ Stored ${chunks.length} chunks for document: ${documentName}`);
    } catch (error: any) {
      console.error('Error storing document chunks:', error);
      throw new Error(`Failed to store document chunks: ${error.message}`);
    }
  }

  /**
   * Search for similar chunks using cosine similarity
   */
  static async searchSimilar(
    query: string, 
    limit: number = 5,
    minSimilarity: number = 0.3
  ): Promise<RelevantChunk[]> {
    try {
      if (!query.trim()) {
        throw new Error('Search query cannot be empty');
      }

      // Generate embedding for the query
      const queryEmbedding = await ClaudeService.generateEmbedding(query);

      // Get all chunks from MongoDB
      const allChunks = await DocumentChunkModel.find({}).exec();

      if (allChunks.length === 0) {
        console.log('No document chunks found in database');
        return [];
      }

      // Calculate similarity scores for all chunks
      const similarities: Array<{ chunk: any; similarity: number }> = [];

      for (const chunk of allChunks) {
        if (!chunk.embedding || chunk.embedding.length === 0) {
          console.warn(`Chunk ${chunk.id} has no embedding, skipping`);
          continue;
        }

        const similarity = this.cosineSimilarity(queryEmbedding, chunk.embedding);
        
        if (similarity >= minSimilarity) {
          similarities.push({ chunk, similarity });
        }
      }

      // Sort by similarity (highest first) and limit results
      similarities.sort((a, b) => b.similarity - a.similarity);
      const topResults = similarities.slice(0, limit);

      // Convert to RelevantChunk format
      const relevantChunks: RelevantChunk[] = topResults.map(result => ({
        content: result.chunk.content,
        documentName: result.chunk.documentName,
        documentId: result.chunk.documentId,
        chunkId: result.chunk.chunkId,
        similarity: result.similarity
      }));

      console.log(`🔍 Found ${relevantChunks.length} relevant chunks for query: "${query.substring(0, 50)}..."`);
      return relevantChunks;
    } catch (error: any) {
      console.error('Error searching similar chunks:', error);
      throw new Error(`Failed to search similar chunks: ${error.message}`);
    }
  }

  /**
   * Get all documents with their chunk counts
   */
  static async getDocumentStats(): Promise<Array<{ documentId: string; documentName: string; chunkCount: number }>> {
    try {
      const stats = await DocumentChunkModel.aggregate([
        {
          $group: {
            _id: '$documentId',
            documentName: { $first: '$documentName' },
            chunkCount: { $sum: 1 }
          }
        },
        {
          $project: {
            documentId: '$_id',
            documentName: 1,
            chunkCount: 1,
            _id: 0
          }
        },
        {
          $sort: { chunkCount: -1 }
        }
      ]).exec();

      return stats;
    } catch (error) {
      console.error('Error getting document stats:', error);
      return [];
    }
  }

  /**
   * Delete all vectors for a document
   */
  static async deleteDocument(documentId: string): Promise<number> {
    try {
      const result = await DocumentChunkModel.deleteMany({ documentId }).exec();
      const deletedCount = result.deletedCount || 0;
      
      console.log(`🗑️  Deleted ${deletedCount} vectors for document: ${documentId}`);
      return deletedCount;
    } catch (error) {
      console.error('Error deleting document vectors:', error);
      throw new Error('Failed to delete document vectors');
    }
  }

  /**
   * Clear all stored vectors
   */
  static async clearAll(): Promise<number> {
    try {
      if (process.env.NODE_ENV === 'production') {
        throw new Error('Cannot clear vectors in production environment');
      }

      const result = await DocumentChunkModel.deleteMany({}).exec();
      const deletedCount = result.deletedCount || 0;
      
      console.log(`🗑️  Cleared ${deletedCount} vectors`);
      return deletedCount;
    } catch (error) {
      console.error('Error clearing vectors:', error);
      throw new Error('Failed to clear vectors');
    }
  }

  /**
   * Get total vector count
   */
  static async getVectorCount(): Promise<number> {
    try {
      return await DocumentChunkModel.countDocuments().exec();
    } catch (error) {
      console.error('Error getting vector count:', error);
      return 0;
    }
  }

  /**
   * Find similar documents (not chunks) based on query
   */
  static async findSimilarDocuments(
    query: string, 
    limit: number = 3
  ): Promise<Array<{ documentId: string; documentName: string; avgSimilarity: number }>> {
    try {
      // Get relevant chunks first
      const chunks = await this.searchSimilar(query, 20, 0.2); // Get more chunks with lower threshold
      
      if (chunks.length === 0) {
        return [];
      }

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
    } catch (error) {
      console.error('Error finding similar documents:', error);
      throw new Error('Failed to find similar documents');
    }
  }

  /**
   * Get chunks for a specific document
   */
  static async getDocumentChunks(documentId: string): Promise<any[]> {
    try {
      const chunks = await DocumentChunkModel
        .find({ documentId })
        .sort({ chunkIndex: 1 })
        .exec();
      
      return chunks;
    } catch (error) {
      console.error('Error getting document chunks:', error);
      throw new Error('Failed to get document chunks');
    }
  }

  /**
   * Update chunk content and regenerate embedding
   */
  static async updateChunk(chunkId: string, newContent: string): Promise<boolean> {
    try {
      const chunk = await DocumentChunkModel.findOne({ chunkId }).exec();
      if (!chunk) {
        return false;
      }

      // Generate new embedding for updated content
      const newEmbedding = await ClaudeService.generateEmbedding(newContent);

      // Update the chunk
      await DocumentChunkModel.findOneAndUpdate(
        { chunkId },
        { 
          content: newContent, 
          embedding: newEmbedding,
          wordCount: newContent.split(/\s+/).length
        }
      ).exec();

      console.log(`✅ Updated chunk ${chunkId} with new content and embedding`);
      return true;
    } catch (error) {
      console.error('Error updating chunk:', error);
      throw new Error('Failed to update chunk');
    }
  }

  /**
   * Calculate cosine similarity between two vectors
   */
  private static cosineSimilarity(a: number[], b: number[]): number {
    if (a.length !== b.length) {
      throw new Error(`Vector dimension mismatch: ${a.length} vs ${b.length}`);
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
   * Batch update embeddings for all chunks (useful for model changes)
   */
  static async regenerateAllEmbeddings(): Promise<number> {
    try {
      if (process.env.NODE_ENV === 'production') {
        console.warn('Regenerating embeddings in production - this may take a while and consume API credits');
      }

      const chunks = await DocumentChunkModel.find({}).exec();
      console.log(`🔄 Regenerating embeddings for ${chunks.length} chunks...`);

      let updated = 0;
      const batchSize = 10; // Process in small batches to avoid API rate limits

      for (let i = 0; i < chunks.length; i += batchSize) {
        const batch = chunks.slice(i, i + batchSize);
        const contents = batch.map((chunk: DocumentChunk) => chunk.content);
        
        try {
          const embeddings = await ClaudeService.generateEmbeddings(contents);
          
          // Update each chunk in the batch
          for (let j = 0; j < batch.length; j++) {
            await DocumentChunkModel.findOneAndUpdate(
              { _id: batch[j]._id },
              { embedding: embeddings[j] }
            ).exec();
            updated++;
          }

          console.log(`📊 Progress: ${updated}/${chunks.length} chunks updated`);
          
          // Small delay to avoid hitting rate limits
          await new Promise(resolve => setTimeout(resolve, 1000));
        } catch (error) {
          console.error(`Failed to update batch ${i}-${i + batchSize}:`, error);
        }
      }

      console.log(`✅ Regenerated embeddings for ${updated} chunks`);
      return updated;
    } catch (error) {
      console.error('Error regenerating embeddings:', error);
      throw new Error('Failed to regenerate embeddings');
    }
  }
}