import { useState, useCallback } from 'react';
import { browserCache } from '../utils/browserCache';
import { API_BASE_URL } from '../config/api';

interface SearchResponse {
  answer: string;
  sources: Array<{
    documentId: string;
    documentName: string;
    content: string;
    relevanceScore: number;
  }>;
  confidence: number;
  responseTime: number;
  cached: boolean;
  metadata: {
    fromCache: boolean;
    cacheLayer?: string;
    searchTime?: number;
    llmTime?: number;
  };
}

interface UseBlazingSearchResult {
  search: (query: string, options?: SearchOptions) => Promise<SearchResponse>;
  loading: boolean;
  error: string | null;
  response: SearchResponse | null;
  cacheStats: any;
}

interface SearchOptions {
  maxSources?: number;
  useCache?: boolean;
  forceRefresh?: boolean;
}

/**
 * React hook for blazing-fast searches with aggressive caching
 * 
 * Features:
 * - Automatic browser-side caching
 * - Instant responses for repeated queries
 * - Loading and error states
 * - Cache statistics
 */
export function useBlazingSearch(): UseBlazingSearchResult {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [response, setResponse] = useState<SearchResponse | null>(null);
  const [cacheStats, setCacheStats] = useState(browserCache.getStats());

  const search = useCallback(async (
    query: string,
    options: SearchOptions = {}
  ): Promise<SearchResponse> => {
    setLoading(true);
    setError(null);

    const {
      maxSources = 3,
      useCache = true,
      forceRefresh = false
    } = options;

    try {
      // Check browser cache first (instant)
      if (useCache && !forceRefresh) {
        const cached = await browserCache.getCachedSearchResponse(query);
        if (cached) {
          console.log('🚀 Browser cache HIT - instant response!');
          setResponse(cached);
          setLoading(false);
          setCacheStats(browserCache.getStats());
          return cached;
        }
      }

      // Make API request
      const startTime = Date.now();
      const apiResponse = await fetch(`${API_BASE_URL}/blazing/search`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Session-ID': getSessionId()
        },
        body: JSON.stringify({
          query,
          maxSources,
          useCache: !forceRefresh
        })
      });

      if (!apiResponse.ok) {
        const errorData = await apiResponse.json().catch(() => ({}));
        throw new Error(errorData.message || 'Search failed');
      }

      const result = await apiResponse.json();
      const searchResponse: SearchResponse = result.data;

      // Update response time to include network latency
      searchResponse.responseTime = Date.now() - startTime;

      // Cache the response in browser
      if (useCache) {
        const cacheTTL = searchResponse.confidence > 80 ? 7200 : 3600;
        await browserCache.cacheSearchResponse(query, searchResponse, cacheTTL);
      }

      setResponse(searchResponse);
      setLoading(false);
      setCacheStats(browserCache.getStats());

      console.log(`✅ Search completed in ${searchResponse.responseTime}ms`, {
        cached: searchResponse.cached,
        confidence: searchResponse.confidence,
        sources: searchResponse.sources.length
      });

      return searchResponse;

    } catch (err: any) {
      const errorMessage = err.message || 'An error occurred during search';
      setError(errorMessage);
      setLoading(false);
      console.error('Search error:', err);
      throw err;
    }
  }, []);

  return {
    search,
    loading,
    error,
    response,
    cacheStats
  };
}

/**
 * Get or create session ID
 */
function getSessionId(): string {
  let sessionId = sessionStorage.getItem('session-id');
  if (!sessionId) {
    sessionId = `session-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    sessionStorage.setItem('session-id', sessionId);
  }
  return sessionId;
}

/**
 * Clear browser cache (call when documents are uploaded/deleted)
 */
export async function clearSearchCache(): Promise<void> {
  await browserCache.clearAll();
  console.log('✅ Search cache cleared');
}

/**
 * Get cache statistics
 */
export function getSearchCacheStats() {
  return browserCache.getStats();
}

