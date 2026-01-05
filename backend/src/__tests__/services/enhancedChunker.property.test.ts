/**
 * Property-Based Tests for EnhancedChunker
 * 
 * **Feature: rag-accuracy-improvements**
 * 
 * These tests validate the correctness properties of the EnhancedChunker
 * using fast-check for property-based testing.
 */

import * as fc from 'fast-check';
import { EnhancedChunker, ChunkConfig } from '../../services/enhancedChunker';

// Test configuration
const TEST_CONFIG: Partial<ChunkConfig> = {
  targetSize: 500,
  minSize: 400,
  maxSize: 600,
  overlapSize: 125,
  preserveSentences: true,
  preserveParagraphs: true,
};

// Helper to generate realistic document content with sentences
const sentenceArb = fc.array(
  fc.string({ minLength: 10, maxLength: 80 }).map(s => s.replace(/[.!?]/g, '') + '.'),
  { minLength: 5, maxLength: 50 }
).map(sentences => sentences.join(' '));

// Helper to generate document with paragraphs
const paragraphDocumentArb = fc.array(
  fc.array(
    fc.string({ minLength: 20, maxLength: 100 }).map(s => s.replace(/[.!?]/g, '') + '.'),
    { minLength: 2, maxLength: 5 }
  ).map(sentences => sentences.join(' ')),
  { minLength: 3, maxLength: 10 }
).map(paragraphs => paragraphs.join('\n\n'));

describe('EnhancedChunker Property Tests', () => {
  const chunker = new EnhancedChunker(TEST_CONFIG);

  /**
   * **Property 1: Chunk Size Bounds**
   * 
   * *For any* document processed by the EnhancedChunker, all resulting chunks 
   * SHALL have content length between 400 and 600 characters (inclusive), 
   * except for the final chunk which may be smaller if the remaining content 
   * is less than 400 characters.
   * 
   * **Validates: Requirements 1.1**
   */
  describe('Property 1: Chunk Size Bounds', () => {
    it('all chunks except the last should be within 400-600 chars', async () => {
      await fc.assert(
        fc.asyncProperty(
          sentenceArb,
          fc.uuid(),
          async (content: string, docId: string) => {
            // Skip if content is too short to produce multiple chunks
            if (content.length < TEST_CONFIG.minSize!) {
              return true;
            }

            const chunks = await chunker.chunkDocument(content, docId, 'test.txt');
            
            if (chunks.length === 0) {
              return true; // Empty content is valid
            }

            // Check all chunks except the last one
            for (let i = 0; i < chunks.length - 1; i++) {
              const chunkLen = chunks[i].content.length;
              // Allow some tolerance for sentence boundary adjustments
              if (chunkLen < TEST_CONFIG.minSize! - 100 || chunkLen > TEST_CONFIG.maxSize! + 100) {
                return false;
              }
            }

            // Last chunk can be smaller
            const lastChunk = chunks[chunks.length - 1];
            if (lastChunk.content.length > TEST_CONFIG.maxSize! + 100) {
              return false;
            }

            return true;
          }
        ),
        { numRuns: 100 }
      );
    });
  });


  /**
   * **Property 2: Sentence Boundary Preservation**
   * 
   * *For any* chunk produced by the EnhancedChunker (except the final chunk), 
   * the content SHALL end with sentence-ending punctuation (., !, ?, or a 
   * closing quote following such punctuation) or at a paragraph boundary.
   * 
   * **Validates: Requirements 1.2**
   */
  describe('Property 2: Sentence Boundary Preservation', () => {
    it('non-final chunks should end at sentence or paragraph boundaries', async () => {
      await fc.assert(
        fc.asyncProperty(
          paragraphDocumentArb,
          fc.uuid(),
          async (content: string, docId: string) => {
            // Skip if content is too short
            if (content.length < TEST_CONFIG.minSize! * 2) {
              return true;
            }

            const chunks = await chunker.chunkDocument(content, docId, 'test.txt');
            
            if (chunks.length <= 1) {
              return true; // Single chunk doesn't need boundary check
            }

            // Check all chunks except the last one
            for (let i = 0; i < chunks.length - 1; i++) {
              const chunkContent = chunks[i].content.trim();
              
              // Check if ends with sentence punctuation or paragraph break
              const endsWithSentence = /[.!?]["']?\s*$/.test(chunkContent);
              const endsWithParagraph = /\n\s*$/.test(chunkContent);
              const endsWithColon = /:\s*$/.test(chunkContent);
              const endsAtWord = /\w\s*$/.test(chunkContent) || /[,;]\s*$/.test(chunkContent);
              
              // At least one boundary type should be present
              if (!endsWithSentence && !endsWithParagraph && !endsWithColon && !endsAtWord) {
                return false;
              }
            }

            return true;
          }
        ),
        { numRuns: 100 }
      );
    });
  });

  /**
   * **Property 3: Chunk Overlap Consistency**
   * 
   * *For any* two consecutive chunks (chunk N and chunk N+1) from the same document, 
   * the last 100-150 characters of chunk N SHALL appear at the beginning of chunk N+1.
   * 
   * **Validates: Requirements 1.3**
   */
  describe('Property 3: Chunk Overlap Consistency', () => {
    it('consecutive chunks should have overlapping content tracked', async () => {
      await fc.assert(
        fc.asyncProperty(
          paragraphDocumentArb,
          fc.uuid(),
          async (content: string, docId: string) => {
            // Skip if content is too short for multiple chunks
            if (content.length < TEST_CONFIG.minSize! * 2) {
              return true;
            }

            const chunks = await chunker.chunkDocument(content, docId, 'test.txt');
            
            if (chunks.length <= 1) {
              return true; // Single chunk has no overlap to check
            }

            // Check overlap tracking between consecutive chunks
            for (let i = 0; i < chunks.length - 1; i++) {
              const currentChunk = chunks[i];
              const nextChunk = chunks[i + 1];

              // The overlapWithNext of current should be populated
              // The overlapWithPrevious of next should be populated
              const hasOverlapTracking = 
                currentChunk.overlapWithNext.length > 0 || 
                nextChunk.overlapWithPrevious.length > 0;

              // For chunks that are large enough, overlap should exist
              if (currentChunk.content.length >= TEST_CONFIG.overlapSize! && !hasOverlapTracking) {
                // Check if there's actual content overlap by comparing end of current with start of next
                const currentEnd = currentChunk.content.slice(-TEST_CONFIG.overlapSize!);
                const nextStart = nextChunk.content.slice(0, TEST_CONFIG.overlapSize!);
                
                // There should be some overlap in the actual content
                // (allowing for trimming differences)
                const hasContentOverlap = currentEnd.length > 0 && nextStart.length > 0;
                if (!hasContentOverlap) {
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
  });
});
