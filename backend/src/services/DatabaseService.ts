// Simple in-memory database service
// In production, replace this with PostgreSQL, MongoDB, or another database

export interface DocumentRecord {
    id: string;
    filename: string;
    originalName: string;
    mimeType: string;
    content: string;
    summary?: string;
    topics?: string[];
    wordCount: number;
    characters: number;
    chunkCount: number;
    uploadedAt: Date;
    updatedAt: Date;
  }
  
  export interface CreateDocumentInput {
    id: string;
    filename: string;
    originalName: string;
    mimeType: string;
    content: string;
    summary?: string;
    topics?: string[];
    metadata: {
      pageCount?: number;
      wordCount: number;
      characters: number;
      extractedAt: Date;
    };
    chunkCount: number;
  }
  
  export class DatabaseService {
    private static documents: Map<string, DocumentRecord> = new Map();
  
    /**
     * Initialize the database service
     */
    static async initialize(): Promise<void> {
      console.log('Database service initialized (in-memory)');
      // In production, you would connect to your database here
    }
  
    /**
     * Create a new document record
     */
    static async createDocument(input: CreateDocumentInput): Promise<DocumentRecord> {
      const now = new Date();
      
      const document: DocumentRecord = {
        id: input.id,
        filename: input.filename,
        originalName: input.originalName,
        mimeType: input.mimeType,
        content: input.content,
        summary: input.summary,
        topics: input.topics,
        wordCount: input.metadata.wordCount,
        characters: input.metadata.characters,
        chunkCount: input.chunkCount,
        uploadedAt: now,
        updatedAt: now
      };
  
      this.documents.set(document.id, document);
      
      console.log(`Created document record: ${document.originalName}`);
      return document;
    }
  
    /**
     * Get document by ID
     */
    static async getDocumentById(id: string): Promise<DocumentRecord | null> {
      return this.documents.get(id) || null;
    }
  
    /**
     * Get all documents
     */
    static async getAllDocuments(): Promise<Omit<DocumentRecord, 'content'>[]> {
      return Array.from(this.documents.values()).map(doc => ({
        id: doc.id,
        filename: doc.filename,
        originalName: doc.originalName,
        mimeType: doc.mimeType,
        summary: doc.summary,
        topics: doc.topics,
        wordCount: doc.wordCount,
        characters: doc.characters,
        chunkCount: doc.chunkCount,
        uploadedAt: doc.uploadedAt,
        updatedAt: doc.updatedAt
      }));
    }
  
    /**
     * Update document
     */
    static async updateDocument(
      id: string, 
      updates: Partial<Omit<DocumentRecord, 'id' | 'uploadedAt'>>
    ): Promise<DocumentRecord | null> {
      const document = this.documents.get(id);
      if (!document) return null;
  
      const updatedDocument = {
        ...document,
        ...updates,
        updatedAt: new Date()
      };
  
      this.documents.set(id, updatedDocument);
      return updatedDocument;
    }
  
    /**
     * Delete document
     */
    static async deleteDocument(id: string): Promise<boolean> {
      const deleted = this.documents.delete(id);
      if (deleted) {
        console.log(`Deleted document record: ${id}`);
      }
      return deleted;
    }
  
    /**
     * Search documents by content
     */
    static async searchDocuments(query: string): Promise<Omit<DocumentRecord, 'content'>[]> {
      const queryLower = query.toLowerCase();
      const results: Omit<DocumentRecord, 'content'>[] = [];
  
      for (const doc of this.documents.values()) {
        if (
          doc.originalName.toLowerCase().includes(queryLower) ||
          doc.summary?.toLowerCase().includes(queryLower) ||
          doc.topics?.some(topic => topic.toLowerCase().includes(queryLower)) ||
          doc.content.toLowerCase().includes(queryLower)
        ) {
          results.push({
            id: doc.id,
            filename: doc.filename,
            originalName: doc.originalName,
            mimeType: doc.mimeType,
            summary: doc.summary,
            topics: doc.topics,
            wordCount: doc.wordCount,
            characters: doc.characters,
            chunkCount: doc.chunkCount,
            uploadedAt: doc.uploadedAt,
            updatedAt: doc.updatedAt
          });
        }
      }
  
      return results.sort((a, b) => b.uploadedAt.getTime() - a.uploadedAt.getTime());
    }
  
    /**
     * Get document statistics
     */
    static async getStats(): Promise<{
      totalDocuments: number;
      totalWords: number;
      totalCharacters: number;
      totalChunks: number;
      averageWordsPerDocument: number;
    }> {
      const documents = Array.from(this.documents.values());
      
      const totalDocuments = documents.length;
      const totalWords = documents.reduce((sum, doc) => sum + doc.wordCount, 0);
      const totalCharacters = documents.reduce((sum, doc) => sum + doc.characters, 0);
      const totalChunks = documents.reduce((sum, doc) => sum + doc.chunkCount, 0);
      const averageWordsPerDocument = totalDocuments > 0 ? totalWords / totalDocuments : 0;
  
      return {
        totalDocuments,
        totalWords,
        totalCharacters,
        totalChunks,
        averageWordsPerDocument: Math.round(averageWordsPerDocument)
      };
    }
  
    /**
     * Clear all documents (for testing/reset)
     */
    static async clearAll(): Promise<number> {
      const count = this.documents.size;
      this.documents.clear();
      console.log(`Cleared ${count} document records`);
      return count;
    }
  }