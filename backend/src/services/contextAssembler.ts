/**
 * Context Assembler Service
 * 
 * Prepares optimal context for LLM answer generation by:
 * - Ordering chunks from the same document by their original position
 * - Limiting total chunks to prevent context overflow
 * - Formatting context for LLM consumption
 * 
 * Requirements: 4.1, 4.2
 */

import { RelevantChunk } from './ClaudeService';

export interface ContextConfig {
  maxChunks: number;        // Maximum chunks to include (default: 6)
  maxTokens: number;        // Maximum estimated tokens (default: 4000)
  orderByPosition: boolean; // Order same-doc chunks by position (default: true)
  includeOverlap: boolean;  // Include overlap metadata if available (default: true)
}

export interface AssembledContext {
  chunks: RelevantChunk[];
  formattedContext: string;
  totalTokens: number;
  documentOrder: Map<string, number[]>; // docId -> chunk indices in order
}

/**
 * Extended chunk interface with position metadata for ordering
 */
export interface ChunkWithPosition extends RelevantChunk {
  chunkIndex?: number;
  startPosition?: number;
  endPosition?: number;
}

const DEFAULT_CONFIG: ContextConfig = {
  maxChunks: 6,           // Requirements 4.1: up to 6 relevant chunks
  maxTokens: 4000,
  orderByPosition: true,  // Requirements 4.2: order by document position
  includeOverlap: true
};

export class ContextAssembler {
  private config: ContextConfig;

  constructor(config?: Partial<ContextConfig>) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /**
   * Assemble context from chunks with proper ordering
   * 
   * Requirements 4.1: Limit to maxChunks (default 6)
   * Requirements 4.2: Order same-document chunks by chunkIndex
   */
  assemble(chunks: ChunkWithPosition[]): AssembledContext {
    if (!chunks || chunks.length === 0) {
      return {
        chunks: [],
        formattedContext: '',
        totalTokens: 0,
        documentOrder: new Map()
      };
    }

    // Step 1: Limit to maxChunks (Requirements 4.1)
    const limitedChunks = chunks.slice(0, this.config.maxChunks);

    // Step 2: Order chunks from same document by position (Requirements 4.2)
    const orderedChunks = this.config.orderByPosition 
      ? this.orderByDocumentPosition(limitedChunks)
      : limitedChunks;

    // Step 3: Build document order map
    const documentOrder = this.buildDocumentOrderMap(orderedChunks);

    // Step 4: Format for LLM consumption
    const formattedContext = this.formatForLLM(orderedChunks);

    // Step 5: Estimate token count
    const totalTokens = this.estimateTokens(formattedContext);

    return {
      chunks: orderedChunks,
      formattedContext,
      totalTokens,
      documentOrder
    };
  }

  /**
   * Order chunks from the same document by their original position
   * 
   * Requirements 4.2: When chunks are from the same document, 
   * order them by their original document position for coherent context
   */
  orderByDocumentPosition(chunks: ChunkWithPosition[]): ChunkWithPosition[] {
    if (chunks.length <= 1) {
      return chunks;
    }

    // Group chunks by document
    const byDocument = new Map<string, ChunkWithPosition[]>();
    
    for (const chunk of chunks) {
      const docId = chunk.documentId;
      if (!byDocument.has(docId)) {
        byDocument.set(docId, []);
      }
      byDocument.get(docId)!.push(chunk);
    }

    // Sort chunks within each document by chunkIndex or startPosition
    for (const [docId, docChunks] of byDocument) {
      docChunks.sort((a, b) => {
        // Primary sort by chunkIndex if available
        if (a.chunkIndex !== undefined && b.chunkIndex !== undefined) {
          return a.chunkIndex - b.chunkIndex;
        }
        // Fallback to startPosition
        if (a.startPosition !== undefined && b.startPosition !== undefined) {
          return a.startPosition - b.startPosition;
        }
        // Keep original order if no position info
        return 0;
      });
    }

    // Reconstruct the array maintaining document grouping
    // Documents are ordered by their first chunk's original position in the input
    const documentOrder: string[] = [];
    const seenDocs = new Set<string>();
    
    for (const chunk of chunks) {
      if (!seenDocs.has(chunk.documentId)) {
        documentOrder.push(chunk.documentId);
        seenDocs.add(chunk.documentId);
      }
    }

    // Build result: for each document in order, add its sorted chunks
    const result: ChunkWithPosition[] = [];
    for (const docId of documentOrder) {
      const docChunks = byDocument.get(docId) || [];
      result.push(...docChunks);
    }

    return result;
  }

  /**
   * Build a map of document IDs to their chunk indices in the result
   */
  private buildDocumentOrderMap(chunks: ChunkWithPosition[]): Map<string, number[]> {
    const documentOrder = new Map<string, number[]>();
    
    chunks.forEach((chunk, index) => {
      const docId = chunk.documentId;
      if (!documentOrder.has(docId)) {
        documentOrder.set(docId, []);
      }
      documentOrder.get(docId)!.push(index);
    });

    return documentOrder;
  }

  /**
   * Format chunks for LLM consumption
   */
  private formatForLLM(chunks: ChunkWithPosition[]): string {
    if (chunks.length === 0) {
      return '';
    }

    return chunks
      .map((chunk, index) => {
        const positionInfo = chunk.chunkIndex !== undefined 
          ? ` (Part ${chunk.chunkIndex + 1})`
          : '';
        
        return `[Source ${index + 1}: ${chunk.documentName}${positionInfo}]\n${chunk.content}`;
      })
      .join('\n\n---\n\n');
  }

  /**
   * Estimate token count (rough approximation: ~4 chars per token)
   */
  private estimateTokens(text: string): number {
    return Math.ceil(text.length / 4);
  }

  /**
   * Get the current configuration
   */
  getConfig(): ContextConfig {
    return { ...this.config };
  }

  /**
   * Update configuration
   */
  setConfig(config: Partial<ContextConfig>): void {
    this.config = { ...this.config, ...config };
  }
}

// Export singleton instance with default config
export const contextAssembler = new ContextAssembler();
