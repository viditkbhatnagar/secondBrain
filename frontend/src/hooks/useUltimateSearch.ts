import { useState, useCallback, useRef } from 'react';

// API base URL - uses environment variable in production
const API_BASE_URL = process.env.REACT_APP_API_URL || '';

interface SearchSource {
  documentName: string;
  score: number;
  preview: string;
  documentId?: string;
  content?: string;
  relevanceScore?: number;
}

interface SearchMetrics {
  retrievalTime?: number;
  rerankingTime?: number;
  generationTime?: number;
  cacheHit?: boolean;
  queryType?: string;
  responseTime?: number;
  ttft?: number | null;
  tokenCount?: number;
}

interface SearchResult {
  answer: string;
  sources: SearchSource[];
  confidence: number;
  responseTime: number;
  cached: boolean;
  metrics?: SearchMetrics;
}

interface UseUltimateSearchOptions {
  onSourcesReceived?: (sources: SearchSource[]) => void;
  onTokenReceived?: (token: string) => void;
  onComplete?: (result: SearchResult) => void;
  onError?: (error: Error) => void;
}

interface SearchConfig {
  streaming?: boolean;
  maxSources?: number;
  minConfidence?: number;
  enableHyDE?: boolean;
  enableCompression?: boolean;
  enableReranking?: boolean;
  enableQueryDecomposition?: boolean;
  model?: 'gpt-3.5-turbo' | 'gpt-4' | 'gpt-4-turbo-preview';
}

export function useUltimateSearch(options: UseUltimateSearchOptions = {}) {
  const [isLoading, setIsLoading] = useState(false);
  const [sources, setSources] = useState<SearchSource[]>([]);
  const [answer, setAnswer] = useState('');
  const [error, setError] = useState<Error | null>(null);
  const [metrics, setMetrics] = useState<SearchMetrics | null>(null);
  const [confidence, setConfidence] = useState<number>(0);
  const abortRef = useRef<AbortController | null>(null);

  const search = useCallback(async (query: string, config: SearchConfig = {}) => {
    // Cancel previous request
    if (abortRef.current) {
      abortRef.current.abort();
    }
    abortRef.current = new AbortController();

    setIsLoading(true);
    setError(null);
    setSources([]);
    setAnswer('');
    setMetrics(null);
    setConfidence(0);

    const startTime = Date.now();
    const streaming = config.streaming ?? true;

    try {
      if (streaming) {
        // Streaming request
        const response = await fetch(`${API_BASE_URL}/api/search/ultimate/stream`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ query, ...config }),
          signal: abortRef.current.signal
        });

        if (!response.ok) {
          throw new Error(`Search failed: ${response.statusText}`);
        }

        const reader = response.body?.getReader();
        const decoder = new TextDecoder();
        let fullAnswer = '';
        let receivedSources: SearchSource[] = [];

        while (reader) {
          const { done, value } = await reader.read();
          if (done) break;

          const chunk = decoder.decode(value);
          const lines = chunk.split('\n').filter(line => line.startsWith('data: '));

          for (const line of lines) {
            try {
              const data = JSON.parse(line.slice(6));

              switch (data.type) {
                case 'sources':
                  receivedSources = data.data;
                  setSources(data.data);
                  options.onSourcesReceived?.(data.data);
                  break;
                case 'token':
                  fullAnswer += data.data;
                  setAnswer(fullAnswer);
                  options.onTokenReceived?.(data.data);
                  break;
                case 'thinking':
                  // Optional: handle thinking state
                  break;
                case 'done':
                  setMetrics(data.data);
                  setConfidence(0.8); // Default confidence for streaming
                  options.onComplete?.({
                    answer: fullAnswer,
                    sources: receivedSources,
                    confidence: 0.8,
                    responseTime: Date.now() - startTime,
                    cached: false,
                    metrics: data.data
                  });
                  break;
                case 'error':
                  throw new Error(data.data.message);
              }
            } catch (e) {
              // Ignore parse errors for incomplete chunks
              if (e instanceof SyntaxError) continue;
              throw e;
            }
          }
        }
      } else {
        // Non-streaming request
        const response = await fetch(`${API_BASE_URL}/api/search/ultimate`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ query, streaming: false, ...config }),
          signal: abortRef.current.signal
        });

        if (!response.ok) {
          throw new Error(`Search failed: ${response.statusText}`);
        }

        const data = await response.json();
        
        if (data.success) {
          setSources(data.data.sources);
          setAnswer(data.data.answer);
          setMetrics(data.data.metrics);
          setConfidence(data.data.confidence);
          options.onComplete?.(data.data);
        } else {
          throw new Error(data.error || 'Search failed');
        }
      }

    } catch (err: any) {
      if (err.name !== 'AbortError') {
        setError(err);
        options.onError?.(err);
      }
    } finally {
      setIsLoading(false);
    }
  }, [options]);

  // Quick search (optimized for speed)
  const quickSearch = useCallback(async (query: string) => {
    if (abortRef.current) {
      abortRef.current.abort();
    }
    abortRef.current = new AbortController();

    setIsLoading(true);
    setError(null);

    try {
      const response = await fetch(`${API_BASE_URL}/api/search/ultimate/quick?q=${encodeURIComponent(query)}`, {
        signal: abortRef.current.signal
      });

      if (!response.ok) {
        throw new Error(`Search failed: ${response.statusText}`);
      }

      const data = await response.json();
      setSources(data.sources || []);
      setAnswer(data.answer || '');
      setMetrics(data.metrics || null);
      setConfidence(data.confidence || 0);
      
      return data;
    } catch (err: any) {
      if (err.name !== 'AbortError') {
        setError(err);
        options.onError?.(err);
      }
      return null;
    } finally {
      setIsLoading(false);
    }
  }, [options]);

  const cancel = useCallback(() => {
    abortRef.current?.abort();
    setIsLoading(false);
  }, []);

  const reset = useCallback(() => {
    setSources([]);
    setAnswer('');
    setError(null);
    setMetrics(null);
    setConfidence(0);
  }, []);

  // Submit feedback for a search result
  const submitFeedback = useCallback(async (
    queryId: string,
    query: string,
    answer: string,
    rating: 'positive' | 'negative',
    feedback?: string
  ) => {
    try {
      const response = await fetch(`${API_BASE_URL}/api/search/ultimate/feedback`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          queryId,
          query,
          answer,
          rating,
          feedback,
          sourceIds: sources.map(s => s.documentId).filter(Boolean),
          confidence,
          responseTime: metrics?.responseTime
        })
      });

      return response.ok;
    } catch (err) {
      console.error('Failed to submit feedback:', err);
      return false;
    }
  }, [sources, confidence, metrics]);

  // Get system status
  const getSystemStatus = useCallback(async () => {
    try {
      const response = await fetch(`${API_BASE_URL}/api/search/ultimate/status`);
      if (response.ok) {
        const data = await response.json();
        return data.data;
      }
      return null;
    } catch {
      return null;
    }
  }, []);

  return {
    search,
    quickSearch,
    cancel,
    reset,
    submitFeedback,
    getSystemStatus,
    isLoading,
    sources,
    answer,
    error,
    metrics,
    confidence
  };
}

export default useUltimateSearch;
