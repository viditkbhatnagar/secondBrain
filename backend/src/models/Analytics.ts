import mongoose, { Schema, Document } from 'mongoose';

// Event types for tracking
export type EventType =
  | 'search'
  | 'chat_message'
  | 'document_upload'
  | 'document_view'
  | 'document_delete'
  | 'ai_response'
  | 'error'
  | 'session_start'
  | 'session_end';

export interface IAnalyticsEvent extends Document {
  eventType: EventType;
  userId?: string;
  sessionId: string;
  timestamp: Date;
  metadata: {
    query?: string;
    documentId?: string;
    documentName?: string;
    responseTime?: number;
    tokensUsed?: number;
    promptTokens?: number;
    completionTokens?: number;
    estimatedCost?: number;
    aiSource?: 'chat' | 'training';  // Distinguish between chat and training AI calls
    aiFeature?: 'explain' | 'flashcards' | 'quiz' | 'audio' | 'voice_agent';  // Specific training feature
    confidence?: number;
    errorType?: string;
    errorMessage?: string;
    searchResultCount?: number;
    resultsCount?: number;
    fileType?: string;
    fileSize?: number;
    userAgent?: string;
    ipHash?: string;
    strategy?: string;
    threadId?: string;
    isFollowUp?: boolean;
    streaming?: boolean;
    cached?: boolean;
    wordCount?: number;
    chunkCount?: number;
    mimeType?: string;
    sourcesCount?: number;
    blazingSearch?: boolean;
    isGeneralKnowledge?: boolean;
    originalConfidence?: number;
  };
  createdAt: Date;
}

const AnalyticsEventSchema = new Schema<IAnalyticsEvent>({
  eventType: {
    type: String,
    required: true,
    enum: ['search', 'chat_message', 'document_upload', 'document_view',
            'document_delete', 'ai_response', 'error', 'session_start', 'session_end'],
    index: true
  },
  userId: { type: String, index: true },
  sessionId: { type: String, required: true, index: true },
  timestamp: { type: Date, default: Date.now, index: true },
  metadata: {
    query: String,
    documentId: String,
    documentName: String,
    responseTime: Number,
    tokensUsed: Number,
    promptTokens: Number,
    completionTokens: Number,
    estimatedCost: Number,
    aiSource: { type: String, enum: ['chat', 'training'] },
    aiFeature: { type: String, enum: ['explain', 'flashcards', 'quiz', 'audio'] },
    confidence: Number,
    errorType: String,
    errorMessage: String,
    searchResultCount: Number,
    resultsCount: Number,
    fileType: String,
    fileSize: Number,
    userAgent: String,
    ipHash: String,
    strategy: String,
    threadId: String,
    isFollowUp: Boolean,
    streaming: Boolean,
    cached: Boolean,
    wordCount: Number,
    chunkCount: Number,
    sourcesCount: Number,
    blazingSearch: Boolean,
    isGeneralKnowledge: Boolean,
    originalConfidence: Number
  }
}, {
  timestamps: true
});

// Indexes for efficient queries
AnalyticsEventSchema.index({ eventType: 1, timestamp: -1 });
AnalyticsEventSchema.index({ timestamp: -1 });
AnalyticsEventSchema.index({ 'metadata.documentId': 1 });

export const AnalyticsEvent = mongoose.model<IAnalyticsEvent>('AnalyticsEvent', AnalyticsEventSchema);

// Daily aggregated stats
export interface IDailyStats extends Document {
  date: Date;
  totalSearches: number;
  totalChats: number;
  totalUploads: number;
  totalDocumentViews: number;
  uniqueSessions: number;
  avgResponseTime: number;
  avgConfidence: number;
  totalTokensUsed: number;
  errorCount: number;
  topQueries: Array<{ query: string; count: number }>;
  topDocuments: Array<{ documentId: string; name: string; views: number }>;
  searchesByHour: number[];
  fileTypesUploaded: Record<string, number>;
}

const DailyStatsSchema = new Schema<IDailyStats>({
  date: { type: Date, required: true, unique: true, index: true },
  totalSearches: { type: Number, default: 0 },
  totalChats: { type: Number, default: 0 },
  totalUploads: { type: Number, default: 0 },
  totalDocumentViews: { type: Number, default: 0 },
  uniqueSessions: { type: Number, default: 0 },
  avgResponseTime: { type: Number, default: 0 },
  avgConfidence: { type: Number, default: 0 },
  totalTokensUsed: { type: Number, default: 0 },
  errorCount: { type: Number, default: 0 },
  topQueries: [{ query: String, count: Number }],
  topDocuments: [{ documentId: String, name: String, views: Number }],
  searchesByHour: { type: [Number], default: () => new Array(24).fill(0) },
  fileTypesUploaded: { type: Map, of: Number, default: {} }
}, {
  timestamps: true
});

export const DailyStats = mongoose.model<IDailyStats>('DailyStats', DailyStatsSchema);
