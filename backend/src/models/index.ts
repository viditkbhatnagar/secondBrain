import mongoose, { Schema, Document } from 'mongoose';

// Document metadata interface
export interface IDocument extends Document {
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
  pageCount?: number;
  uploadedAt: Date;
  updatedAt: Date;
  fileSize: number;
  language?: string;
  extractedAt: Date;
}

// Document chunk for vector search
export interface IDocumentChunk extends Document {
  id: string;
  documentId: string;
  documentName: string;
  chunkId: string;
  content: string;
  chunkIndex: number;
  startPosition: number;
  endPosition: number;
  wordCount: number;
  embedding: number[]; // Vector embedding
  createdAt: Date;
}

// User session tracking (optional)
export interface IUserSession extends Document {
  sessionId: string;
  ipAddress: string;
  userAgent?: string;
  documentsUploaded: number;
  searchesPerformed: number;
  lastActivity: Date;
  createdAt: Date;
}

// Search query logging (for analytics)
export interface ISearchQuery extends Document {
  sessionId?: string;
  query: string;
  resultsCount: number;
  confidence: number;
  responseTime: number;
  timestamp: Date;
}

// Chat thread and message models
export interface IChatThread extends Document {
  threadId: string;
  title?: string;
  strategy: 'hybrid' | 'vector';
  rerank: boolean;
  messageCount: number;
  createdAt: Date;
  updatedAt: Date;
  lastMessageAt?: Date;
}

export interface IChatMessage extends Document {
  threadId: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  metadata?: any;
  agentTrace?: any[];
  createdAt: Date;
}

// Document schema
const DocumentSchema = new Schema<IDocument>({
  id: { type: String, required: true, unique: true, index: true },
  filename: { type: String, required: true },
  originalName: { type: String, required: true, index: true },
  mimeType: { type: String, required: true },
  content: { type: String, required: true },
  summary: { type: String },
  topics: [{ type: String, index: true }],
  wordCount: { type: Number, required: true, index: true },
  characters: { type: Number, required: true },
  chunkCount: { type: Number, required: true },
  pageCount: { type: Number },
  uploadedAt: { type: Date, default: Date.now, index: true },
  updatedAt: { type: Date, default: Date.now },
  fileSize: { type: Number, required: true },
  language: { type: String, default: 'en' },
  extractedAt: { type: Date, required: true }
});

// Add text indexes for search functionality
DocumentSchema.index({
  originalName: 'text',
  summary: 'text',
  topics: 'text',
  content: 'text'
}, {
  weights: {
    originalName: 10,
    summary: 5,
    topics: 3,
    content: 1
  }
});

// Document chunk schema with vector index
const DocumentChunkSchema = new Schema<IDocumentChunk>({
  id: { type: String, required: true, unique: true, index: true },
  documentId: { type: String, required: true, index: true },
  documentName: { type: String, required: true, index: true },
  chunkId: { type: String, required: true, unique: true, index: true },
  content: { type: String, required: true },
  chunkIndex: { type: Number, required: true },
  startPosition: { type: Number, required: true },
  endPosition: { type: Number, required: true },
  wordCount: { type: Number, required: true },
  embedding: [{ type: Number }], // Array of numbers for vector
  createdAt: { type: Date, default: Date.now, index: true }
});

// Enable text search over chunk content for hybrid retrieval
DocumentChunkSchema.index({ content: 'text' });

// Note: If using MongoDB Atlas Vector Search, configure the vector index in Atlas UI or via admin scripts.

// User session schema
const UserSessionSchema = new Schema<IUserSession>({
  sessionId: { type: String, required: true, unique: true, index: true },
  ipAddress: { type: String, required: true, index: true },
  userAgent: { type: String },
  documentsUploaded: { type: Number, default: 0 },
  searchesPerformed: { type: Number, default: 0 },
  lastActivity: { type: Date, default: Date.now, index: true },
  createdAt: { type: Date, default: Date.now, index: true }
});

// Search query schema
const SearchQuerySchema = new Schema<ISearchQuery>({
  sessionId: { type: String, index: true },
  query: { type: String, required: true, index: true },
  resultsCount: { type: Number, required: true },
  confidence: { type: Number, required: true },
  responseTime: { type: Number, required: true },
  timestamp: { type: Date, default: Date.now, index: true }
});

// Create and export models
export const DocumentModel = mongoose.model<IDocument>('Document', DocumentSchema);
export const DocumentChunkModel = mongoose.model<IDocumentChunk>('DocumentChunk', DocumentChunkSchema);
export const UserSessionModel = mongoose.model<IUserSession>('UserSession', UserSessionSchema);
export const SearchQueryModel = mongoose.model<ISearchQuery>('SearchQuery', SearchQuerySchema);

// Chat schemas
const ChatThreadSchema = new Schema<IChatThread>({
  threadId: { type: String, required: true, unique: true, index: true },
  title: { type: String },
  strategy: { type: String, enum: ['hybrid', 'vector'], default: 'hybrid', index: true },
  rerank: { type: Boolean, default: true },
  messageCount: { type: Number, default: 0 },
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now },
  lastMessageAt: { type: Date, index: true }
});

const ChatMessageSchema = new Schema<IChatMessage>({
  threadId: { type: String, required: true, index: true },
  role: { type: String, enum: ['user', 'assistant', 'system'], required: true },
  content: { type: String, required: true },
  metadata: { type: Schema.Types.Mixed },
  agentTrace: { type: Array },
  createdAt: { type: Date, default: Date.now, index: true }
});

export const ChatThreadModel = mongoose.model<IChatThread>('ChatThread', ChatThreadSchema);
export const ChatMessageModel = mongoose.model<IChatMessage>('ChatMessage', ChatMessageSchema);

// Helper function to connect to MongoDB
export const connectDB = async (): Promise<void> => {
  try {
    const mongoUri = process.env.MONGODB_URI;
    
    console.log('🔍 Checking MongoDB URI...');
    
    if (!mongoUri) {
      throw new Error('MONGODB_URI is required in environment variables');
    }

    // Debug: Print sanitized URI (hide password)
    const sanitizedUri = mongoUri.replace(/:([^:@]{1,}@)/, ':***@');
    console.log('📝 MongoDB URI format:', sanitizedUri);

    // Validate URI format
    if (!mongoUri.startsWith('mongodb://') && !mongoUri.startsWith('mongodb+srv://')) {
      throw new Error(`Invalid MongoDB URI format. Got: "${mongoUri.substring(0, 20)}..."`);
    }

    const options = {
      maxPoolSize: 10, // Maintain up to 10 socket connections
      serverSelectionTimeoutMS: 5000, // Keep trying to send operations for 5 seconds
      socketTimeoutMS: 45000, // Close sockets after 45 seconds of inactivity
    };

    console.log('🔌 Attempting to connect to MongoDB...');
    await mongoose.connect(mongoUri, options);
    console.log('✅ MongoDB connected successfully');

    // Handle connection events
    mongoose.connection.on('error', (err) => {
      console.error('❌ MongoDB connection error:', err);
    });

    mongoose.connection.on('disconnected', () => {
      console.warn('⚠️  MongoDB disconnected');
    });

    // Graceful shutdown
    process.on('SIGINT', async () => {
      await mongoose.connection.close();
      console.log('📴 MongoDB connection closed through app termination');
      process.exit(0);
    });

  } catch (error: any) {
    console.error('❌ MongoDB connection failed:', error.message);
    
    // Provide helpful error messages
    if (error.message.includes('Invalid scheme')) {
      console.error('💡 Make sure your MONGODB_URI starts with "mongodb+srv://" or "mongodb://"');
    } else if (error.message.includes('Authentication failed')) {
      console.error('💡 Check your username and password in the connection string');
    } else if (error.message.includes('Network')) {
      console.error('💡 Check your network connection and MongoDB Atlas network access settings');
    }
    
    process.exit(1);
  }
};

// Helper functions for database operations
export const getDBStats = async () => {
  try {
    const documentCount = await DocumentModel.countDocuments();
    const chunkCount = await DocumentChunkModel.countDocuments();
    const sessionCount = await UserSessionModel.countDocuments();
    const searchCount = await SearchQueryModel.countDocuments();
    
    const totalWords = await DocumentModel.aggregate([
      { $group: { _id: null, total: { $sum: '$wordCount' } } }
    ]);

    const totalSize = await DocumentModel.aggregate([
      { $group: { _id: null, total: { $sum: '$fileSize' } } }
    ]);

    return {
      documents: documentCount,
      chunks: chunkCount,
      sessions: sessionCount,
      searches: searchCount,
      totalWords: totalWords[0]?.total || 0,
      totalSizeBytes: totalSize[0]?.total || 0,
      totalSizeMB: Math.round((totalSize[0]?.total || 0) / 1024 / 1024 * 100) / 100
    };
  } catch (error) {
    console.error('Error getting database stats:', error);
    throw error;
  }
};