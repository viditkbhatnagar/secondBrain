import fs from 'fs-extra';
import path from 'path';
import pdfParse from 'pdf-parse';
import mammoth from 'mammoth';

export interface ProcessedDocument {
  id: string;
  filename: string;
  originalName: string;
  mimeType: string;
  content: string;
  metadata: {
    pageCount?: number;
    wordCount: number;
    characters: number;
    extractedAt: Date;
  };
  chunks: DocumentChunk[];
}

export interface DocumentChunk {
  id: string;
  documentId: string;
  content: string;
  chunkIndex: number;
  startPosition: number;
  endPosition: number;
  wordCount: number;
}

export class FileProcessor {
  private static readonly CHUNK_SIZE = 1000; // words per chunk
  private static readonly CHUNK_OVERLAP = 100; // words overlap between chunks

  /**
   * Process uploaded file and extract text content
   */
  static async processFile(filePath: string, originalName: string, mimeType: string): Promise<ProcessedDocument> {
    try {
      const fileId = this.generateFileId();
      let content: string;
      let pageCount: number | undefined;

      // Extract text based on file type
      switch (mimeType) {
        case 'application/pdf':
          const pdfResult = await this.extractFromPDF(filePath);
          content = pdfResult.content;
          pageCount = pdfResult.pageCount;
          break;
        
        case 'application/vnd.openxmlformats-officedocument.wordprocessingml.document':
          content = await this.extractFromDocx(filePath);
          break;
        
        case 'text/plain':
        case 'text/markdown':
          content = await this.extractFromText(filePath);
          break;
        
        default:
          throw new Error(`Unsupported file type: ${mimeType}`);
      }

      // Clean and normalize content
      content = this.cleanText(content);

      // Generate chunks
      const chunks = this.createChunks(fileId, content);

      // Calculate metadata
      const wordCount = this.countWords(content);
      const characters = content.length;

      const processedDoc: ProcessedDocument = {
        id: fileId,
        filename: path.basename(filePath),
        originalName,
        mimeType,
        content,
        metadata: {
          pageCount,
          wordCount,
          characters,
          extractedAt: new Date()
        },
        chunks
      };

      return processedDoc;
    } catch (error) {
      console.error('Error processing file:', error);
      throw new Error(`Failed to process file: ${error}`);
    }
  }

  /**
   * Extract text from PDF file
   */
  private static async extractFromPDF(filePath: string): Promise<{ content: string; pageCount: number }> {
    const dataBuffer = await fs.readFile(filePath);
    const pdfData = await pdfParse(dataBuffer);
    
    return {
      content: pdfData.text,
      pageCount: pdfData.numpages
    };
  }

  /**
   * Extract text from DOCX file
   */
  private static async extractFromDocx(filePath: string): Promise<string> {
    const result = await mammoth.extractRawText({ path: filePath });
    return result.value;
  }

  /**
   * Extract text from plain text files
   */
  private static async extractFromText(filePath: string): Promise<string> {
    return await fs.readFile(filePath, 'utf-8');
  }

  /**
   * Clean and normalize text content
   */
  private static cleanText(text: string): string {
    return text
      .replace(/\r\n/g, '\n') // Normalize line endings
      .replace(/\n{3,}/g, '\n\n') // Remove excessive line breaks
      .replace(/[ \t]+/g, ' ') // Normalize spaces
      .trim();
  }

  /**
   * Split content into overlapping chunks for better search results
   */
  private static createChunks(documentId: string, content: string): DocumentChunk[] {
    const words = content.split(/\s+/);
    const chunks: DocumentChunk[] = [];
    let chunkIndex = 0;

    for (let i = 0; i < words.length; i += this.CHUNK_SIZE - this.CHUNK_OVERLAP) {
      const endIndex = Math.min(i + this.CHUNK_SIZE, words.length);
      const chunkWords = words.slice(i, endIndex);
      const chunkContent = chunkWords.join(' ');

      // Calculate positions in original text
      const startPosition = content.indexOf(chunkWords[0]);
      const endPosition = startPosition + chunkContent.length;

      chunks.push({
        id: `${documentId}_chunk_${chunkIndex}`,
        documentId,
        content: chunkContent,
        chunkIndex,
        startPosition: Math.max(0, startPosition),
        endPosition: Math.min(content.length, endPosition),
        wordCount: chunkWords.length
      });

      chunkIndex++;

      // Break if we've reached the end
      if (endIndex >= words.length) break;
    }

    return chunks;
  }

  /**
   * Count words in text
   */
  private static countWords(text: string): number {
    return text.split(/\s+/).filter(word => word.length > 0).length;
  }

  /**
   * Generate unique file ID
   */
  private static generateFileId(): string {
    return `doc_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * Delete processed file from disk
   */
  static async cleanupFile(filePath: string): Promise<void> {
    try {
      await fs.remove(filePath);
    } catch (error) {
      console.warn('Failed to cleanup file:', filePath, error);
    }
  }
}