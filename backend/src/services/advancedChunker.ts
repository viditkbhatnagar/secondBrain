import { RecursiveCharacterTextSplitter } from 'langchain/text_splitter';
import { logger } from '../utils/logger';

interface ChunkMetadata {
  documentId: string;
  documentName: string;
  chunkIndex: number;
  totalChunks: number;
  startChar: number;
  endChar: number;
  headings: string[];
  section: string;
}

interface ChunkingOptions {
  chunkSize: number;
  chunkOverlap: number;
  preserveSentences: boolean;
  preserveParagraphs: boolean;
  addContextWindow: boolean;
}

interface ChunkResult {
  content: string;
  metadata: ChunkMetadata;
}

const DEFAULT_OPTIONS: ChunkingOptions = {
  chunkSize: 512,        // Optimal for ada-002
  chunkOverlap: 50,      // 10% overlap
  preserveSentences: true,
  preserveParagraphs: true,
  addContextWindow: true
};

export class AdvancedChunker {
  private options: ChunkingOptions;

  constructor(options: Partial<ChunkingOptions> = {}) {
    this.options = { ...DEFAULT_OPTIONS, ...options };
  }

  /**
   * Smart chunking that preserves semantic boundaries
   */
  async chunkDocument(
    content: string,
    documentId: string,
    documentName: string
  ): Promise<ChunkResult[]> {
    const startTime = Date.now();

    // 1. Pre-process: Clean and normalize text
    const cleanedContent = this.preprocessText(content);

    // 2. Extract document structure (headings, sections)
    const structure = this.extractStructure(cleanedContent);

    // 3. Split by semantic boundaries first
    const semanticChunks = this.splitBySemantic(cleanedContent, structure);

    // 4. Apply size constraints with overlap
    const sizedChunks = await this.applySizeConstraints(semanticChunks);

    // 5. Add context windows (prev/next chunk summaries)
    const contextualChunks = this.options.addContextWindow 
      ? this.addContextWindows(sizedChunks)
      : sizedChunks;

    // 6. Create final chunks with metadata
    const result = contextualChunks.map((chunk, index) => ({
      content: chunk.content,
      metadata: {
        documentId,
        documentName,
        chunkIndex: index,
        totalChunks: contextualChunks.length,
        startChar: chunk.startChar,
        endChar: chunk.endChar,
        headings: chunk.headings || [],
        section: chunk.section || ''
      }
    }));

    logger.debug(`Advanced chunking completed in ${Date.now() - startTime}ms`, {
      documentId,
      totalChunks: result.length,
      avgChunkSize: Math.round(cleanedContent.length / result.length)
    });

    return result;
  }

  private preprocessText(text: string): string {
    return text
      // Normalize whitespace
      .replace(/\s+/g, ' ')
      // Normalize line breaks
      .replace(/\n{3,}/g, '\n\n')
      // Remove special characters that break embeddings
      .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '')
      // Normalize quotes
      .replace(/[""]/g, '"')
      .replace(/['']/g, "'")
      .trim();
  }

  private extractStructure(text: string): { headings: string[]; sections: Map<string, string> } {
    const headings: string[] = [];
    const sections = new Map<string, string>();

    // Extract markdown headings
    const headingRegex = /^(#{1,6})\s+(.+)$/gm;
    let match;
    while ((match = headingRegex.exec(text)) !== null) {
      headings.push(match[2]);
    }

    return { headings, sections };
  }


  private splitBySemantic(
    text: string, 
    structure: { headings: string[]; sections: Map<string, string> }
  ): Array<{
    content: string;
    startChar: number;
    endChar: number;
    headings?: string[];
    section?: string;
  }> {
    const chunks: Array<{
      content: string;
      startChar: number;
      endChar: number;
      headings?: string[];
      section?: string;
    }> = [];

    // Split by paragraphs first (double newline)
    const paragraphs = text.split(/\n\n+/);
    let currentPos = 0;

    for (const para of paragraphs) {
      if (para.trim()) {
        chunks.push({
          content: para.trim(),
          startChar: currentPos,
          endChar: currentPos + para.length
        });
      }
      currentPos += para.length + 2; // +2 for \n\n
    }

    return chunks;
  }

  private async applySizeConstraints(
    chunks: Array<{ content: string; startChar: number; endChar: number; headings?: string[]; section?: string }>
  ): Promise<Array<{ content: string; startChar: number; endChar: number; headings?: string[]; section?: string }>> {
    const result: Array<{ content: string; startChar: number; endChar: number; headings?: string[]; section?: string }> = [];

    const splitter = new RecursiveCharacterTextSplitter({
      chunkSize: this.options.chunkSize,
      chunkOverlap: this.options.chunkOverlap,
      separators: this.options.preserveSentences 
        ? ['\n\n', '\n', '. ', '! ', '? ', '; ', ': ', ' ']
        : ['\n\n', '\n', ' ']
    });

    for (const chunk of chunks) {
      if (chunk.content.length <= this.options.chunkSize) {
        result.push(chunk);
      } else {
        // Split large chunks
        const subChunks = await splitter.splitText(chunk.content);
        let subStart = chunk.startChar;
        
        for (const subChunk of subChunks) {
          result.push({
            content: subChunk,
            startChar: subStart,
            endChar: subStart + subChunk.length,
            headings: chunk.headings,
            section: chunk.section
          });
          subStart += subChunk.length - this.options.chunkOverlap;
        }
      }
    }

    return result;
  }

  private addContextWindows(
    chunks: Array<{ content: string; startChar: number; endChar: number; headings?: string[]; section?: string }>
  ): Array<{ content: string; startChar: number; endChar: number; headings?: string[]; section?: string }> {
    return chunks.map((chunk, index) => {
      const prevContext = index > 0 
        ? `[Previous: ${chunks[index - 1].content.slice(0, 100)}...]\n\n` 
        : '';
      const nextContext = index < chunks.length - 1 
        ? `\n\n[Next: ${chunks[index + 1].content.slice(0, 100)}...]` 
        : '';

      return {
        ...chunk,
        content: `${prevContext}${chunk.content}${nextContext}`
      };
    });
  }

  // Calculate optimal chunk size based on content type
  static getOptimalChunkSize(contentType: string): number {
    const sizes: Record<string, number> = {
      'technical': 384,      // Smaller for precise technical content
      'narrative': 768,      // Larger for flowing narrative
      'qa': 256,            // Small for Q&A pairs
      'code': 512,          // Medium for code
      'default': 512
    };
    return sizes[contentType] || sizes.default;
  }
}

export const advancedChunker = new AdvancedChunker();
