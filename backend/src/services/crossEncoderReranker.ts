import { logger } from '../utils/logger';

interface RerankResult {
  documentId: string;
  content: string;
  originalScore: number;
  rerankedScore: number;
  metadata: any;
}

interface RerankerConfig {
  topK: number;
  minScore: number;
  useCache: boolean;
}

const DEFAULT_CONFIG: RerankerConfig = {
  topK: 5,
  minScore: 0.3,
  useCache: true
};

export class CrossEncoderReranker {
  // Fast reranking using term-based scoring (no external API calls)
  async rerank(
    query: string,
    documents: Array<{ documentId: string; content: string; score: number; metadata?: any }>,
    config: Partial<RerankerConfig> = {}
  ): Promise<RerankResult[]> {
    const cfg = { ...DEFAULT_CONFIG, ...config };
    const startTime = Date.now();

    if (documents.length === 0) return [];
    if (documents.length <= cfg.topK) {
      return documents.map(d => ({
        documentId: d.documentId,
        content: d.content,
        originalScore: d.score,
        rerankedScore: d.score,
        metadata: d.metadata
      }));
    }

    try {
      const scores = this.scoreDocuments(query, documents);

      const results: RerankResult[] = documents.map((doc, index) => ({
        documentId: doc.documentId,
        content: doc.content,
        originalScore: doc.score,
        rerankedScore: (doc.score * 0.3) + (scores[index] * 0.7),
        metadata: doc.metadata
      }));

      const sorted = results
        .sort((a, b) => b.rerankedScore - a.rerankedScore)
        .filter(r => r.rerankedScore >= cfg.minScore)
        .slice(0, cfg.topK);

      logger.info(`Reranking completed in ${Date.now() - startTime}ms`, {
        inputDocs: documents.length,
        outputDocs: sorted.length,
        topScore: sorted[0]?.rerankedScore.toFixed(3)
      });

      return sorted;

    } catch (error) {
      logger.error('Reranking failed, using original scores:', error);
      return documents
        .sort((a, b) => b.score - a.score)
        .slice(0, cfg.topK)
        .map(d => ({
          documentId: d.documentId,
          content: d.content,
          originalScore: d.score,
          rerankedScore: d.score,
          metadata: d.metadata
        }));
    }
  }

  private scoreDocuments(
    query: string,
    documents: Array<{ content: string; score: number }>
  ): number[] {
    const queryTerms = this.extractTerms(query);
    
    return documents.map(doc => {
      const docTerms = this.extractTerms(doc.content);
      
      const overlapScore = this.calculateOverlap(queryTerms, docTerms);
      const positionScore = this.calculatePositionScore(query, doc.content);
      const coverageScore = this.calculateCoverageScore(queryTerms, docTerms);
      const densityScore = this.calculateDensityScore(query, doc.content);
      
      return (overlapScore * 0.3) + (positionScore * 0.25) + (coverageScore * 0.25) + (densityScore * 0.2);
    });
  }

  private extractTerms(text: string): Set<string> {
    const stopWords = new Set([
      'the', 'a', 'an', 'is', 'are', 'was', 'were', 'be', 'been', 'being',
      'have', 'has', 'had', 'do', 'does', 'did', 'will', 'would', 'could',
      'should', 'may', 'might', 'must', 'shall', 'can', 'need', 'to', 'of',
      'in', 'for', 'on', 'with', 'at', 'by', 'from', 'as', 'into', 'through',
      'during', 'before', 'after', 'above', 'below', 'between', 'under',
      'and', 'but', 'or', 'nor', 'so', 'yet', 'both', 'either', 'neither',
      'not', 'only', 'own', 'same', 'than', 'too', 'very', 'just', 'also',
      'now', 'here', 'there', 'when', 'where', 'why', 'how', 'all', 'each',
      'every', 'few', 'more', 'most', 'other', 'some', 'such', 'no', 'any',
      'this', 'that', 'these', 'those', 'what', 'which', 'who', 'whom',
      'whose', 'i', 'me', 'my', 'myself', 'we', 'our', 'ours', 'ourselves',
      'you', 'your', 'yours', 'yourself', 'yourselves', 'he', 'him', 'his',
      'himself', 'she', 'her', 'hers', 'herself', 'it', 'its', 'itself',
      'they', 'them', 'their', 'theirs', 'themselves'
    ]);
    
    return new Set(
      text
        .toLowerCase()
        .replace(/[^\w\s]/g, ' ')
        .split(/\s+/)
        .filter(word => word.length > 2 && !stopWords.has(word))
    );
  }

  private calculateOverlap(queryTerms: Set<string>, docTerms: Set<string>): number {
    if (queryTerms.size === 0) return 0;
    
    let matches = 0;
    for (const term of queryTerms) {
      if (docTerms.has(term)) {
        matches++;
      } else {
        // Check for partial matches (stems)
        for (const docTerm of docTerms) {
          if (docTerm.includes(term) || term.includes(docTerm)) {
            matches += 0.5;
            break;
          }
        }
      }
    }
    return Math.min(1, matches / queryTerms.size);
  }

  private calculatePositionScore(query: string, content: string): number {
    const queryTerms = query.toLowerCase().split(/\s+/).filter(t => t.length > 2);
    const contentLower = content.toLowerCase();
    
    let totalPosition = 0;
    let foundTerms = 0;
    
    for (const term of queryTerms) {
      const position = contentLower.indexOf(term);
      if (position !== -1) {
        totalPosition += 1 - (position / contentLower.length);
        foundTerms++;
      }
    }
    
    return foundTerms > 0 ? totalPosition / foundTerms : 0;
  }

  private calculateCoverageScore(queryTerms: Set<string>, docTerms: Set<string>): number {
    if (queryTerms.size === 0) return 0;
    
    let covered = 0;
    for (const term of queryTerms) {
      if (docTerms.has(term)) covered++;
    }
    return covered / queryTerms.size;
  }

  private calculateDensityScore(query: string, content: string): number {
    const queryTerms = query.toLowerCase().split(/\s+/).filter(t => t.length > 2);
    const contentLower = content.toLowerCase();
    const contentWords = contentLower.split(/\s+/);
    
    if (contentWords.length === 0 || queryTerms.length === 0) return 0;
    
    let matchCount = 0;
    for (const word of contentWords) {
      if (queryTerms.some(qt => word.includes(qt) || qt.includes(word))) {
        matchCount++;
      }
    }
    
    // Density = matches per 100 words, capped at 1
    return Math.min(1, (matchCount / contentWords.length) * 10);
  }
}

export const crossEncoderReranker = new CrossEncoderReranker();
