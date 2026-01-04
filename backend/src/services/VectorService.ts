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

// IMPROVED: Higher thresholds for better precision
const SIMILARITY_THRESHOLD = 0.45; // Minimum for consideration (was 0.3)
const HIGH_RELEVANCE_THRESHOLD = 0.65; // Mark as "highly relevant"
const EXCELLENT_THRESHOLD = 0.80; // Mark as "excellent match"
const MAX_CHUNKS_PER_DOCUMENT = 2; // Prevent document domination

export class VectorService {
  private static rerankPipeline: any | null = null;
  private static rerankLastUsed: boolean = false;
  private static rerankModelName: string = 'Xenova/ms-marco-MiniLM-L-6-v2';

  /**
   * Initialize the vector service with MongoDB
   */
  static async initialize(): Promise<void> {
    console.log('✅ Vector service initialized with MongoDB storage');
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

      const texts = chunks.map(chunk => chunk.content);
      const embeddings = await ClaudeService.generateEmbeddings(texts);

      if (embeddings.length !== chunks.length) {
        throw new Error(`Embedding count mismatch: expected ${chunks.length}, got ${embeddings.length}`);
      }

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

      await DocumentChunkModel.insertMany(chunkDocuments, { ordered: false });
      console.log(`✅ Stored ${chunks.length} chunks for document: ${documentName}`);
    } catch (error: any) {
      console.error('Error storing document chunks:', error);
      throw new Error(`Failed to store document chunks: ${error.message}`);
    }
  }

  /**
   * IMPROVED: Search with higher threshold and deduplication
   */
  static async searchSimilar(
    query: string, 
    limit: number = 5,
    minSimilarity: number = SIMILARITY_THRESHOLD
  ): Promise<RelevantChunk[]> {
    try {
      if (!query.trim()) {
        throw new Error('Search query cannot be empty');
      }

      const queryEmbedding = await ClaudeService.generateEmbedding(query);
      const allChunks = await DocumentChunkModel.find({}).exec();

      if (allChunks.length === 0) {
        console.log('No document chunks found in database');
        return [];
      }

      const similarities: Array<{ chunk: any; similarity: number }> = [];

      for (const chunk of allChunks) {
        if (!chunk.embedding || chunk.embedding.length === 0) {
          continue;
        }

        const similarity = this.cosineSimilarity(queryEmbedding, chunk.embedding);
        
        if (similarity >= minSimilarity) {
          similarities.push({ chunk, similarity });
        }
      }

      // Sort by similarity
      similarities.sort((a, b) => b.similarity - a.similarity);

      // IMPROVED: Apply deduplication
      const deduplicated = this.deduplicateResults(similarities);
      const topResults = deduplicated.slice(0, limit);

      const relevantChunks: RelevantChunk[] = topResults.map(result => ({
        content: result.chunk.content,
        documentName: result.chunk.documentName,
        documentId: result.chunk.documentId,
        chunkId: result.chunk.chunkId,
        similarity: result.similarity
      }));

      console.log(`🔍 Found ${relevantChunks.length} relevant chunks (from ${similarities.length} candidates)`);
      return relevantChunks;
    } catch (error: any) {
      console.error('Error searching similar chunks:', error);
      throw new Error(`Failed to search similar chunks: ${error.message}`);
    }
  }

  /**
   * IMPROVED: Deduplicate results - max 2 chunks per document, no content overlap
   */
  private static deduplicateResults(
    results: Array<{ chunk: any; similarity: number }>
  ): Array<{ chunk: any; similarity: number }> {
    const documentChunkCount = new Map<string, number>();
    const deduplicated: Array<{ chunk: any; similarity: number }> = [];
    const seenContent = new Set<string>();

    for (const result of results) {
      const docId = result.chunk.documentId;
      const currentCount = documentChunkCount.get(docId) || 0;

      // Skip if we already have max chunks from this document
      if (currentCount >= MAX_CHUNKS_PER_DOCUMENT) {
        continue;
      }

      // Check for content overlap with already selected chunks from same document
      const contentKey = this.getContentFingerprint(result.chunk.content);
      if (seenContent.has(contentKey)) {
        continue;
      }

      // Check Jaccard similarity with existing chunks from same document
      const existingFromDoc = deduplicated.filter(d => d.chunk.documentId === docId);
      const hasOverlap = existingFromDoc.some(existing => 
        this.calculateJaccardSimilarity(existing.chunk.content, result.chunk.content) > 0.5
      );

      if (hasOverlap) {
        continue;
      }

      deduplicated.push(result);
      documentChunkCount.set(docId, currentCount + 1);
      seenContent.add(contentKey);
    }

    return deduplicated;
  }

  /**
   * Calculate Jaccard similarity between two texts
   */
  private static calculateJaccardSimilarity(text1: string, text2: string): number {
    const words1 = new Set(text1.toLowerCase().split(/\s+/).filter(w => w.length > 2));
    const words2 = new Set(text2.toLowerCase().split(/\s+/).filter(w => w.length > 2));
    const intersection = new Set([...words1].filter(w => words2.has(w)));
    const union = new Set([...words1, ...words2]);
    return union.size > 0 ? intersection.size / union.size : 0;
  }

  /**
   * Get a fingerprint of content for quick duplicate detection
   */
  private static getContentFingerprint(content: string): string {
    // Use first 100 chars + last 100 chars as fingerprint
    const normalized = content.toLowerCase().replace(/\s+/g, ' ').trim();
    return normalized.slice(0, 100) + '|' + normalized.slice(-100);
  }

  /** Search restricted to a set of documentIds */
  static async searchSimilarWithin(
    query: string,
    docIds: string[],
    limit: number = 5,
    minSimilarity: number = SIMILARITY_THRESHOLD
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
      const deduplicated = this.deduplicateResults(similarities);
      const top = deduplicated.slice(0, limit);
      
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
   * IMPROVED: Hybrid search with better blending and Reciprocal Rank Fusion
   */
  static async searchSimilarHybrid(
    query: string,
    options?: { limit?: number; minSimilarity?: number; textTopK?: number; vectorTopK?: number; alpha?: number; rerank?: boolean }
  ): Promise<RelevantChunk[]> {
    const limit = options?.limit ?? 5;
    const minSim = options?.minSimilarity ?? SIMILARITY_THRESHOLD;
    const textTopK = options?.textTopK ?? Math.max(30, limit * 6);
    const vectorTopK = options?.vectorTopK ?? Math.max(30, limit * 6);
    const doRerank = options?.rerank ?? true;

    // Classify query to adjust weights
    const queryType = this.classifyQuery(query);
    const { vectorWeight, textWeight } = this.getQueryWeights(queryType);

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

    // 2) Vector results
    const vectorResults = await this.searchSimilar(query, vectorTopK, minSim * 0.8); // Slightly lower threshold for initial retrieval

    // 3) Apply Reciprocal Rank Fusion (RRF)
    const rrfScores = this.reciprocalRankFusion(vectorResults, textResults, vectorWeight, textWeight);

    // 4) Build chunk map
    const byId = new Map<string, RelevantChunk>();
    vectorResults.forEach(v => byId.set(v.chunkId, v));
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

    // 5) Sort by RRF score and get top candidates
    const sorted = Array.from(rrfScores.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, Math.max(limit * 3, 15))
      .map(([id, score]) => {
        const chunk = byId.get(id);
        if (chunk) {
          // Update similarity to reflect RRF score (normalized)
          chunk.similarity = Math.min(score * 2, 1); // Scale RRF to 0-1 range
        }
        return chunk;
      })
      .filter(Boolean) as RelevantChunk[];

    // 6) Apply deduplication
    const dedupedResults = this.deduplicateChunks(sorted);

    // 7) Optional reranking
    let finalResults = dedupedResults;
    if (doRerank && dedupedResults.length > 0) {
      try {
        const reranked = await this.rerankChunks(query, dedupedResults);
        finalResults = reranked.slice(0, limit);
        this.rerankLastUsed = true;
      } catch (err) {
        this.rerankLastUsed = false;
        finalResults = dedupedResults.slice(0, limit);
      }
    } else {
      this.rerankLastUsed = false;
      finalResults = dedupedResults.slice(0, limit);
    }

    // 8) Filter out low-relevance results
    const filtered = finalResults.filter(r => r.similarity >= minSim);
    
    console.log(`🔍 Hybrid search: ${filtered.length} results (query type: ${queryType})`);
    return filtered;
  }

  /**
   * Classify query type for dynamic weight adjustment
   */
  private static classifyQuery(query: string): string {
    const patterns: Record<string, RegExp> = {
      FACTUAL: /^(what|who|when|where|which|how many|how much)/i,
      EXPLANATORY: /^(why|how|explain|describe)/i,
      COMPARATIVE: /(compare|difference|versus|vs|better)/i,
      SUMMARIZATION: /(summarize|summary|overview|main points)/i,
      SPECIFIC: /["']|specific|exactly|precise/i
    };

    for (const [type, pattern] of Object.entries(patterns)) {
      if (pattern.test(query)) return type;
    }
    return 'GENERAL';
  }

  /**
   * Get retrieval weights based on query type
   */
  private static getQueryWeights(queryType: string): { vectorWeight: number; textWeight: number } {
    switch (queryType) {
      case 'FACTUAL':
        return { vectorWeight: 0.5, textWeight: 0.5 };
      case 'EXPLANATORY':
        return { vectorWeight: 0.7, textWeight: 0.3 };
      case 'SPECIFIC':
        return { vectorWeight: 0.4, textWeight: 0.6 };
      case 'SUMMARIZATION':
        return { vectorWeight: 0.6, textWeight: 0.4 };
      default:
        return { vectorWeight: 0.55, textWeight: 0.45 };
    }
  }

  /**
   * IMPROVED: Reciprocal Rank Fusion for better result merging
   */
  private static reciprocalRankFusion(
    vectorResults: RelevantChunk[],
    textResults: Array<{ chunkId: string; score?: number }>,
    vectorWeight: number = 0.6,
    textWeight: number = 0.4,
    k: number = 60
  ): Map<string, number> {
    const scores = new Map<string, number>();

    // Vector results RRF
    vectorResults.forEach((chunk, rank) => {
      const rrf = vectorWeight / (k + rank + 1);
      scores.set(chunk.chunkId, (scores.get(chunk.chunkId) || 0) + rrf);
    });

    // Text results RRF
    textResults.forEach((result, rank) => {
      const rrf = textWeight / (k + rank + 1);
      scores.set(result.chunkId, (scores.get(result.chunkId) || 0) + rrf);
    });

    return scores;
  }

  /**
   * Deduplicate RelevantChunk array
   */
  private static deduplicateChunks(chunks: RelevantChunk[]): RelevantChunk[] {
    const documentChunkCount = new Map<string, number>();
    const deduplicated: RelevantChunk[] = [];

    for (const chunk of chunks) {
      const docId = chunk.documentId;
      const currentCount = documentChunkCount.get(docId) || 0;

      if (currentCount >= MAX_CHUNKS_PER_DOCUMENT) {
        continue;
      }

      // Check for content overlap
      const existingFromDoc = deduplicated.filter(d => d.documentId === docId);
      const hasOverlap = existingFromDoc.some(existing => 
        this.calculateJaccardSimilarity(existing.content, chunk.content) > 0.5
      );

      if (hasOverlap) {
        continue;
      }

      deduplicated.push(chunk);
      documentChunkCount.set(docId, currentCount + 1);
    }

    return deduplicated;
  }

  /**
   * Cross-encoder reranking using a local transformers pipeline
   */
  private static async rerankChunks(query: string, chunks: RelevantChunk[]): Promise<RelevantChunk[]> {
    if (chunks.length === 0) return chunks;

    if (!this.rerankPipeline) {
      try {
        const { pipeline } = await import('@xenova/transformers');
        this.rerankPipeline = await pipeline('text-classification', this.rerankModelName);
      } catch (e) {
        this.rerankLastUsed = false;
        return chunks;
      }
    }

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
    
    // Update similarity scores based on reranking
    return scored.map((s, idx) => ({
      ...s.chunk,
      similarity: Math.max(s.chunk.similarity, s.score * 0.9) // Blend original and rerank scores
    }));
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
      const chunks = await this.searchSimilar(query, 20, SIMILARITY_THRESHOLD * 0.8);
      
      if (chunks.length === 0) {
        return [];
      }

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

    const centroids = entries.slice(0, Math.min(k, entries.length)).map(([, emb]) => emb.slice());
    let assignments: number[] = new Array(entries.length).fill(0);

    const distance = (a: number[], b: number[]) => 1 - this.cosineSimilarity(a, b);

    for (let iter = 0; iter < maxIter; iter++) {
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
      const grouped: number[][][] = centroids.map(() => []);
      for (let i = 0; i < entries.length; i++) {
        grouped[assignments[i]].push(entries[i][1]);
      }
      for (let c = 0; c < centroids.length; c++) {
        if (grouped[c].length > 0) centroids[c] = this.meanVector(grouped[c]);
      }
      if (!changed) break;
    }

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

      const newEmbedding = await ClaudeService.generateEmbedding(newContent);

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
   * Batch update embeddings for all chunks
   */
  static async regenerateAllEmbeddings(): Promise<number> {
    try {
      if (process.env.NODE_ENV === 'production') {
        console.warn('Regenerating embeddings in production - this may take a while and consume API credits');
      }

      const chunks = await DocumentChunkModel.find({}).exec();
      console.log(`🔄 Regenerating embeddings for ${chunks.length} chunks...`);

      let updated = 0;
      const batchSize = 10;

      for (let i = 0; i < chunks.length; i += batchSize) {
        const batch = chunks.slice(i, i + batchSize);
        const contents = batch.map((chunk: DocumentChunk) => chunk.content);
        
        try {
          const embeddings = await ClaudeService.generateEmbeddings(contents);
          
          for (let j = 0; j < batch.length; j++) {
            await DocumentChunkModel.findOneAndUpdate(
              { _id: batch[j]._id },
              { embedding: embeddings[j] }
            ).exec();
            updated++;
          }

          console.log(`📊 Progress: ${updated}/${chunks.length} chunks updated`);
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
