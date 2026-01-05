import { OpenAI } from 'openai';
import { logger } from '../utils/logger';

interface ValidationResult {
  isValid: boolean;
  confidence: number;
  issues: string[];
  suggestions: string[];
  hallucinations: string[];
  citationAccuracy: number;
}

export class ResponseValidator {
  private openai: OpenAI | null = null;

  private getOpenAI(): OpenAI {
    if (!this.openai) {
      this.openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
    }
    return this.openai;
  }

  async validateResponse(
    query: string,
    response: string,
    sources: string[]
  ): Promise<ValidationResult> {
    const startTime = Date.now();

    try {
      // 1. Check citation accuracy
      const citationAccuracy = this.checkCitations(response, sources);

      // 2. Check for potential hallucinations
      const hallucinations = await this.detectHallucinations(response, sources);

      // 3. Calculate overall confidence
      const confidence = this.calculateConfidence({
        citationAccuracy,
        hallucinationCount: hallucinations.length,
        sourceCount: sources.length,
        responseLength: response.length
      });

      // 4. Generate suggestions for improvement
      const suggestions = this.generateSuggestions({
        citationAccuracy,
        hallucinations,
        confidence
      });

      const result: ValidationResult = {
        isValid: confidence > 0.6 && hallucinations.length === 0,
        confidence,
        issues: hallucinations.length > 0 ? ['Potential hallucinations detected'] : [],
        suggestions,
        hallucinations,
        citationAccuracy
      };

      logger.info(`Response validated in ${Date.now() - startTime}ms`, {
        confidence,
        isValid: result.isValid,
        hallucinationCount: hallucinations.length
      });

      return result;

    } catch (error) {
      logger.error('Response validation failed:', error);
      return {
        isValid: true, // Don't block on validation failure
        confidence: 0.5,
        issues: ['Validation could not be completed'],
        suggestions: [],
        hallucinations: [],
        citationAccuracy: 0
      };
    }
  }

  private checkCitations(response: string, sources: string[]): number {
    // Extract citations from response [Source N]
    const citationRegex = /\[Source (\d+)\]/g;
    const citations = [...response.matchAll(citationRegex)];
    
    if (citations.length === 0) return 0;

    // Check if cited sources exist
    const validCitations = citations.filter(match => {
      const sourceIndex = parseInt(match[1]) - 1;
      return sourceIndex >= 0 && sourceIndex < sources.length;
    });

    return validCitations.length / citations.length;
  }

  private async detectHallucinations(response: string, sources: string[]): Promise<string[]> {
    // Quick check: if response is short, less likely to hallucinate
    if (response.length < 100) return [];

    // Extract claims from response
    const claims = response
      .split(/[.!?]/)
      .filter(s => s.trim().length > 20)
      .map(s => s.trim());

    const hallucinations: string[] = [];
    const sourcesText = sources.join(' ').toLowerCase();

    for (const claim of claims) {
      // Check if key terms from claim exist in sources
      const claimWords = claim.toLowerCase().split(/\s+/).filter(w => w.length > 4);
      const matchedWords = claimWords.filter(w => sourcesText.includes(w));
      
      // If less than 30% of significant words match, might be hallucination
      if (claimWords.length > 3 && matchedWords.length / claimWords.length < 0.3) {
        // Double-check with LLM (only for suspicious claims)
        const isHallucination = await this.verifyClaimWithLLM(claim, sources);
        if (isHallucination) {
          hallucinations.push(claim);
        }
      }
    }

    return hallucinations;
  }

  private async verifyClaimWithLLM(claim: string, sources: string[]): Promise<boolean> {
    try {
      const response = await this.getOpenAI().chat.completions.create({
        model: 'gpt-5',
        messages: [
          {
            role: 'system',
            content: 'You verify if a claim is supported by given sources. Return only "true" if the claim is NOT supported (hallucination) or "false" if it IS supported.'
          },
          {
            role: 'user',
            content: `Claim: "${claim}"\n\nSources:\n${sources.slice(0, 3).join('\n\n')}\n\nIs this a hallucination (not supported)?`
          }
        ],
        temperature: 1,
        max_completion_tokens: 10
      });

      return response.choices[0]?.message?.content?.toLowerCase().includes('true') || false;
    } catch {
      return false; // Don't flag as hallucination if check fails
    }
  }

  private calculateConfidence(params: {
    citationAccuracy: number;
    hallucinationCount: number;
    sourceCount: number;
    responseLength: number;
  }): number {
    const { citationAccuracy, hallucinationCount, sourceCount, responseLength } = params;

    let confidence = 0.5; // Base confidence

    // Citation accuracy boost
    confidence += citationAccuracy * 0.3;

    // Source count boost (more sources = more confidence, up to a point)
    confidence += Math.min(sourceCount / 10, 0.2);

    // Hallucination penalty
    confidence -= hallucinationCount * 0.2;

    // Response length consideration
    if (responseLength > 100 && responseLength < 2000) {
      confidence += 0.1;
    }

    return Math.max(0, Math.min(1, confidence));
  }

  private generateSuggestions(params: {
    citationAccuracy: number;
    hallucinations: string[];
    confidence: number;
  }): string[] {
    const suggestions: string[] = [];

    if (params.citationAccuracy < 0.5) {
      suggestions.push('Add more source citations to support claims');
    }

    if (params.hallucinations.length > 0) {
      suggestions.push('Review and remove unsupported claims');
    }

    if (params.confidence < 0.7) {
      suggestions.push('Consider adding more relevant documents to knowledge base');
    }

    return suggestions;
  }
}

export const responseValidator = new ResponseValidator();
