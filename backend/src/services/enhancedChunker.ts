/**
 * Enhanced Chunker for improved RAG accuracy
 * 
 * Features:
 * - Configurable chunk sizes (400-600 chars)
 * - Sentence boundary detection
 * - Overlap tracking between consecutive chunks
 * - Structure detection for headers and sections
 * 
 * @module enhancedChunker
 * **Validates: Requirements 1.1, 1.2, 1.3, 1.4, 1.5**
 */

export interface ChunkConfig {
  targetSize: number;        // 500 chars (default)
  minSize: number;           // 400 chars
  maxSize: number;           // 600 chars
  overlapSize: number;       // 125 chars
  preserveSentences: boolean;
  preserveParagraphs: boolean;
}

export interface EnhancedChunk {
  id: string;
  documentId: string;
  content: string;
  chunkIndex: number;
  totalChunks: number;
  startPosition: number;
  endPosition: number;
  wordCount: number;
  sectionTitle?: string;
  hasHeader: boolean;
  overlapWithPrevious: string;
  overlapWithNext: string;
}

interface StructureInfo {
  headers: Array<{ position: number; text: string; level: number }>;
  paragraphBreaks: number[];
  listItems: number[];
}

const DEFAULT_CONFIG: ChunkConfig = {
  targetSize: 500,
  minSize: 400,
  maxSize: 600,
  overlapSize: 125,
  preserveSentences: true,
  preserveParagraphs: true,
};

// Sentence ending patterns
const SENTENCE_END_REGEX = /[.!?]["']?\s*$/;
const SENTENCE_BOUNDARY_REGEX = /[.!?]["']?\s+/g;

// Structure detection patterns
const MARKDOWN_HEADER_REGEX = /^#{1,6}\s+.+$/gm;
const NUMBERED_SECTION_REGEX = /^(?:\d+\.|\d+\)|Section\s+\d+[:.)]?)\s*.+$/gim;
const LIST_ITEM_REGEX = /^(?:[-*•]\s+|\d+[.)]\s+)/gm;
const ALL_CAPS_HEADER_REGEX = /^[A-Z][A-Z\s]{2,}[A-Z]$/;

export class EnhancedChunker {
  private config: ChunkConfig;

  constructor(config: Partial<ChunkConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /**
   * Main chunking method - splits document into semantic chunks
   */
  async chunkDocument(
    content: string,
    documentId: string,
    documentName: string
  ): Promise<EnhancedChunk[]> {
    if (!content || content.trim().length === 0) {
      return [];
    }

    // Detect document structure
    const structure = this.detectStructure(content);
    
    // Calculate optimal chunk boundaries
    const boundaries = this.calculateBoundaries(content, structure);
    
    // Create chunks from boundaries
    const chunks = this.createChunksFromBoundaries(content, boundaries, documentId);
    
    // Add overlap information
    this.addOverlapInfo(chunks);
    
    return chunks;
  }


  /**
   * Detect document structure (headers, paragraphs, lists)
   */
  detectStructure(text: string): StructureInfo {
    const headers: Array<{ position: number; text: string; level: number }> = [];
    const paragraphBreaks: number[] = [];
    const listItems: number[] = [];

    // Detect markdown headers
    let match: RegExpExecArray | null;
    const mdHeaderRegex = new RegExp(MARKDOWN_HEADER_REGEX.source, 'gm');
    while ((match = mdHeaderRegex.exec(text)) !== null) {
      const level = (match[0].match(/^#+/) || [''])[0].length;
      headers.push({
        position: match.index,
        text: match[0].replace(/^#+\s*/, '').trim(),
        level,
      });
    }

    // Detect numbered sections
    const numberedRegex = new RegExp(NUMBERED_SECTION_REGEX.source, 'gim');
    while ((match = numberedRegex.exec(text)) !== null) {
      // Avoid duplicates if already detected as markdown header
      if (!headers.some(h => Math.abs(h.position - match!.index) < 5)) {
        headers.push({
          position: match.index,
          text: match[0].trim(),
          level: 2,
        });
      }
    }

    // Detect ALL CAPS headers (line by line)
    const lines = text.split('\n');
    let pos = 0;
    for (const line of lines) {
      const trimmed = line.trim();
      if (trimmed.length >= 3 && trimmed.length < 100 && ALL_CAPS_HEADER_REGEX.test(trimmed)) {
        if (!headers.some(h => Math.abs(h.position - pos) < 5)) {
          headers.push({
            position: pos,
            text: trimmed,
            level: 2,
          });
        }
      }
      pos += line.length + 1; // +1 for newline
    }

    // Detect paragraph breaks (double newlines)
    const paragraphRegex = /\n\n+/g;
    while ((match = paragraphRegex.exec(text)) !== null) {
      paragraphBreaks.push(match.index);
    }

    // Detect list items
    const listRegex = new RegExp(LIST_ITEM_REGEX.source, 'gm');
    while ((match = listRegex.exec(text)) !== null) {
      listItems.push(match.index);
    }

    // Sort headers by position
    headers.sort((a, b) => a.position - b.position);

    return { headers, paragraphBreaks, listItems };
  }

  /**
   * Find the best position to split at a sentence boundary
   */
  splitAtSentenceBoundary(text: string, targetPos: number): number {
    if (!this.config.preserveSentences) {
      return targetPos;
    }

    const searchStart = Math.max(0, targetPos - 100);
    const searchEnd = Math.min(text.length, targetPos + 100);
    const searchText = text.slice(searchStart, searchEnd);

    // Find all sentence boundaries in the search range
    const boundaries: number[] = [];
    const regex = new RegExp(SENTENCE_BOUNDARY_REGEX.source, 'g');
    let match: RegExpExecArray | null;
    
    while ((match = regex.exec(searchText)) !== null) {
      boundaries.push(searchStart + match.index + match[0].length);
    }

    // Also check for paragraph breaks
    const paragraphRegex = /\n\n+/g;
    while ((match = paragraphRegex.exec(searchText)) !== null) {
      boundaries.push(searchStart + match.index);
    }

    if (boundaries.length === 0) {
      // No sentence boundary found, try to split at word boundary
      const spacePos = text.lastIndexOf(' ', targetPos);
      return spacePos > targetPos - 50 ? spacePos + 1 : targetPos;
    }

    // Find the boundary closest to target position
    let bestBoundary = boundaries[0];
    let minDistance = Math.abs(boundaries[0] - targetPos);

    for (const boundary of boundaries) {
      const distance = Math.abs(boundary - targetPos);
      if (distance < minDistance) {
        minDistance = distance;
        bestBoundary = boundary;
      }
    }

    return bestBoundary;
  }


  /**
   * Calculate optimal chunk boundaries based on structure and size constraints
   */
  calculateBoundaries(text: string, structure: StructureInfo): number[] {
    const boundaries: number[] = [0]; // Start with beginning
    let currentPos = 0;

    while (currentPos < text.length) {
      // Calculate target end position for this chunk
      let targetEnd = currentPos + this.config.targetSize;

      if (targetEnd >= text.length) {
        // Last chunk - include everything remaining
        break;
      }

      // Check if there's a header nearby that we should respect
      const nearbyHeader = structure.headers.find(
        h => h.position > currentPos && h.position <= targetEnd + 50
      );

      if (nearbyHeader && nearbyHeader.position > currentPos + this.config.minSize) {
        // Split before the header if we have enough content
        targetEnd = nearbyHeader.position;
      } else {
        // Find best sentence boundary near target
        targetEnd = this.splitAtSentenceBoundary(text, targetEnd);
      }

      // Ensure we don't exceed max size
      if (targetEnd - currentPos > this.config.maxSize) {
        targetEnd = this.splitAtSentenceBoundary(
          text,
          currentPos + this.config.maxSize
        );
      }

      // Ensure we have at least min size (unless it's the last chunk)
      if (targetEnd - currentPos < this.config.minSize && targetEnd < text.length) {
        targetEnd = Math.min(
          currentPos + this.config.minSize,
          text.length
        );
        // Try to find a sentence boundary after min size
        targetEnd = this.splitAtSentenceBoundary(text, targetEnd);
      }

      // Prevent infinite loop - ensure we make progress
      if (targetEnd <= currentPos) {
        targetEnd = Math.min(currentPos + this.config.targetSize, text.length);
      }

      boundaries.push(targetEnd);
      
      // Move to next chunk start, accounting for overlap
      currentPos = Math.max(currentPos + 1, targetEnd - this.config.overlapSize);
    }

    // Add end boundary if not already there
    if (boundaries[boundaries.length - 1] !== text.length) {
      boundaries.push(text.length);
    }

    return boundaries;
  }

  /**
   * Create chunks from calculated boundaries
   */
  private createChunksFromBoundaries(
    content: string,
    boundaries: number[],
    documentId: string
  ): EnhancedChunk[] {
    const chunks: EnhancedChunk[] = [];
    const totalChunks = boundaries.length - 1;

    for (let i = 0; i < boundaries.length - 1; i++) {
      const startPos = boundaries[i];
      const endPos = boundaries[i + 1];
      const chunkContent = content.slice(startPos, endPos).trim();

      if (chunkContent.length === 0) {
        continue;
      }

      // Detect section title for this chunk
      const sectionTitle = this.detectSectionTitle(chunkContent);
      const hasHeader = sectionTitle !== undefined;

      const wordCount = chunkContent.split(/\s+/).filter(Boolean).length;

      chunks.push({
        id: `${documentId}_chunk_${i}`,
        documentId,
        content: chunkContent,
        chunkIndex: i,
        totalChunks,
        startPosition: startPos,
        endPosition: endPos,
        wordCount,
        sectionTitle,
        hasHeader,
        overlapWithPrevious: '',
        overlapWithNext: '',
      });
    }

    // Update totalChunks to actual count (after filtering empty)
    const actualTotal = chunks.length;
    chunks.forEach((chunk, idx) => {
      chunk.totalChunks = actualTotal;
      chunk.chunkIndex = idx;
      chunk.id = `${documentId}_chunk_${idx}`;
    });

    return chunks;
  }


  /**
   * Add overlap information between consecutive chunks
   */
  private addOverlapInfo(chunks: EnhancedChunk[]): void {
    for (let i = 0; i < chunks.length; i++) {
      const chunk = chunks[i];

      // Calculate overlap with previous chunk
      if (i > 0) {
        const prevChunk = chunks[i - 1];
        const overlapStart = Math.max(
          0,
          prevChunk.content.length - this.config.overlapSize
        );
        chunk.overlapWithPrevious = prevChunk.content.slice(overlapStart);
      }

      // Calculate overlap with next chunk
      if (i < chunks.length - 1) {
        const nextChunk = chunks[i + 1];
        const overlapEnd = Math.min(
          this.config.overlapSize,
          nextChunk.content.length
        );
        chunk.overlapWithNext = nextChunk.content.slice(0, overlapEnd);
      }
    }
  }

  /**
   * Detect section title from chunk content
   */
  private detectSectionTitle(text: string): string | undefined {
    const lines = text.split('\n').slice(0, 3);
    
    for (const line of lines) {
      const trimmed = line.trim();
      
      // Skip empty lines
      if (!trimmed) continue;

      // Markdown header (# Header)
      const mdMatch = trimmed.match(/^#{1,6}\s+(.+)$/);
      if (mdMatch) {
        return mdMatch[1].trim();
      }

      // All caps line (likely header)
      if (
        trimmed.length >= 3 &&
        trimmed.length < 100 &&
        ALL_CAPS_HEADER_REGEX.test(trimmed)
      ) {
        return trimmed;
      }

      // Line ending with colon
      if (trimmed.endsWith(':') && trimmed.length < 80) {
        return trimmed.slice(0, -1);
      }

      // Numbered section (e.g., "1. Introduction", "Section 2:")
      const numberedMatch = trimmed.match(
        /^(?:\d+\.|\d+\)|Section\s+\d+[:.)]?)\s*(.+)$/i
      );
      if (numberedMatch && trimmed.length < 80) {
        return trimmed;
      }
    }

    return undefined;
  }

  /**
   * Get the current configuration
   */
  getConfig(): ChunkConfig {
    return { ...this.config };
  }

  /**
   * Update configuration
   */
  setConfig(config: Partial<ChunkConfig>): void {
    this.config = { ...this.config, ...config };
  }
}

// Export default instance with standard config
export const enhancedChunker = new EnhancedChunker();

// Export utility function for direct use
export async function chunkDocument(
  content: string,
  documentId: string,
  documentName: string,
  config?: Partial<ChunkConfig>
): Promise<EnhancedChunk[]> {
  const chunker = new EnhancedChunker(config);
  return chunker.chunkDocument(content, documentId, documentName);
}
