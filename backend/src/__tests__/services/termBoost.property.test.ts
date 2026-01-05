/**
 * Property-Based Tests for Term Boost Application
 * 
 * **Feature: rag-accuracy-improvements**
 * 
 * These tests validate the correctness properties of the term boost
 * functionality in the multi-stage reranker using fast-check for 
 * property-based testing.
 */

import * as fc from 'fast-check';
import { CohereReranker, DEFAULT_RERANK_CONFIG, RerankResult } from '../../services/cohereReranker';

// Default term boost factor from design spec (Requirements 3.5)
const TERM_BOOST_FACTOR = 1.2;

// Create a test instance of CohereReranker
const reranker = new CohereReranker();

// Helper to create mock RerankResult
const createMockChunk = (
  documentId: string,
  content: string,
  score: number
): RerankResult => ({
  documentId,
  content,
  originalScore: score,
  rerankedScore: score,
  relevanceScore: score,
  metadata: {}
});

// Stop words set for filtering
const stopWords = new Set([
  'the', 'a', 'an', 'is', 'are', 'was', 'were', 'be', 'been', 'being',
  'have', 'has', 'had', 'do', 'does', 'did', 'will', 'would', 'could',
  'should', 'may', 'might', 'must', 'shall', 'can', 'need', 'to', 'of',
  'in', 'for', 'on', 'with', 'at', 'by', 'from', 'as', 'into', 'through',
  'and', 'but', 'or', 'nor', 'so', 'yet', 'both', 'either', 'neither',
  'not', 'only', 'own', 'same', 'than', 'too', 'very', 'just', 'also',
  'what', 'which', 'who', 'whom', 'whose', 'where', 'when', 'why', 'how'
]);

// Arbitrary for generating non-empty words (excluding stop words)
const nonStopWordArb: fc.Arbitrary<string> = fc.string({ minLength: 4, maxLength: 10 })
  .filter((word: string) => {
    // Only allow alphabetic characters
    if (!/^[a-zA-Z]+$/.test(word)) return false;
    return !stopWords.has(word.toLowerCase());
  });

// Arbitrary for generating query terms
const queryTermsArb: fc.Arbitrary<string[]> = fc.array(nonStopWordArb, { minLength: 1, maxLength: 5 });

// Arbitrary for generating scores between 0 and 1
const scoreArb: fc.Arbitrary<number> = fc.float({ min: Math.fround(0.1), max: Math.fround(0.9), noNaN: true });

describe('Term Boost Property Tests', () => {
  /**
   * **Property 10: Term Boost Application**
   * 
   * *For any* query containing specific terms, chunks that contain exact matches 
   * of those terms SHALL receive a score boost of at least 1.2x during reranking.
   * 
   * **Validates: Requirements 3.5**
   */
  describe('Property 10: Term Boost Application', () => {
    it('should boost chunks containing exact query term matches by at least 1.2x', () => {
      fc.assert(
        fc.property(
          queryTermsArb,
          scoreArb,
          (queryTerms: string[], originalScore: number) => {
            // Create a query from the terms
            const query = queryTerms.join(' ');
            
            // Create a chunk that contains the query terms
            const contentWithTerms = `This document discusses ${queryTerms.join(' and ')} in detail.`;
            const chunk = createMockChunk('doc1', contentWithTerms, originalScore);
            
            // Apply term boost
            const boostedChunks = reranker.applyTermBoost(query, [chunk]);
            
            // The boosted score should be at least 1.2x the original (capped at 1)
            const expectedMinScore = Math.min(1, originalScore * TERM_BOOST_FACTOR);
            
            return boostedChunks[0].rerankedScore >= expectedMinScore - 0.001; // Small epsilon for float comparison
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should not boost chunks that do not contain query terms', () => {
      fc.assert(
        fc.property(
          queryTermsArb,
          scoreArb,
          (queryTerms: string[], originalScore: number) => {
            // Create a query from the terms
            const query = queryTerms.join(' ');
            
            // Create a chunk that does NOT contain the query terms
            const contentWithoutTerms = 'This is completely unrelated content about different topics.';
            const chunk = createMockChunk('doc1', contentWithoutTerms, originalScore);
            
            // Verify the content doesn't contain the terms
            const hasTerms = queryTerms.some((term: string) => {
              const regex = new RegExp(`\\b${term.toLowerCase()}\\b`, 'i');
              return regex.test(contentWithoutTerms.toLowerCase());
            });
            
            if (hasTerms) {
              // Skip this test case if content accidentally contains terms
              return true;
            }
            
            // Apply term boost
            const boostedChunks = reranker.applyTermBoost(query, [chunk]);
            
            // The score should remain unchanged
            return boostedChunks[0].rerankedScore === originalScore;
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should apply boost factor of exactly 1.2x (or cap at 1.0)', () => {
      fc.assert(
        fc.property(
          nonStopWordArb,
          scoreArb,
          (term: string, originalScore: number) => {
            const query = term;
            const content = `The ${term} is important for this document.`;
            const chunk = createMockChunk('doc1', content, originalScore);
            
            const boostedChunks = reranker.applyTermBoost(query, [chunk]);
            
            const expectedScore = Math.min(1, originalScore * TERM_BOOST_FACTOR);
            const actualScore = boostedChunks[0].rerankedScore;
            
            // Allow small floating point tolerance
            return Math.abs(actualScore - expectedScore) < 0.001;
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should boost both rerankedScore and relevanceScore', () => {
      fc.assert(
        fc.property(
          nonStopWordArb,
          scoreArb,
          (term: string, originalScore: number) => {
            const query = term;
            const content = `Document about ${term} and related concepts.`;
            const chunk = createMockChunk('doc1', content, originalScore);
            
            const boostedChunks = reranker.applyTermBoost(query, [chunk]);
            
            // Both scores should be boosted equally
            return boostedChunks[0].rerankedScore === boostedChunks[0].relevanceScore;
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should handle multiple chunks with mixed term matches', () => {
      fc.assert(
        fc.property(
          nonStopWordArb,
          fc.array(scoreArb, { minLength: 2, maxLength: 5 }),
          (term: string, scores: number[]) => {
            const query = term;
            
            // Create chunks - some with the term, some without
            const chunks = scores.map((score: number, index: number) => {
              const hasMatch = index % 2 === 0;
              const content = hasMatch 
                ? `This chunk contains ${term} explicitly.`
                : 'This chunk has completely different content.';
              return createMockChunk(`doc${index}`, content, score);
            });
            
            const boostedChunks = reranker.applyTermBoost(query, chunks);
            
            // Verify each chunk is boosted correctly
            return boostedChunks.every((chunk: RerankResult, index: number) => {
              const originalScore = scores[index];
              const hasMatch = index % 2 === 0;
              
              if (hasMatch) {
                const expectedScore = Math.min(1, originalScore * TERM_BOOST_FACTOR);
                return Math.abs(chunk.rerankedScore - expectedScore) < 0.001;
              } else {
                return chunk.rerankedScore === originalScore;
              }
            });
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should match terms case-insensitively', () => {
      fc.assert(
        fc.property(
          nonStopWordArb,
          scoreArb,
          fc.constantFrom('lower', 'upper', 'mixed'),
          (term: string, originalScore: number, caseType: string) => {
            // Create query with different case
            let queryTerm: string;
            switch (caseType) {
              case 'upper':
                queryTerm = term.toUpperCase();
                break;
              case 'mixed':
                queryTerm = term.charAt(0).toUpperCase() + term.slice(1).toLowerCase();
                break;
              default:
                queryTerm = term.toLowerCase();
            }
            
            const query = queryTerm;
            const content = `This document mentions ${term.toLowerCase()} as a key concept.`;
            const chunk = createMockChunk('doc1', content, originalScore);
            
            const boostedChunks = reranker.applyTermBoost(query, [chunk]);
            
            // Should be boosted regardless of case
            const expectedScore = Math.min(1, originalScore * TERM_BOOST_FACTOR);
            return Math.abs(boostedChunks[0].rerankedScore - expectedScore) < 0.001;
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should only match whole words, not substrings', () => {
      // Test that "test" doesn't match "testing" or "contest"
      const query = 'test';
      const contentWithSubstring = 'This document is about testing and contests.';
      const contentWithExactMatch = 'This document is about test cases.';
      
      const chunkSubstring = createMockChunk('doc1', contentWithSubstring, 0.5);
      const chunkExact = createMockChunk('doc2', contentWithExactMatch, 0.5);
      
      const boostedSubstring = reranker.applyTermBoost(query, [chunkSubstring]);
      const boostedExact = reranker.applyTermBoost(query, [chunkExact]);
      
      // Substring should NOT be boosted
      expect(boostedSubstring[0].rerankedScore).toBe(0.5);
      
      // Exact match should be boosted
      expect(boostedExact[0].rerankedScore).toBeCloseTo(0.5 * TERM_BOOST_FACTOR, 3);
    });

    it('should return empty array for empty input', () => {
      const result = reranker.applyTermBoost('test query', []);
      expect(result).toEqual([]);
    });

    it('should return unchanged chunks when query has no valid terms', () => {
      fc.assert(
        fc.property(
          scoreArb,
          (originalScore) => {
            // Query with only stop words
            const query = 'the a an is are';
            const content = 'Some document content here.';
            const chunk = createMockChunk('doc1', content, originalScore);
            
            const boostedChunks = reranker.applyTermBoost(query, [chunk]);
            
            // Score should remain unchanged
            return boostedChunks[0].rerankedScore === originalScore;
          }
        ),
        { numRuns: 100 }
      );
    });
  });

  /**
   * Additional property tests for term extraction
   */
  describe('Query Term Extraction Properties', () => {
    it('should extract non-stop words from query', () => {
      fc.assert(
        fc.property(
          queryTermsArb,
          (terms: string[]) => {
            const query = terms.join(' ');
            const extractedTerms = reranker.extractQueryTerms(query);
            
            // All extracted terms should be from the original terms
            return extractedTerms.every((extracted: string) => 
              terms.some((original: string) => original.toLowerCase() === extracted)
            );
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should filter out stop words', () => {
      const stopWordsList = ['the', 'a', 'an', 'is', 'are', 'was', 'were', 'to', 'of', 'in', 'for'];
      const query = stopWordsList.join(' ');
      const extractedTerms = reranker.extractQueryTerms(query);
      
      expect(extractedTerms.length).toBe(0);
    });

    it('should filter out short words (length <= 2)', () => {
      const query = 'a an is it to of in on at by';
      const extractedTerms = reranker.extractQueryTerms(query);
      
      expect(extractedTerms.length).toBe(0);
    });

    it('should convert terms to lowercase', () => {
      fc.assert(
        fc.property(
          nonStopWordArb,
          (term: string) => {
            const query = term.toUpperCase();
            const extractedTerms = reranker.extractQueryTerms(query);
            
            return extractedTerms.every((t: string) => t === t.toLowerCase());
          }
        ),
        { numRuns: 100 }
      );
    });
  });

  /**
   * Configuration property tests
   */
  describe('Configuration Properties', () => {
    it('should have default term boost factor of 1.2', () => {
      const config = reranker.getConfig();
      expect(config.termBoostFactor).toBe(TERM_BOOST_FACTOR);
    });

    it('should use rerank-english-v3.0 model by default', () => {
      const config = reranker.getConfig();
      expect(config.cohereModel).toBe('rerank-english-v3.0');
    });

    it('should have ms-marco-MiniLM-L-6-v2 as fallback model', () => {
      const config = reranker.getConfig();
      expect(config.fallbackModel).toBe('ms-marco-MiniLM-L-6-v2');
    });

    it('should have default topK of 6', () => {
      const config = reranker.getConfig();
      expect(config.topK).toBe(6);
    });
  });
});
