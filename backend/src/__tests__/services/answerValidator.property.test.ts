/**
 * Property-Based Tests for AnswerValidator
 * 
 * **Feature: rag-accuracy-improvements**
 * 
 * These tests validate the correctness properties of the AnswerValidator
 * using fast-check for property-based testing.
 */

import * as fc from 'fast-check';
import { 
  AnswerValidator, 
  LOW_CONFIDENCE_DISCLAIMER 
} from '../../services/answerValidator';
import { RelevantChunk } from '../../services/GptService';

// Helper to generate a valid RelevantChunk
const relevantChunkArb = (sourceIndex: number): fc.Arbitrary<RelevantChunk> => {
  return fc.record({
    content: fc.string({ minLength: 50, maxLength: 500 }),
    documentName: fc.constant(`document-${sourceIndex}.txt`),
    documentId: fc.uuid(),
    chunkId: fc.uuid(),
    similarity: fc.double({ min: 0.3, max: 1.0 })
  });
};

// Generate an array of sources (1-6 sources)
const sourcesArb = fc.integer({ min: 1, max: 6 }).chain(numSources => {
  return fc.tuple(
    ...Array.from({ length: numSources }, (_, i) => relevantChunkArb(i + 1))
  );
});

// Generate a complete answer (ends with proper punctuation)
const completeAnswerArb = fc.tuple(
  fc.string({ minLength: 10, maxLength: 200 }),
  fc.constantFrom('.', '!', '?', '."', ".'", '.)', '.]')
).map(([text, ending]) => text.replace(/[.!?]+$/, '') + ending);

// Generate an incomplete answer (ends without proper punctuation)
const incompleteAnswerArb = fc.tuple(
  fc.string({ minLength: 10, maxLength: 200 }),
  fc.constantFrom(',', ':', '-', ' and', ' or', ' the', '...')
).map(([text, ending]) => text.replace(/[.!?,:\-]+$/, '') + ending);

describe('AnswerValidator Property Tests', () => {
  const validator = new AnswerValidator();

  /**
   * **Property 13: Low Confidence Disclaimer**
   * 
   * *For any* generated answer where confidence is below 60%, 
   * the response SHALL include an uncertainty indicator or disclaimer.
   * 
   * **Validates: Requirements 4.5, 6.3**
   */
  describe('Property 13: Low Confidence Disclaimer', () => {
    it('answers with confidence < 60% should have disclaimer added', () => {
      fc.assert(
        fc.property(
          completeAnswerArb,
          fc.integer({ min: 0, max: 59 }), // Low confidence: 0-59%
          (answer: string, confidence: number) => {
            const result = validator.addDisclaimerIfNeeded(answer, confidence);
            
            // Should contain the disclaimer
            return result.includes(LOW_CONFIDENCE_DISCLAIMER);
          }
        ),
        { numRuns: 100 }
      );
    });

    it('answers with confidence >= 60% should NOT have disclaimer added', () => {
      fc.assert(
        fc.property(
          completeAnswerArb,
          fc.integer({ min: 60, max: 100 }), // High confidence: 60-100%
          (answer: string, confidence: number) => {
            const result = validator.addDisclaimerIfNeeded(answer, confidence);
            
            // Should NOT contain the disclaimer
            return !result.includes(LOW_CONFIDENCE_DISCLAIMER);
          }
        ),
        { numRuns: 100 }
      );
    });

    it('isLowConfidence should return true for confidence < 60%', () => {
      fc.assert(
        fc.property(
          fc.integer({ min: 0, max: 59 }),
          (confidence: number) => {
            return validator.isLowConfidence(confidence) === true;
          }
        ),
        { numRuns: 100 }
      );
    });

    it('isLowConfidence should return false for confidence >= 60%', () => {
      fc.assert(
        fc.property(
          fc.integer({ min: 60, max: 100 }),
          (confidence: number) => {
            return validator.isLowConfidence(confidence) === false;
          }
        ),
        { numRuns: 100 }
      );
    });

    it('validation result should flag low confidence in issues', () => {
      fc.assert(
        fc.property(
          completeAnswerArb,
          sourcesArb,
          fc.integer({ min: 0, max: 59 }),
          (answer: string, sources: RelevantChunk[], confidence: number) => {
            const result = validator.validate('test query', answer, sources, confidence);
            
            // Issues should mention low confidence
            return result.issues.some(issue => 
              issue.toLowerCase().includes('low confidence') || 
              issue.toLowerCase().includes('below')
            );
          }
        ),
        { numRuns: 100 }
      );
    });

    it('disclaimer should preserve original answer content', () => {
      fc.assert(
        fc.property(
          completeAnswerArb,
          fc.integer({ min: 0, max: 59 }),
          (answer: string, confidence: number) => {
            const result = validator.addDisclaimerIfNeeded(answer, confidence);
            
            // Original answer should be at the start
            return result.startsWith(answer);
          }
        ),
        { numRuns: 100 }
      );
    });
  });

  /**
   * **Property 18: Citation Validity**
   * 
   * *For any* answer containing citations in the format [Source N] or [N], 
   * the citation number N SHALL correspond to an actual source in the provided context 
   * (1 ≤ N ≤ number of sources).
   * 
   * **Validates: Requirements 6.4**
   */
  describe('Property 18: Citation Validity', () => {
    // Generate an answer with valid citations
    const answerWithValidCitationsArb = (numSources: number): fc.Arbitrary<string> => {
      return fc.array(
        fc.tuple(
          fc.string({ minLength: 10, maxLength: 50 }),
          fc.integer({ min: 1, max: numSources }),
          fc.constantFrom('[Source ', '[')
        ),
        { minLength: 1, maxLength: 5 }
      ).map(parts => {
        return parts.map(([text, citation, format]) => {
          return `${text} ${format}${citation}]`;
        }).join(' ') + '.';
      });
    };

    // Generate an answer with invalid citations (out of range)
    const answerWithInvalidCitationsArb = (numSources: number): fc.Arbitrary<string> => {
      return fc.tuple(
        fc.string({ minLength: 10, maxLength: 50 }),
        fc.integer({ min: numSources + 1, max: numSources + 10 }), // Invalid: > numSources
        fc.constantFrom('[Source ', '[')
      ).map(([text, citation, format]) => {
        return `${text} ${format}${citation}].`;
      });
    };

    it('valid citations (1 <= N <= numSources) should pass validation', () => {
      fc.assert(
        fc.property(
          fc.integer({ min: 1, max: 6 }).chain(numSources => {
            return fc.tuple(
              answerWithValidCitationsArb(numSources),
              fc.tuple(...Array.from({ length: numSources }, (_, i) => relevantChunkArb(i + 1)))
            );
          }),
          ([answer, sources]: [string, RelevantChunk[]]) => {
            const { citationsValid, invalidCitations } = validator.verifyCitations(answer, sources);
            
            return citationsValid === true && invalidCitations.length === 0;
          }
        ),
        { numRuns: 100 }
      );
    });

    it('invalid citations (N > numSources) should fail validation', () => {
      fc.assert(
        fc.property(
          fc.integer({ min: 1, max: 5 }).chain(numSources => {
            return fc.tuple(
              answerWithInvalidCitationsArb(numSources),
              fc.tuple(...Array.from({ length: numSources }, (_, i) => relevantChunkArb(i + 1)))
            );
          }),
          ([answer, sources]: [string, RelevantChunk[]]) => {
            const { citationsValid, invalidCitations } = validator.verifyCitations(answer, sources);
            
            return citationsValid === false && invalidCitations.length > 0;
          }
        ),
        { numRuns: 100 }
      );
    });

    it('citation [0] should be invalid (sources are 1-indexed)', () => {
      fc.assert(
        fc.property(
          sourcesArb,
          (sources: RelevantChunk[]) => {
            const answerWithZeroCitation = 'This is from [0] which is invalid.';
            const { citationsValid, invalidCitations } = validator.verifyCitations(answerWithZeroCitation, sources);
            
            return citationsValid === false && invalidCitations.includes(0);
          }
        ),
        { numRuns: 100 }
      );
    });

    it('answers without citations should pass validation', () => {
      fc.assert(
        fc.property(
          fc.string({ minLength: 20, maxLength: 200 }).filter(s => !/\[\d+\]/.test(s) && !/\[Source\s*\d+\]/i.test(s)),
          sourcesArb,
          (answer: string, sources: RelevantChunk[]) => {
            const { citationsValid, invalidCitations } = validator.verifyCitations(answer + '.', sources);
            
            return citationsValid === true && invalidCitations.length === 0;
          }
        ),
        { numRuns: 100 }
      );
    });

    it('invalid citations should be listed in invalidCitations array', () => {
      fc.assert(
        fc.property(
          fc.integer({ min: 1, max: 3 }),
          fc.integer({ min: 10, max: 20 }), // Invalid citation number
          (numSources: number, invalidCitation: number) => {
            const sources = Array.from({ length: numSources }, (_, i) => ({
              content: `Content ${i}`,
              documentName: `doc-${i}.txt`,
              documentId: `doc-${i}`,
              chunkId: `chunk-${i}`,
              similarity: 0.8
            }));
            
            const answer = `This references [${invalidCitation}] which is invalid.`;
            const { invalidCitations } = validator.verifyCitations(answer, sources);
            
            return invalidCitations.includes(invalidCitation);
          }
        ),
        { numRuns: 100 }
      );
    });
  });

  /**
   * Additional completeness tests
   */
  describe('Answer Completeness', () => {
    it('answers ending with sentence punctuation should be complete', () => {
      fc.assert(
        fc.property(
          completeAnswerArb,
          (answer: string) => {
            return validator.checkCompleteness(answer) === true;
          }
        ),
        { numRuns: 100 }
      );
    });

    it('answers ending with incomplete patterns should be incomplete', () => {
      fc.assert(
        fc.property(
          incompleteAnswerArb,
          (answer: string) => {
            return validator.checkCompleteness(answer) === false;
          }
        ),
        { numRuns: 100 }
      );
    });

    it('empty answers should be incomplete', () => {
      fc.assert(
        fc.property(
          fc.constantFrom('', '   ', '\n', '\t'),
          (answer: string) => {
            return validator.checkCompleteness(answer) === false;
          }
        ),
        { numRuns: 100 }
      );
    });
  });
});
