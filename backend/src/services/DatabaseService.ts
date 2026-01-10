import { DocumentModel, DocumentChunkModel, UserSessionModel, SearchQueryModel, connectDB, getDBStats, IDocument, ChatThreadModel, ChatMessageModel, SavedSearchModel } from '../models/index';

export interface DocumentRecord {
  id: string;
  filename: string;
  originalName: string;
  mimeType: string;
  content: string;
  summary?: string;
  topics?: string[];
  classification?: {
    label: string;
    confidence: number;
    candidates?: Array<{ label: string; confidence: number }>;
  };
  wordCount: number;
  characters: number;
  chunkCount: number;
  pageCount?: number;
  uploadedAt: Date;
  updatedAt: Date;
  fileSize: number;
  language?: string;
  extractedAt: Date;
}

export interface CreateDocumentInput {
  id: string;
  filename: string;
  originalName: string;
  mimeType: string;
  content: string;
  summary?: string;
  topics?: string[];
  classification?: {
    label: string;
    confidence: number;
    candidates?: Array<{ label: string; confidence: number }>;
  };
  entities?: Array<{ type: string; text: string; value?: string; start?: number; end?: number }>;
  category?: string; // Smart KB category
  metadata: {
    pageCount?: number;
    wordCount: number;
    characters: number;
    extractedAt: Date;
  };
  chunkCount: number;
  fileSize?: number;
}

export class DatabaseService {
  /**
   * Initialize the database service and connect to MongoDB
   */
  static async initialize(): Promise<void> {
    try {
      await connectDB();
      console.log('✅ Database service initialized with MongoDB');
    } catch (error) {
      console.error('❌ Failed to initialize database service:', error);
      throw error;
    }
  }

  /**
   * Create a new document record in MongoDB
   */
  static async createDocument(input: CreateDocumentInput): Promise<DocumentRecord> {
    try {
      const now = new Date();
      
      const documentData = {
        id: input.id,
        filename: input.filename,
        originalName: input.originalName,
        mimeType: input.mimeType,
        content: input.content,
        summary: input.summary,
        topics: input.topics || [],
        classification: input.classification,
        entities: input.entities || [],
        category: input.category, // Smart KB category
        wordCount: input.metadata.wordCount,
        characters: input.metadata.characters,
        chunkCount: input.chunkCount,
        pageCount: input.metadata.pageCount,
        uploadedAt: now,
        updatedAt: now,
        fileSize: input.fileSize || input.content.length,
        language: 'en', // Default to English, could be detected later
        extractedAt: input.metadata.extractedAt
      };

      const document = new DocumentModel(documentData);
      await document.save();
      
      console.log(`✅ Created document record: ${document.originalName}`);
      
      return {
        id: document.id,
        filename: document.filename,
        originalName: document.originalName,
        mimeType: document.mimeType,
        content: document.content,
        summary: document.summary,
        topics: document.topics,
        classification: document.classification,
        // entities are excluded by getAllDocuments but included here for by-id fetch
        wordCount: document.wordCount,
        characters: document.characters,
        chunkCount: document.chunkCount,
        pageCount: document.pageCount,
        uploadedAt: document.uploadedAt,
        updatedAt: document.updatedAt,
        fileSize: document.fileSize,
        language: document.language,
        extractedAt: document.extractedAt
      };
    } catch (error: any) {
      if (error.code === 11000) {
        throw new Error('Document with this ID already exists');
      }
      console.error('Error creating document:', error);
      throw new Error(`Failed to create document: ${error.message}`);
    }
  }

  /**
   * Get document by ID from MongoDB
   */
  static async getDocumentById(id: string): Promise<DocumentRecord | null> {
    try {
      const document = await DocumentModel.findOne({ id }).exec();
      if (!document) return null;

      return {
        id: document.id,
        filename: document.filename,
        originalName: document.originalName,
        mimeType: document.mimeType,
        content: document.content,
        summary: document.summary,
        topics: document.topics,
        wordCount: document.wordCount,
        characters: document.characters,
        chunkCount: document.chunkCount,
        pageCount: document.pageCount,
        uploadedAt: document.uploadedAt,
        updatedAt: document.updatedAt,
        fileSize: document.fileSize,
        language: document.language,
        extractedAt: document.extractedAt
      };
    } catch (error) {
      console.error('Error getting document by ID:', error);
      throw new Error('Failed to retrieve document');
    }
  }

  /**
   * Get all documents (without content for performance)
   */
  static async getAllDocuments(): Promise<Omit<DocumentRecord, 'content'>[]> {
    try {
      const documents = await DocumentModel
        .find({}, { content: 0 }) // Exclude content field for performance
        .sort({ uploadedAt: -1 })
        .limit(1000) // Limit for performance
        .exec();

      return documents.map((doc: DocumentRecord) => ({
        id: doc.id,
        filename: doc.filename,
        originalName: doc.originalName,
        mimeType: doc.mimeType,
        summary: doc.summary,
        topics: doc.topics,
        wordCount: doc.wordCount,
        characters: doc.characters,
        chunkCount: doc.chunkCount,
        pageCount: doc.pageCount,
        uploadedAt: doc.uploadedAt,
        updatedAt: doc.updatedAt,
        fileSize: doc.fileSize,
        language: doc.language,
        extractedAt: doc.extractedAt
      }));
    } catch (error) {
      console.error('Error getting all documents:', error);
      throw new Error('Failed to retrieve documents');
    }
  }

  /**
   * Update document in MongoDB
   */
  static async updateDocument(
    id: string, 
    updates: Partial<Omit<DocumentRecord, 'id' | 'uploadedAt'>>
  ): Promise<DocumentRecord | null> {
    try {
      const document = await DocumentModel.findOneAndUpdate(
        { id },
        { ...updates, updatedAt: new Date() },
        { new: true }
      ).exec();

      if (!document) return null;

      return {
        id: document.id,
        filename: document.filename,
        originalName: document.originalName,
        mimeType: document.mimeType,
        content: document.content,
        summary: document.summary,
        topics: document.topics,
        wordCount: document.wordCount,
        characters: document.characters,
        chunkCount: document.chunkCount,
        pageCount: document.pageCount,
        uploadedAt: document.uploadedAt,
        updatedAt: document.updatedAt,
        fileSize: document.fileSize,
        language: document.language,
        extractedAt: document.extractedAt
      };
    } catch (error) {
      console.error('Error updating document:', error);
      throw new Error('Failed to update document');
    }
  }

  /**
   * Delete document and its chunks from MongoDB
   */
  static async deleteDocument(id: string): Promise<boolean> {
    try {
      // Delete the document record only (vectors/chunks handled by VectorService)
      const deleteResult = await DocumentModel.deleteOne({ id }).exec();

      if (deleteResult.deletedCount === 0) {
        return false; // Document not found
      }

      console.log(`✅ Deleted document ${id}`);
      return true;
    } catch (error) {
      console.error('Error deleting document:', error);
      throw new Error('Failed to delete document');
    }
  }

  /**
   * Search documents using MongoDB text search
   */
  static async searchDocuments(query: string, limit: number = 10): Promise<Omit<DocumentRecord, 'content'>[]> {
    try {
      const documents = await DocumentModel
        .find(
          { $text: { $search: query } },
          { 
            content: 0, // Exclude content for performance
            score: { $meta: 'textScore' }
          }
        )
        .sort({ score: { $meta: 'textScore' } })
        .limit(limit)
        .exec();

      return documents.map((doc: DocumentRecord) => ({
        id: doc.id,
        filename: doc.filename,
        originalName: doc.originalName,
        mimeType: doc.mimeType,
        summary: doc.summary,
        topics: doc.topics,
        wordCount: doc.wordCount,
        characters: doc.characters,
        chunkCount: doc.chunkCount,
        pageCount: doc.pageCount,
        uploadedAt: doc.uploadedAt,
        updatedAt: doc.updatedAt,
        fileSize: doc.fileSize,
        language: doc.language,
        extractedAt: doc.extractedAt
      }));
    } catch (error) {
      console.error('Error searching documents:', error);
      throw new Error('Failed to search documents');
    }
  }

  /**
   * Get comprehensive database statistics
   */
  static async getStats(): Promise<{
    totalDocuments: number;
    totalWords: number;
    totalCharacters: number;
    totalChunks: number;
    totalSizeMB: number;
    averageWordsPerDocument: number;
    recentUploads: number;
    topTopics: Array<{ topic: string; count: number }>;
  }> {
    try {
      const stats = await getDBStats();
      
      // Get recent uploads (last 7 days)
      const sevenDaysAgo = new Date();
      sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
      const recentUploads = await DocumentModel.countDocuments({
        uploadedAt: { $gte: sevenDaysAgo }
      });

      // Get top topics
      const topicsAggregation = await DocumentModel.aggregate([
        { $unwind: '$topics' },
        { $group: { _id: '$topics', count: { $sum: 1 } } },
        { $sort: { count: -1 } },
        { $limit: 10 },
        { $project: { topic: '$_id', count: 1, _id: 0 } }
      ]);

      return {
        totalDocuments: stats.documents,
        totalWords: stats.totalWords,
        totalCharacters: 0, // Will be calculated if needed
        totalChunks: stats.chunks,
        totalSizeMB: stats.totalSizeMB,
        averageWordsPerDocument: stats.documents > 0 ? Math.round(stats.totalWords / stats.documents) : 0,
        recentUploads,
        topTopics: topicsAggregation
      };
    } catch (error) {
      console.error('Error getting database stats:', error);
      throw new Error('Failed to retrieve database statistics');
    }
  }

  /**
   * Log search query for analytics
   */
  static async logSearchQuery(query: string, resultsCount: number, confidence: number, responseTime: number, sessionId?: string): Promise<void> {
    try {
      const searchLog = new SearchQueryModel({
        sessionId,
        query,
        resultsCount,
        confidence,
        responseTime
      });
      
      await searchLog.save();
    } catch (error) {
      // Don't throw error for logging failures, just log it
      console.warn('Failed to log search query:', error);
    }
  }

  /**
   * Get recent search queries
   */
  static async getRecentSearches(limit: number = 10): Promise<Array<{ query: string; timestamp: Date; resultsCount: number; confidence: number; responseTime: number }>> {
    try {
      const recent = await SearchQueryModel
        .find({}, { _id: 0, query: 1, timestamp: 1, resultsCount: 1, confidence: 1, responseTime: 1 })
        .sort({ timestamp: -1 })
        .limit(limit)
        .exec();

      return recent as Array<{ query: string; timestamp: Date; resultsCount: number; confidence: number; responseTime: number }>;
    } catch (error) {
      console.error('Error getting recent searches:', error);
      return [];
    }
  }

  // Chat thread helpers
  static async createThread(strategy: 'hybrid' | 'vector', rerank: boolean): Promise<{ threadId: string }> {
    const threadId = `thread_${Date.now()}_${Math.random().toString(36).slice(2,9)}`;
    const thread = new ChatThreadModel({ threadId, strategy, rerank, messageCount: 0 });
    await thread.save();
    return { threadId };
  }

  static async listThreads(limit: number = 20) {
    return ChatThreadModel.find({}).sort({ updatedAt: -1 }).limit(limit).lean();
  }

  static async addMessage(threadId: string, role: 'user' | 'assistant' | 'system', content: string, metadata?: any, agentTrace?: any[]) {
    const msg = new ChatMessageModel({ threadId, role, content, metadata, agentTrace });
    await msg.save();
    await ChatThreadModel.findOneAndUpdate(
      { threadId },
      { $inc: { messageCount: 1 }, $set: { updatedAt: new Date(), lastMessageAt: new Date() } },
      { upsert: false }
    );
    return msg;
  }

  static async getMessages(threadId: string, limit: number = 100) {
    return ChatMessageModel.find({ threadId }).sort({ createdAt: 1 }).limit(limit).lean();
  }

  // Saved searches
  static async createSavedSearch(query: string, alertFrequency?: 'daily' | 'weekly' | 'monthly') {
    const id = `ss_${Date.now()}_${Math.random().toString(36).slice(2,8)}`;
    const s = new SavedSearchModel({ id, query, alertFrequency });
    await s.save();
    return { id };
  }

  static async listSavedSearches(limit: number = 100) {
    return SavedSearchModel.find({}).sort({ createdAt: -1 }).limit(limit).lean();
  }

  static async deleteSavedSearch(id: string) {
    await SavedSearchModel.deleteOne({ id }).exec();
  }

  static async updateThreadTitle(threadId: string, title: string): Promise<void> {
    await ChatThreadModel.findOneAndUpdate({ threadId }, { $set: { title, updatedAt: new Date() } }).exec();
  }

  static async deleteThread(threadId: string): Promise<void> {
    await ChatMessageModel.deleteMany({ threadId }).exec();
    await ChatThreadModel.deleteOne({ threadId }).exec();
  }

  /**
   * Update or create user session
   */
  static async updateUserSession(sessionId: string, ipAddress: string, userAgent?: string): Promise<void> {
    try {
      await UserSessionModel.findOneAndUpdate(
        { sessionId },
        {
          $set: { 
            ipAddress, 
            userAgent, 
            lastActivity: new Date() 
          },
          $setOnInsert: { 
            documentsUploaded: 0, 
            searchesPerformed: 0,
            createdAt: new Date()
          }
        },
        { upsert: true }
      ).exec();
    } catch (error) {
      console.warn('Failed to update user session:', error);
    }
  }

  /**
   * Increment user activity counters
   */
  static async incrementUserActivity(sessionId: string, type: 'upload' | 'search'): Promise<void> {
    try {
      const field = type === 'upload' ? 'documentsUploaded' : 'searchesPerformed';
      await UserSessionModel.findOneAndUpdate(
        { sessionId },
        { 
          $inc: { [field]: 1 },
          $set: { lastActivity: new Date() }
        }
      ).exec();
    } catch (error) {
      console.warn('Failed to increment user activity:', error);
    }
  }

  /**
   * Clear all data (for development/testing only)
   */
  static async clearAll(): Promise<{ documents: number; chunks: number }> {
    if (process.env.NODE_ENV === 'production') {
      throw new Error('Cannot clear data in production environment');
    }

    try {
      const docResult = await DocumentModel.deleteMany({}).exec();
      const chunkResult = await DocumentChunkModel.deleteMany({}).exec();
      
      console.log(`🗑️  Cleared ${docResult.deletedCount} documents and ${chunkResult.deletedCount} chunks`);
      
      return {
        documents: docResult.deletedCount || 0,
        chunks: chunkResult.deletedCount || 0
      };
    } catch (error) {
      console.error('Error clearing database:', error);
      throw new Error('Failed to clear database');
    }
  }
}