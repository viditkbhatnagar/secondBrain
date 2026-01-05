/**
 * Property-Based Tests for ContextAssembler
 * 
 * **Feature: rag-accuracy-improvements**
 * 
 * These tests validate the correctness properties of the ContextAssembler
 * using fast-check for property-based testing.
 */

import * as fc from 'fast-check';
import { ContextAssembler, ChunkWithPosition } from '../../services/contextAssembler';

// Helper to generate a chunk with position metadata
const chunkWithPositionArb = (docId: string, chunkIndex: number): fc.Arbitrary<ChunkWithPosition> => {
  return fc.record({
    content: fc.string({ minLength: 50, maxLength: 200 }),
    documentName: fc.constant(`doc-${docId}.txt`),
    documentId: fc.constant(docId),
    chunkId: fc.uuid(),
    similarity: fc.double({ min: 0.3, max: 1.0 }),
    chunkIndex: fc.constant(chunkIndex),
    startPosition: fc.constant(chunkIndex * 500),
    endPosition: fc.constant((chunkIndex + 1) * 500)
  });
};

// Generate a set of chunks from multiple documents with varying chunk indices
const multiDocChunksArb = fc.integer({ min: 1, max: 4 }).chain(numDocs => {
  // Generate document IDs
  const docIds = Array.from({ length: numDocs }, (_, i) => `doc-${i}`);
  
  // For each document, generate 1-4 chunks with random indices
  return fc.tuple(
    ...docIds.map(docId => 
      fc.integer({ min: 1, max: 4 }).chain(numChunks => {
        // Generate chunk indices (potentially out of order)
        return fc.shuffledSubarray(
          Array.from({ length: 10 }, (_, i) => i),
          { minLength: numChunks, maxLength: numChunks }
        ).chain(indices => {
          return fc.tuple(
            ...indices.map(idx => chunkWithPositionArb(docId, idx))
          );
        });
      })
    )
  ).map(docChunks => {
    // Flatten and shuffle all chunks together
    const allChunks = docChunks.flat();
    return allChunks;
  });
});

// Simpler arbitrary for chunks that we can shuffle
const shuffledChunksArb = fc.integer({ min: 2, max: 3 }).chain(numDocs => {
  const docIds = Array.from({ length: numDocs }, (_, i) => `doc-${i}`);
  
  return fc.tuple(
    ...docIds.map(docId => 
      fc.integer({ min: 2, max: 4 }).chain(numChunks => {
        const indices = Array.from({ length: numChunks }, (_, i) => i);
        return fc.tuple(
          ...indices.map(idx => chunkWithPositionArb(docId, idx))
        );
      })
    )
  ).chain(docChunksArrays => {
    const allChunks = docChunksArrays.flat();
    // Shuffle the chunks
    return fc.shuffledSubarray(allChunks, { minLength: allChunks.length, maxLength: allChunks.length });
  });
});

describe('ContextAssembler Property Tests', () => {
  const assembler = new ContextAssembler({ maxChunks: 6, orderByPosition: true });

  /**
   * **Property 12: Same-Document Chunk Ordering**
   * 
   * *For any* set of chunks from the same document in the assembled context, 
   * they SHALL be ordered by their chunkIndex (ascending) to preserve document flow.
   * 
   * **Validates: Requirements 4.2**
   */
  describe('Property 12: Same-Document Chunk Ordering', () => {
    it('chunks from the same document should be ordered by chunkIndex', () => {
      fc.assert(
        fc.property(
          shuffledChunksArb,
          (shuffledChunks: ChunkWithPosition[]) => {
            // Skip if no chunks
            if (shuffledChunks.length === 0) {
              return true;
            }

            const assembled = assembler.assemble(shuffledChunks);
            const orderedChunks = assembled.chunks;

            // Group chunks by document
            const byDocument = new Map<string, ChunkWithPosition[]>();
            for (const chunk of orderedChunks) {
              const docId = chunk.documentId;
              if (!byDocument.has(docId)) {
                byDocument.set(docId, []);
              }
              byDocument.get(docId)!.push(chunk);
            }

            // For each document, verify chunks are in ascending chunkIndex order
            for (const [docId, docChunks] of byDocument) {
              for (let i = 0; i < docChunks.length - 1; i++) {
                const currentIndex = docChunks[i].chunkIndex ?? 0;
                const nextIndex = docChunks[i + 1].chunkIndex ?? 0;
                
                // Current chunk's index should be <= next chunk's index
                if (currentIndex > nextIndex) {
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

    it('chunks from the same document should be grouped together', () => {
      fc.assert(
        fc.property(
          shuffledChunksArb,
          (shuffledChunks: ChunkWithPosition[]) => {
            if (shuffledChunks.length === 0) {
              return true;
            }

            const assembled = assembler.assemble(shuffledChunks);
            const orderedChunks = assembled.chunks;

            // Track which documents we've seen and finished
            const seenDocs = new Set<string>();
            const finishedDocs = new Set<string>();
            let lastDocId: string | null = null;

            for (const chunk of orderedChunks) {
              const docId = chunk.documentId;
              
              // If we've seen this doc before but it was "finished" (we moved to another doc),
              // then chunks are not properly grouped
              if (finishedDocs.has(docId)) {
                return false;
              }

              // If this is a new document
              if (lastDocId !== null && lastDocId !== docId) {
                // Mark the previous document as finished
                finishedDocs.add(lastDocId);
              }

              seenDocs.add(docId);
              lastDocId = docId;
            }

            return true;
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should respect maxChunks limit', () => {
      fc.assert(
        fc.property(
          fc.array(
            fc.record({
              content: fc.string({ minLength: 50, maxLength: 200 }),
              documentName: fc.constant('test.txt'),
              documentId: fc.constant('doc-1'),
              chunkId: fc.uuid(),
              similarity: fc.double({ min: 0.3, max: 1.0 }),
              chunkIndex: fc.integer({ min: 0, max: 20 }),
              startPosition: fc.integer({ min: 0, max: 10000 }),
              endPosition: fc.integer({ min: 0, max: 10000 })
            }),
            { minLength: 1, maxLength: 15 }
          ),
          (chunks: ChunkWithPosition[]) => {
            const assembled = assembler.assemble(chunks);
            
            // Should never exceed maxChunks (6)
            return assembled.chunks.length <= 6;
          }
        ),
        { numRuns: 100 }
      );
    });
  });
});
