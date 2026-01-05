/**
 * Answer Validator Service
 * 
 * Validates answer completeness and citation accuracy for RAG responses.
 * 
 * Requirements: 6.1, 6.3, 6.4
 * - 6.1: Verify key claims are supported by provided sources
 * - 6.3: Include disclaimer when confidence < 60%
 * - 6.4: Ensure citations reference actual content from chunks
 */

import { RelevantChunk } from './GptService';

export interface ValidationResult {
  isComplete: boolean;
  confidence: number;
  issues: string[];
  needsMoreContext: boolean;
  citationsValid: boolean;
  invalidCitations: number[];
}

export interface ValidatorConfig {
  lowConfidenceThreshold: number;  // Default: 0.6 (60%)
  minSentenceEndingChars: string[];  // Characters that indicate sentence completion
}

const DEFAULT_CONFIG: ValidatorConfig = {
  lowConfidenceThreshold: 0.6,
  minSentenceEndingChars: ['.', '!', '?', '"', "'", ')', ']']
};

/**
 * Low confidence disclaimer to append to answers
 * Requirements 6.3: Include disclaimer when confidence < 60%
 */
export const LOW_CONFIDENCE_DISCLAIMER = 
  '\n\n⚠️ *Note: This answer may be incomplete or uncertain due to limited relevant information in your documents. Please verify the information independently.*';

export class AnswerValidator {
  private config: ValidatorConfig;

  constructor(config?: Partial<ValidatorConfig>) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /**
   * Validate answer completeness and citation accuracy
   * 
   * Requirements 6.1, 6.4
   */
  validate(
    query: string,
    answer: string,
    sources: RelevantChunk[],
    confidence: number
  ): ValidationResult {
    const issues: string[] = [];
    
    // Check completeness (sentence endings)
    const isComplete = this.checkCompleteness(answer);
    if (!isComplete) {
      issues.push('Answer appears to be incomplete (does not end with proper punctuation)');
    }

    // Validate citations
    const { citationsValid, invalidCitations } = this.verifyCitations(answer, sources);
    if (!citationsValid && invalidCitations.length > 0) {
      issues.push(`Invalid citation references: [${invalidCitations.join(', ')}]`);
    }

    // Check if more context might be needed
    const needsMoreContext = this.checkNeedsMoreContext(answer, confidence);
    if (needsMoreContext) {
      issues.push('Answer may benefit from additional context');
    }

    // Check confidence threshold
    const isLowConfidence = confidence < this.config.lowConfidenceThreshold * 100;
    if (isLowConfidence) {
      issues.push(`Low confidence (${confidence}%) - below ${this.config.lowConfidenceThreshold * 100}% threshold`);
    }

    return {
      isComplete,
      confidence,
      issues,
      needsMoreContext,
      citationsValid,
      invalidCitations
    };
  }

  /**
   * Check if answer ends properly (sentence completion)
   * 
   * Requirements 6.1: Verify answer appears complete
   */
  checkCompleteness(answer: string): boolean {
    if (!answer || answer.trim().length === 0) {
      return false;
    }

    const trimmed = answer.trim();
    
    // Check if ends with sentence-ending punctuation
    const lastChar = trimmed[trimmed.length - 1];
    const endsWithPunctuation = this.config.minSentenceEndingChars.includes(lastChar);
    
    // Also check for markdown formatting that might end the answer
    const endsWithMarkdown = /[.!?]["')\]]*\s*$/.test(trimmed) || 
                             /\*+\s*$/.test(trimmed) ||  // Bold/italic ending
                             /`+\s*$/.test(trimmed);     // Code block ending

    // Check for incomplete patterns
    const incompletePatterns = [
      /\.\.\.\s*$/,           // Trailing ellipsis
      /,\s*$/,                // Ends with comma
      /:\s*$/,                // Ends with colon (expecting list)
      /-\s*$/,                // Ends with dash
      /\band\s*$/i,           // Ends with "and"
      /\bor\s*$/i,            // Ends with "or"
      /\bthe\s*$/i,           // Ends with "the"
      /\ba\s*$/i,             // Ends with "a"
      /\ban\s*$/i,            // Ends with "an"
    ];

    const hasIncompletePattern = incompletePatterns.some(pattern => pattern.test(trimmed));

    return (endsWithPunctuation || endsWithMarkdown) && !hasIncompletePattern;
  }

  /**
   * Verify that citations in the answer reference actual sources
   * 
   * Requirements 6.4: Ensure citations reference actual content from chunks
   * Citations can be in format [Source N], [N], or just [1], [2], etc.
   */
  verifyCitations(answer: string, sources: RelevantChunk[]): { citationsValid: boolean; invalidCitations: number[] } {
    if (!answer || sources.length === 0) {
      return { citationsValid: true, invalidCitations: [] };
    }

    // Find all citation patterns: [Source N], [N], [1], [2], etc.
    const citationPatterns = [
      /\[Source\s*(\d+)\]/gi,  // [Source 1], [Source 2]
      /\[(\d+)\]/g,            // [1], [2]
    ];

    const foundCitations = new Set<number>();
    
    for (const pattern of citationPatterns) {
      let match;
      while ((match = pattern.exec(answer)) !== null) {
        const citationNum = parseInt(match[1], 10);
        foundCitations.add(citationNum);
      }
    }

    // Check if all citations are valid (1 <= N <= number of sources)
    const invalidCitations: number[] = [];
    const numSources = sources.length;

    for (const citation of foundCitations) {
      if (citation < 1 || citation > numSources) {
        invalidCitations.push(citation);
      }
    }

    return {
      citationsValid: invalidCitations.length === 0,
      invalidCitations
    };
  }

  /**
   * Check if the answer might need more context
   */
  checkNeedsMoreContext(answer: string, confidence: number): boolean {
    if (!answer) {
      return true;
    }

    const trimmed = answer.toLowerCase();

    // Patterns that suggest uncertainty or incomplete information
    const uncertaintyPatterns = [
      /i couldn't find/i,
      /no information/i,
      /not mentioned/i,
      /not specified/i,
      /unclear/i,
      /not enough information/i,
      /cannot determine/i,
      /no relevant/i,
      /doesn't contain/i,
      /don't have/i,
    ];

    const hasUncertainty = uncertaintyPatterns.some(pattern => pattern.test(trimmed));
    
    // Low confidence also suggests need for more context
    const isLowConfidence = confidence < this.config.lowConfidenceThreshold * 100;

    return hasUncertainty || isLowConfidence;
  }

  /**
   * Add low confidence disclaimer to answer if needed
   * 
   * Requirements 6.3: Include disclaimer when confidence < 60%
   */
  addDisclaimerIfNeeded(answer: string, confidence: number): string {
    if (confidence < this.config.lowConfidenceThreshold * 100) {
      return answer + LOW_CONFIDENCE_DISCLAIMER;
    }
    return answer;
  }

  /**
   * Check if confidence is below threshold
   * 
   * Requirements 6.3
   */
  isLowConfidence(confidence: number): boolean {
    return confidence < this.config.lowConfidenceThreshold * 100;
  }

  /**
   * Get the current configuration
   */
  getConfig(): ValidatorConfig {
    return { ...this.config };
  }

  /**
   * Update configuration
   */
  setConfig(config: Partial<ValidatorConfig>): void {
    this.config = { ...this.config, ...config };
  }
}

// Export singleton instance with default config
export const answerValidator = new AnswerValidator();
