import { ClaudeService, RelevantChunk } from './ClaudeService';
import { DocumentChunk } from './FileProcessor';
import { DocumentChunkModel, DocumentModel } from '../models/index';

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
  private static rerankPipeline: any | null = null;
  private static rerankLastUsed: boolean = false;
  private static rerankModelName: string = 'Xenova/ms-marco-MiniLM-L-6-v2';
  /**
   * Initialize the vector service with MongoDB
   */
  static async initialize(): Promise<void> {
    console.log('✅ Vector service initialized with MongoDB storage');
    // Lazy init for reranker (downloading models is expensive); prepare hook
    this.rerankPipeline = null;
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

  /** Search restricted to a set of documentIds */
  static async searchSimilarWithin(
    query: string,
    docIds: string[],
    limit: number = 5,
    minSimilarity: number = 0.2
  ): Promise<RelevantChunk[]> {
    try {
      if (!query.trim()) throw new Error('Search query cannot be empty');
      if (!docIds || docIds.length === 0) return [];

      const queryEmbedding = await ClaudeService.generateEmbedding(query);
      const allChunks = await DocumentChunkModel.find({ documentId: { $in: docIds } }).exec();
      const similarities: Array<{ chunk: any; similarity: number }> = [];
      for (const chunk of allChunks) {
        if (!chunk.embedding || chunk.embedding.length === 0) continue;
        const sim = this.cosineSimilarity(queryEmbedding, chunk.embedding);
        if (sim >= minSimilarity) similarities.push({ chunk, similarity: sim });
      }
      similarities.sort((a, b) => b.similarity - a.similarity);
      const top = similarities.slice(0, limit);
      return top.map(r => ({
        content: r.chunk.content,
        documentName: r.chunk.documentName,
        documentId: r.chunk.documentId,
        chunkId: r.chunk.chunkId,
        similarity: r.similarity
      }));
    } catch (e: any) {
      console.error('Error searchSimilarWithin:', e);
      return [];
    }
  }

  /**
   * Hybrid search: combine keyword (BM25-like via Mongo text score) with vector similarity.
   * We retrieve topN from both, merge by normalized scores, and rerank.
   */
  static async searchSimilarHybrid(
    query: string,
    options?: { limit?: number; minSimilarity?: number; textTopK?: number; vectorTopK?: number; alpha?: number; rerank?: boolean }
  ): Promise<RelevantChunk[]> {
    const limit = options?.limit ?? 5;
    const minSim = options?.minSimilarity ?? 0.2;
    const textTopK = options?.textTopK ?? Math.max(20, limit * 4);
    const vectorTopK = options?.vectorTopK ?? Math.max(20, limit * 4);
    const alpha = options?.alpha ?? 0.5; // blend weight between vector and text
    const doRerank = options?.rerank ?? true;

    // 1) Text search results with textScore
    type TextResult = { chunkId: string; content: string; documentName: string; documentId: string; score?: number };
    const textResults = (await DocumentChunkModel
      .find(
        { $text: { $search: query } },
        { score: { $meta: 'textScore' }, content: 1, documentName: 1, documentId: 1, chunkId: 1 }
      )
      .sort({ score: { $meta: 'textScore' } })
      .limit(textTopK)
      .lean()) as TextResult[];

    // Normalize text scores
    const maxText = textResults.length > 0 ? (textResults[0].score ?? 1) : 1;
    const textMap = new Map<string, number>();
    textResults.forEach((r: TextResult) => textMap.set(r.chunkId, ((r.score ?? 0) / (maxText || 1))));

    // 2) Vector results with cosine similarity
    const vectorResults = await this.searchSimilar(query, vectorTopK, minSim);
    const maxVec = Math.max(...vectorResults.map(v => v.similarity), 1);
    const vecMap = new Map<string, number>();
    vectorResults.forEach(v => vecMap.set(v.chunkId, v.similarity / maxVec));

    // 3) Merge keys
    const ids = new Set<string>([...textMap.keys(), ...vecMap.keys()]);

    // 4) Gather data for ranking
    const byId = new Map<string, RelevantChunk>();
    vectorResults.forEach(v => byId.set(v.chunkId, v));
    // For text-only hits, reconstruct minimal chunk info from DB rows
    textResults.forEach((r: TextResult) => {
      if (!byId.has(r.chunkId)) {
        byId.set(r.chunkId, {
          content: r.content,
          documentName: r.documentName,
          documentId: r.documentId,
          chunkId: r.chunkId,
          similarity: 0
        });
      }
    });

    // 5) Blend scores and rerank
    const blended = Array.from(ids).map(id => {
      const textScore = textMap.get(id) || 0;
      const vecScore = vecMap.get(id) || 0;
      const score = alpha * vecScore + (1 - alpha) * textScore;
      return { id, score };
    });

    blended.sort((a, b) => b.score - a.score);
    let top = blended.slice(0, Math.max(limit * 2, 10)).map(x => byId.get(x.id)!).filter(Boolean);

    // Optional reranking using cross-encoder if available
    if (doRerank) {
      try {
        const reranked = await this.rerankChunks(query, top);
        top = reranked.slice(0, limit);
      } catch (err) {
        // Silent fallback if model unavailable
        this.rerankLastUsed = false;
      }
    } else {
      this.rerankLastUsed = false;
    }

    return top;
  }

  /**
   * Cross-encoder reranking using a local transformers pipeline (no external API).
   * Uses a small MS MARCO model to score (query, chunk) pairs.
   */
  private static async rerankChunks(query: string, chunks: RelevantChunk[]): Promise<RelevantChunk[]> {
    if (chunks.length === 0) return chunks;

    // Lazy initialize the reranker
    if (!this.rerankPipeline) {
      // Dynamically import to avoid type issues when not installed
      try {
        const { pipeline } = await import('@xenova/transformers');
        this.rerankPipeline = await pipeline('text-classification', this.rerankModelName);
      } catch (e) {
        // Fail silently if model cannot load (e.g., no internet or missing package)
        this.rerankLastUsed = false;
        return chunks;
      }
    }

    // Score each chunk
    const scored: Array<{ chunk: RelevantChunk; score: number }> = [];
    for (const c of chunks) {
      try {
        const output = await this.rerankPipeline(`${query} [SEP] ${c.content.substring(0, 512)}`);
        const score = Array.isArray(output) ? (output[0]?.score ?? 0) : (output?.score ?? 0);
        scored.push({ chunk: c, score });
      } catch {
        scored.push({ chunk: c, score: 0 });
      }
    }

    scored.sort((a, b) => b.score - a.score);
    this.rerankLastUsed = true;
    return scored.map(s => s.chunk);
  }

  static getLastRerankUsed(): boolean { return this.rerankLastUsed; }
  static getRerankModelName(): string { return this.rerankModelName; }

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
   * Compute document-level embeddings by averaging chunk embeddings
   */
  static async computeDocumentEmbeddings(): Promise<Map<string, number[]>> {
    const all = await DocumentChunkModel.find({}).lean();
    const byDoc: Record<string, number[][]> = {} as any;
    for (const c of all as any[]) {
      if (!c.embedding || c.embedding.length === 0) continue;
      byDoc[c.documentId] = byDoc[c.documentId] || [];
      byDoc[c.documentId].push(c.embedding);
    }
    const map = new Map<string, number[]>();
    for (const [docId, arrs] of Object.entries(byDoc)) {
      const mean = this.meanVector(arrs);
      map.set(docId, mean);
    }
    return map;
  }

  private static meanVector(vectors: number[][]): number[] {
    if (vectors.length === 0) return [];
    const dim = vectors[0].length;
    const sum = new Array(dim).fill(0);
    for (const v of vectors) {
      for (let i = 0; i < dim; i++) sum[i] += v[i];
    }
    return sum.map(s => s / vectors.length);
  }

  /**
   * Simple k-means clustering for document embeddings
   */
  static async clusterDocuments(k: number = 5, maxIter: number = 10): Promise<Array<{ clusterId: string; size: number }>> {
    const embeddings = await this.computeDocumentEmbeddings();
    const entries = Array.from(embeddings.entries());
    if (entries.length === 0) return [];

    // Initialize centroids from first k docs
    const centroids = entries.slice(0, Math.min(k, entries.length)).map(([, emb]) => emb.slice());
    let assignments: number[] = new Array(entries.length).fill(0);

    const distance = (a: number[], b: number[]) => 1 - this.cosineSimilarity(a, b);

    for (let iter = 0; iter < maxIter; iter++) {
      // Assign
      let changed = false;
      for (let i = 0; i < entries.length; i++) {
        const emb = entries[i][1];
        let best = 0;
        let bestDist = Infinity;
        for (let c = 0; c < centroids.length; c++) {
          const dist = distance(emb, centroids[c]);
          if (dist < bestDist) { bestDist = dist; best = c; }
        }
        if (assignments[i] !== best) { assignments[i] = best; changed = true; }
      }
      // Update
      const grouped: number[][][] = centroids.map(() => []);
      for (let i = 0; i < entries.length; i++) {
        grouped[assignments[i]].push(entries[i][1]);
      }
      for (let c = 0; c < centroids.length; c++) {
        if (grouped[c].length > 0) centroids[c] = this.meanVector(grouped[c]);
      }
      if (!changed) break;
    }

    // Persist clusterId on documents
    const counts = new Array(centroids.length).fill(0);
    for (let i = 0; i < entries.length; i++) {
      const docId = entries[i][0];
      const clusterIndex = assignments[i];
      counts[clusterIndex]++;
      await DocumentModel.findOneAndUpdate({ id: docId }, { clusterId: `c${clusterIndex}` }).exec();
    }
    return counts.map((size, idx) => ({ clusterId: `c${idx}`, size }));
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