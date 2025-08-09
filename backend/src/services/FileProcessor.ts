import fs from 'fs-extra';
import path from 'path';
import pdfParse from 'pdf-parse';
import mammoth from 'mammoth';
import { RecursiveCharacterTextSplitter } from 'langchain/text_splitter';
import { ClassificationService } from './ClassificationService';
import { exec as execCb } from 'node:child_process';
import { promisify } from 'node:util';
const exec = promisify(execCb);

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
  private static readonly CHUNK_SIZE_CHARS = 1500; // semantic chunking by characters
  private static readonly CHUNK_OVERLAP_CHARS = 200;

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
          // OCR fallback for scanned PDFs
          if (!content.trim()) {
            const ocrText = await this.ocrPdf(filePath, pageCount || 0);
            content = ocrText;
          }
          break;
        
        case 'application/vnd.openxmlformats-officedocument.wordprocessingml.document':
          content = await this.extractFromDocx(filePath);
          break;
        
        case 'text/plain':
        case 'text/markdown':
          content = await this.extractFromText(filePath);
          break;
        case 'application/json':
          content = await this.extractFromJson(filePath);
          break;
        case 'image/png':
        case 'image/jpeg':
          content = await this.extractFromImage(filePath);
          break;
        
        default:
          throw new Error(`Unsupported file type: ${mimeType}`);
      }

      // Clean and normalize content
      content = this.cleanText(content);

      // Generate semantic chunks using LangChain splitters (sentence/paragraph aware)
      const chunks = await this.createSemanticChunks(fileId, content);

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

  private static async extractFromImage(filePath: string): Promise<string> {
    try {
      await exec(`tesseract "${filePath}" "${filePath}" -l eng`);
      const txtPath = `${filePath}.txt`;
      return await fs.readFile(txtPath, 'utf-8');
    } catch (e) {
      console.warn('OCR unavailable, returning empty text');
      return '';
    }
  }

  private static async extractFromJson(filePath: string): Promise<string> {
    try {
      const raw = await fs.readFile(filePath, 'utf-8');
      const obj = JSON.parse(raw);
      // Flatten JSON into a readable text for embeddings
      const flatten = (o: any, prefix = ''): string[] => {
        if (o === null || o === undefined) return [];
        if (typeof o !== 'object') return [`${prefix}${String(o)}`];
        const parts: string[] = [];
        for (const [k, v] of Object.entries(o)) {
          const key = prefix ? `${prefix}.${k}: ` : `${k}: `;
          parts.push(...flatten(v, key));
        }
        return parts;
      };
      return flatten(obj).join('\n');
    } catch (e) {
      return '';
    }
  }

  /**
   * OCR entire PDF by converting pages to PNG images (requires pdftoppm) and running tesseract.
   */
  private static async ocrPdf(filePath: string, pageCount: number): Promise<string> {
    try {
      const prefix = `${filePath}_ocr`;
      await exec(`pdftoppm -png "${filePath}" "${prefix}"`);
      let full = '';
      // Attempt up to pageCount pages; if pageCount unknown, try first 20 pattern
      const maxPages = pageCount && pageCount > 0 ? pageCount : 20;
      for (let i = 1; i <= maxPages; i++) {
        const imgPath = `${prefix}-${i}.png`;
        if (!(await fs.pathExists(imgPath))) {
          if (i === 1) break; // no pages rendered
          else continue;
        }
        const text = await this.extractFromImage(imgPath);
        full += `\n\n[Page ${i}]\n${text}`;
        // Cleanup txt side-file if created
        const txtPath = `${imgPath}.txt`;
        if (await fs.pathExists(txtPath)) await fs.remove(txtPath);
        await fs.remove(imgPath);
      }
      return full.trim();
    } catch (e) {
      console.warn('PDF OCR failed (pdftoppm not available?)');
      return '';
    }
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
  private static async createSemanticChunks(documentId: string, content: string): Promise<DocumentChunk[]> {
    const splitter = new RecursiveCharacterTextSplitter({
      chunkSize: this.CHUNK_SIZE_CHARS,
      chunkOverlap: this.CHUNK_OVERLAP_CHARS,
    });

    const docs = await splitter.createDocuments([content]);
    const chunks: DocumentChunk[] = [];
    let runningIndex = 0;

    docs.forEach((d, idx) => {
      const text = d.pageContent;
      const startPosition = content.indexOf(text, runningIndex);
      const endPosition = startPosition + text.length;
      runningIndex = Math.max(runningIndex, endPosition);
      const wordCount = text.split(/\s+/).filter(Boolean).length;
      chunks.push({
        id: `${documentId}_chunk_${idx}`,
        documentId,
        content: text,
        chunkIndex: idx,
        startPosition: Math.max(0, startPosition),
        endPosition: Math.min(content.length, endPosition),
        wordCount
      });
    });

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
    return `doc_${Date.now()}_${Math.random().toString(36).slice(2, 11)}`;
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