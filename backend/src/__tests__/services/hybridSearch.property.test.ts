/**
 * Property-Based Tests for Hybrid Search Enhancements
 * 
 * **Feature: rag-accuracy-improvements**
 * 
 * These tests validate the correctness properties of the hybrid search
 * enhancements including content-based deduplication and fallback behavior
 * using fast-check for property-based testing.
 */

import * as fc from 'fast-check';

// Import types from VectorService (we'll test the deduplication logic directly)
interface MockChunk {
  documentId: string;
  documentName: string;
  content: string;
  chunkId: string;
  similarity: number;
  lowConfidence?: boolean;
}

// Jaccard similarity calculation (same as in VectorService)
function calculateJaccardSimilarity(text1: string, text2: string): number {
  const words1 = new Set(text1.toLowerCase().split(/\s+/).filter(w => w.length > 2));
  const words2 = new Set(text2.toLowerCase().split(/\s+/).filter(w => w.length > 2));
  const intersection = new Set([...words1].filter(w => words2.has(w)));
  const union = new Set([...words1, ...words2]);
  return union.size > 0 ? intersection.size / union.size : 0;
}

// Content fingerprint for quick duplicate detection
function getContentFingerprint(content: string): string {
  const normalized = content.toLowerCase().replace(/\s+/g, ' ').trim();
  return normalized.slice(0, 100) + '|' + normalized.slice(-100);
}

// Deduplication function (mirrors VectorService.deduplicateResults logic)
function deduplicateResults(
  results: Array<{ chunk: MockChunk; similarity: number }>,
  maxChunksPerDocument: number = 4
): Array<{ chunk: MockChunk; similarity: number }> {
  const documentChunkCount = new Map<string, number>();
  const deduplicated: Array<{ chunk: MockChunk; similarity: number }> = [];
  const seenContent = new Set<string>();

  for (const result of results) {
    const docId = result.chunk.documentId;
    const currentCount = documentChunkCount.get(docId) || 0;

    // Skip if we already have max chunks from this document
    if (currentCount >= maxChunksPerDocument) {
      continue;
    }

    // Check for content overlap with already selected chunks from same document
    const contentKey = getContentFingerprint(result.chunk.content);
    if (seenContent.has(contentKey)) {
      continue;
    }

    // Check Jaccard similarity with existing chunks from same document
    const existingFromDoc = deduplicated.filter(d => d.chunk.documentId === docId);
    const hasOverlap = existingFromDoc.some(existing => 
      calculateJaccardSimilarity(existing.chunk.content, result.chunk.content) > 0.5
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

// Fallback function (mirrors VectorService fallback logic)
function applyFallback(
  filteredResults: MockChunk[],
  allResults: MockChunk[],
  minSimilarity: number
): MockChunk[] {
  // If no results meet threshold, return top 3 with low-confidence flag
  if (filteredResults.length === 0 && allResults.length > 0) {
    return allResults.slice(0, 3).map(r => ({
      ...r,
      lowConfidence: true
    }));
  }
  return filteredResults;
}

// Arbitrary for generating unique content strings
const uniqueContentArb = fc.string({ minLength: 50, maxLength: 200 });

// Arbitrary for generating document IDs
const docIdArb = fc.stringMatching(/^[a-e]{1,3}$/);

// Arbitrary for generating similarity scores
const similarityArb = fc.double({ min: 0.1, max: 0.95, noNaN: true });

// Arbitrary for generating a mock chunk
const mockChunkArb = (docId?: string): fc.Arbitrary<MockChunk> => {
  const docIdValue = docId ? fc.constant(docId) : fc.stringMatching(/^doc-[a-z]{1,3}$/);
  return fc.record({
    documentId: docIdValue,
    documentName: fc.constant('test-doc.txt'),
    content: uniqueContentArb,
    chunkId: fc.uuid(),
    similarity: similarityArb
  }) as fc.Arbitrary<MockChunk>;
};

// Arbitrary for generating chunks with similar content (for testing deduplication)
const similarContentChunksArb = (baseContent: string, docId: string): fc.Arbitrary<MockChunk[]> => {
  // Generate chunks that share most words with the base content
  const baseWords = baseContent.split(/\s+/).filter(w => w.length > 2);
  
  return fc.array(
    fc.record({
      documentId: fc.constant(docId),
      documentName: fc.constant('test-doc.txt'),
      // Create content that shares many words with base
      content: fc.constant(baseWords.slice(0, Math.floor(baseWords.length * 0.7)).join(' ') + ' additional unique words here'),
      chunkId: fc.uuid(),
      similarity: similarityArb
    }),
    { minLength: 1, maxLength: 3 }
  );
};

describe('Hybrid Search Property Tests', () => {
  /**
   * **Property 16: Content-Based Deduplication**
   * 
   * *For any* two chunks in the retrieval result with Jaccard similarity > 0.5, 
   * only the higher-scoring chunk SHALL be retained.
   * 
   * **Validates: Requirements 5.4**
   */
  describe('Property 16: Content-Based Deduplication', () => {
    it('should not retain chunks with Jaccard similarity > 0.5 from the same document', () => {
      fc.assert(
        fc.property(
          docIdArb,
          fc.array(mockChunkArb(), { minLength: 2, maxLength: 10 }),
          (docId: string, chunks: MockChunk[]) => {
            // Assign same document ID to all chunks
            const sameDocChunks = chunks.map(c => ({ ...c, documentId: docId }));
            
            // Sort by similarity (descending) to simulate retrieval order
            const sorted = sameDocChunks
              .map(chunk => ({ chunk, similarity: chunk.similarity }))
              .sort((a, b) => b.similarity - a.similarity);
            
            const deduplicated = deduplicateResults(sorted);
            
            // Check that no two chunks in the result have Jaccard > 0.5
            for (let i = 0; i < deduplicated.length; i++) {
              for (let j = i + 1; j < deduplicated.length; j++) {
                const jaccard = calculateJaccardSimilarity(
                  deduplicated[i].chunk.content,
                  deduplicated[j].chunk.content
                );
                if (jaccard > 0.5) {
                  return false;
                }
              }
            }
            return true;
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should keep the higher-scoring chunk when duplicates are found', () => {
      fc.assert(
        fc.property(
          docIdArb,
          uniqueContentArb,
          fc.double({ min: 0.6, max: 0.9, noNaN: true }),
          fc.double({ min: 0.3, max: 0.5, noNaN: true }),
          (docId: string, content: string, highScore: number, lowScore: number) => {
            // Create two chunks with identical content but different scores
            const highScoreChunk: MockChunk = {
              documentId: docId,
              documentName: 'test.txt',
              content: content,
              chunkId: 'chunk-high',
              similarity: highScore
            };
            
            const lowScoreChunk: MockChunk = {
              documentId: docId,
              documentName: 'test.txt',
              content: content, // Same content
              chunkId: 'chunk-low',
              similarity: lowScore
            };
            
            // Sort by similarity (high score first)
            const sorted = [
              { chunk: highScoreChunk, similarity: highScore },
              { chunk: lowScoreChunk, similarity: lowScore }
            ];
            
            const deduplicated = deduplicateResults(sorted);
            
            // Should only have one chunk (the higher-scoring one)
            if (deduplicated.length !== 1) {
              return false;
            }
            
            // The retained chunk should be the higher-scoring one
            return deduplicated[0].chunk.chunkId === 'chunk-high';
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should allow chunks from different documents with different content', () => {
      fc.assert(
        fc.property(
          uniqueContentArb,
          uniqueContentArb,
          similarityArb,
          similarityArb,
          (content1: string, content2: string, score1: number, score2: number) => {
            // Skip if contents are too similar (would be deduplicated)
            if (calculateJaccardSimilarity(content1, content2) > 0.5) {
              return true;
            }
            
            // Create two chunks with different content from different document IDs
            const chunk1: MockChunk = {
              documentId: 'doc-1',
              documentName: 'doc1.txt',
              content: content1,
              chunkId: 'chunk-1',
              similarity: score1
            };
            
            const chunk2: MockChunk = {
              documentId: 'doc-2', // Different document
              documentName: 'doc2.txt',
              content: content2, // Different content
              chunkId: 'chunk-2',
              similarity: score2
            };
            
            const sorted = [
              { chunk: chunk1, similarity: score1 },
              { chunk: chunk2, similarity: score2 }
            ].sort((a, b) => b.similarity - a.similarity);
            
            const deduplicated = deduplicateResults(sorted);
            
            // Both chunks should be retained (different documents, different content)
            return deduplicated.length === 2;
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should respect max chunks per document limit', () => {
      fc.assert(
        fc.property(
          docIdArb,
          fc.array(mockChunkArb(), { minLength: 5, maxLength: 10 }),
          (docId: string, chunks: MockChunk[]) => {
            // Assign same document ID to all chunks with unique content
            const sameDocChunks = chunks.map((c, i) => ({
              ...c,
              documentId: docId,
              content: `Unique content number ${i} with some additional text to make it longer and more realistic for testing purposes.`
            }));
            
            const sorted = sameDocChunks
              .map(chunk => ({ chunk, similarity: chunk.similarity }))
              .sort((a, b) => b.similarity - a.similarity);
            
            const deduplicated = deduplicateResults(sorted, 4); // Max 4 per document
            
            // Count chunks per document
            const docCounts = new Map<string, number>();
            for (const result of deduplicated) {
              const count = docCounts.get(result.chunk.documentId) || 0;
              docCounts.set(result.chunk.documentId, count + 1);
            }
            
            // No document should have more than 4 chunks
            for (const count of docCounts.values()) {
              if (count > 4) {
                return false;
              }
            }
            return true;
          }
        ),
        { numRuns: 100 }
      );
    });

    it('Jaccard similarity calculation should be symmetric', () => {
      fc.assert(
        fc.property(
          uniqueContentArb,
          uniqueContentArb,
          (text1: string, text2: string) => {
            const sim1 = calculateJaccardSimilarity(text1, text2);
            const sim2 = calculateJaccardSimilarity(text2, text1);
            
            // Jaccard similarity should be symmetric
            return Math.abs(sim1 - sim2) < 0.0001;
          }
        ),
        { numRuns: 100 }
      );
    });

    it('Jaccard similarity should be 1.0 for identical texts', () => {
      fc.assert(
        fc.property(
          uniqueContentArb,
          (text: string) => {
            const sim = calculateJaccardSimilarity(text, text);
            
            // Identical texts should have similarity of 1.0
            // (unless text has no words > 2 chars, then it's 0)
            const words = text.toLowerCase().split(/\s+/).filter(w => w.length > 2);
            if (words.length === 0) {
              return sim === 0;
            }
            return Math.abs(sim - 1.0) < 0.0001;
          }
        ),
        { numRuns: 100 }
      );
    });

    it('Jaccard similarity should be between 0 and 1', () => {
      fc.assert(
        fc.property(
          uniqueContentArb,
          uniqueContentArb,
          (text1: string, text2: string) => {
            const sim = calculateJaccardSimilarity(text1, text2);
            return sim >= 0 && sim <= 1;
          }
        ),
        { numRuns: 100 }
      );
    });
  });

  /**
   * **Property 17: Fallback on No Results**
   * 
   * *For any* query where no chunks meet the similarity threshold, 
   * the system SHALL return the top 3 chunks with a low-confidence flag set to true.
   * 
   * **Validates: Requirements 5.5**
   */
  describe('Property 17: Fallback on No Results', () => {
    it('should return top 3 chunks with lowConfidence flag when no results meet threshold', () => {
      fc.assert(
        fc.property(
          fc.array(mockChunkArb(), { minLength: 1, maxLength: 10 }),
          fc.double({ min: 0.8, max: 0.99, noNaN: true }), // High threshold that won't be met
          (chunks: MockChunk[], threshold: number) => {
            // Ensure all chunks have similarity below threshold
            const lowSimilarityChunks = chunks.map(c => ({
              ...c,
              similarity: Math.min(c.similarity, threshold - 0.1)
            }));
            
            // Sort by similarity
            const sorted = lowSimilarityChunks.sort((a, b) => b.similarity - a.similarity);
            
            // Filter by threshold (should result in empty array)
            const filtered = sorted.filter(c => c.similarity >= threshold);
            
            // Apply fallback
            const result = applyFallback(filtered, sorted, threshold);
            
            // Should return at most 3 chunks
            if (result.length > 3) {
              return false;
            }
            
            // All returned chunks should have lowConfidence flag
            if (!result.every(c => c.lowConfidence === true)) {
              return false;
            }
            
            // Should return the top chunks by similarity
            if (result.length > 0 && sorted.length > 0) {
              // First result should be the highest similarity chunk
              return result[0].similarity === sorted[0].similarity;
            }
            
            return true;
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should return exactly 3 chunks when more than 3 are available', () => {
      fc.assert(
        fc.property(
          fc.array(mockChunkArb(), { minLength: 4, maxLength: 10 }),
          (chunks: MockChunk[]) => {
            // All chunks below threshold
            const lowSimilarityChunks = chunks.map(c => ({
              ...c,
              similarity: 0.2 // Below any reasonable threshold
            }));
            
            const sorted = lowSimilarityChunks.sort((a, b) => b.similarity - a.similarity);
            const filtered: MockChunk[] = []; // No results meet threshold
            
            const result = applyFallback(filtered, sorted, 0.5);
            
            return result.length === 3;
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should return all available chunks when fewer than 3 exist', () => {
      fc.assert(
        fc.property(
          fc.array(mockChunkArb(), { minLength: 1, maxLength: 2 }),
          (chunks: MockChunk[]) => {
            const sorted = chunks.sort((a, b) => b.similarity - a.similarity);
            const filtered: MockChunk[] = []; // No results meet threshold
            
            const result = applyFallback(filtered, sorted, 0.9);
            
            return result.length === chunks.length;
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should not apply fallback when results meet threshold', () => {
      fc.assert(
        fc.property(
          fc.array(mockChunkArb(), { minLength: 1, maxLength: 5 }),
          fc.double({ min: 0.3, max: 0.5, noNaN: true }), // Low threshold
          (chunks: MockChunk[], threshold: number) => {
            // Ensure at least one chunk meets threshold
            const mixedChunks = chunks.map((c, i) => ({
              ...c,
              similarity: i === 0 ? threshold + 0.1 : c.similarity
            }));
            
            const sorted = mixedChunks.sort((a, b) => b.similarity - a.similarity);
            const filtered = sorted.filter(c => c.similarity >= threshold);
            
            const result = applyFallback(filtered, sorted, threshold);
            
            // Should return filtered results without lowConfidence flag
            if (filtered.length > 0) {
              return result.length === filtered.length && 
                     result.every(c => c.lowConfidence !== true);
            }
            return true;
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should return empty array when no chunks exist', () => {
      const result = applyFallback([], [], 0.5);
      expect(result).toEqual([]);
    });

    it('lowConfidence flag should be true for all fallback results', () => {
      fc.assert(
        fc.property(
          fc.array(mockChunkArb(), { minLength: 1, maxLength: 5 }),
          (chunks: MockChunk[]) => {
            const sorted = chunks.sort((a, b) => b.similarity - a.similarity);
            const filtered: MockChunk[] = []; // No results meet threshold
            
            const result = applyFallback(filtered, sorted, 0.99);
            
            // Every result should have lowConfidence === true
            return result.every(c => c.lowConfidence === true);
          }
        ),
        { numRuns: 100 }
      );
    });

    it('fallback results should preserve original chunk data except lowConfidence', () => {
      fc.assert(
        fc.property(
          fc.array(mockChunkArb(), { minLength: 1, maxLength: 3 }),
          (chunks: MockChunk[]) => {
            const sorted = chunks.sort((a, b) => b.similarity - a.similarity);
            const filtered: MockChunk[] = [];
            
            const result = applyFallback(filtered, sorted, 0.99);
            
            // Each result should have same data as original (except lowConfidence)
            return result.every((r, i) => {
              const original = sorted[i];
              return r.documentId === original.documentId &&
                     r.documentName === original.documentName &&
                     r.content === original.content &&
                     r.chunkId === original.chunkId &&
                     r.similarity === original.similarity;
            });
          }
        ),
        { numRuns: 100 }
      );
    });
  });
});
