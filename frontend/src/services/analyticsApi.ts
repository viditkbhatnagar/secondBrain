import { API_BASE_URL } from '../config/api';

export interface OverviewStats {
  totalSearches: number;
  totalChats: number;
  totalUploads: number;
  totalDocuments: number;
  avgResponseTime: number;
  avgConfidence: number;
  totalTokensUsed: number;
  uniqueSessions: number;
  errorRate: number;
  trends: {
    searches: number;
    chats: number;
    uploads: number;
  };
}

export interface TimeSeriesDataPoint {
  timestamp: string;
  date: string;
  search?: number;
  chat_message?: number;
  document_upload?: number;
  [key: string]: number | string | undefined;
}

export interface TopQuery {
  query: string;
  count: number;
  avgConfidence: number;
  avgResponseTime: number;
}

export interface TopDocument {
  documentId: string;
  documentName: string;
  views: number;
  searches: number;
}

export interface HeatmapData {
  day: number;
  hour: number;
  count: number;
}

export interface FileTypeData {
  type: string;
  count: number;
  totalSize: number;
}

export interface ResponseTimePercentiles {
  p50: number;
  p75: number;
  p90: number;
  p95: number;
  p99: number;
  avg: number;
}

export interface ConfidenceDistribution {
  range: string;
  count: number;
  percentage: number;
}

export interface RealTimeStats {
  activeUsers: number;
  searchesPerMinute: number;
  avgResponseTime: number;
  recentEvents: Array<{
    type: string;
    timestamp: string;
    metadata: any;
  }>;
}

export interface CostStats {
  chat: {
    totalTokens: number;
    promptTokens: number;
    completionTokens: number;
    estimatedCost: number;
    requestCount: number;
  };
  training: {
    totalTokens: number;
    promptTokens: number;
    completionTokens: number;
    estimatedCost: number;
    requestCount: number;
    byFeature: {
      explain: { tokens: number; cost: number; count: number };
      flashcards: { tokens: number; cost: number; count: number };
      quiz: { tokens: number; cost: number; count: number };
      audio: { tokens: number; cost: number; count: number };
      voice_agent: { tokens: number; cost: number; count: number };
    };
  };
  total: {
    totalTokens: number;
    estimatedCost: number;
    requestCount: number;
  };
}

const ANALYTICS_BASE = `${API_BASE_URL}/analytics`;

async function fetchJson<T>(url: string): Promise<T> {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`HTTP error! status: ${response.status}`);
  }
  return response.json();
}

export const analyticsApi = {
  getOverview: async (days: number = 30): Promise<OverviewStats> => {
    return fetchJson<OverviewStats>(`${ANALYTICS_BASE}/overview?days=${days}`);
  },

  getTimeSeries: async (
    days: number = 30,
    granularity: 'hour' | 'day' | 'week' = 'day',
    events: string[] = ['search', 'chat_message', 'document_upload']
  ): Promise<TimeSeriesDataPoint[]> => {
    return fetchJson<TimeSeriesDataPoint[]>(
      `${ANALYTICS_BASE}/timeseries?days=${days}&granularity=${granularity}&events=${events.join(',')}`
    );
  },

  getTopQueries: async (days: number = 30, limit: number = 10): Promise<TopQuery[]> => {
    return fetchJson<TopQuery[]>(`${ANALYTICS_BASE}/top-queries?days=${days}&limit=${limit}`);
  },

  getTopDocuments: async (days: number = 30, limit: number = 10): Promise<TopDocument[]> => {
    return fetchJson<TopDocument[]>(`${ANALYTICS_BASE}/top-documents?days=${days}&limit=${limit}`);
  },

  getHeatmap: async (days: number = 30): Promise<HeatmapData[]> => {
    return fetchJson<HeatmapData[]>(`${ANALYTICS_BASE}/heatmap?days=${days}`);
  },

  getFileTypes: async (days: number = 30): Promise<FileTypeData[]> => {
    return fetchJson<FileTypeData[]>(`${ANALYTICS_BASE}/file-types?days=${days}`);
  },

  getResponseTimes: async (days: number = 30): Promise<ResponseTimePercentiles> => {
    return fetchJson<ResponseTimePercentiles>(`${ANALYTICS_BASE}/response-times?days=${days}`);
  },

  getConfidenceDistribution: async (days: number = 30): Promise<ConfidenceDistribution[]> => {
    return fetchJson<ConfidenceDistribution[]>(`${ANALYTICS_BASE}/confidence?days=${days}`);
  },

  getRealTime: async (): Promise<RealTimeStats> => {
    return fetchJson<RealTimeStats>(`${ANALYTICS_BASE}/realtime`);
  },

  getCosts: async (days: number = 30): Promise<CostStats> => {
    return fetchJson<CostStats>(`${ANALYTICS_BASE}/costs?days=${days}`);
  },

  trackEvent: async (
    eventType: string,
    sessionId: string,
    metadata: Record<string, any> = {}
  ): Promise<void> => {
    await fetch(`${ANALYTICS_BASE}/track`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ eventType, sessionId, metadata })
    });
  }
};

// Session management
let sessionId: string | null = null;

export const getSessionId = (): string => {
  if (!sessionId) {
    sessionId = localStorage.getItem('analytics_session_id');
    if (!sessionId) {
      sessionId = `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
      localStorage.setItem('analytics_session_id', sessionId);
    }
  }
  return sessionId;
};

export const trackEvent = (eventType: string, metadata: Record<string, any> = {}): void => {
  analyticsApi.trackEvent(eventType, getSessionId(), metadata).catch(console.error);
};
