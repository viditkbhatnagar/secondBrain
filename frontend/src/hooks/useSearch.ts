import { useState, useCallback, useRef } from 'react';
import { API_ENDPOINTS } from '../config/api';

interface SearchResult {
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
}

interface UseSearchOptions {
  streaming?: boolean;
  onSourcesReceived?: (sources: any[]) => void;
  onToken?: (token: string) => void;
}

// Get or create session ID
function getSessionId(): string {
  let sessionId = sessionStorage.getItem('sessionId');
  if (!sessionId) {
    sessionId = `session_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    sessionStorage.setItem('sessionId', sessionId);
  }
  return sessionId;
}

export function useSearch(options: UseSearchOptions = {}) {
  const [isLoading, setIsLoading] = useState(false);
  const [result, setResult] = useState<SearchResult | null>(null);
  const [error, setError] = useState<Error | null>(null);
  const [streamingText, setStreamingText] = useState('');
  const abortControllerRef = useRef<AbortController | null>(null);

  const search = useCallback(async (query: string) => {
    // Cancel previous request
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }

    abortControllerRef.current = new AbortController();
    setIsLoading(true);
    setError(null);
    setStreamingText('');

    const startTime = Date.now();

    try {
      if (options.streaming) {
        // Streaming request
        const response = await fetch(`${API_ENDPOINTS.search}/optimized`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-Session-Id': getSessionId()
          },
          body: JSON.stringify({ query, streaming: true }),
          signal: abortControllerRef.current.signal
        });

        const reader = response.body?.getReader();
        const decoder = new TextDecoder();
        let fullText = '';

        while (reader) {
          const { done, value } = await reader.read();
          if (done) break;

          const chunk = decoder.decode(value);
          const lines = chunk.split('\n').filter(line => line.startsWith('data: '));

          for (const line of lines) {
            try {
              const data = JSON.parse(line.slice(6));

              if (data.type === 'sources') {
                options.onSourcesReceived?.(data.sources);
              } else if (data.type === 'content') {
                fullText += data.content;
                setStreamingText(fullText);
                options.onToken?.(data.content);
              } else if (data.type === 'done') {
                setResult({
                  answer: fullText,
                  sources: [],
                  confidence: 0.8,
                  responseTime: Date.now() - startTime,
                  cached: false
                });
              }
            } catch (e) {
              // Skip malformed JSON
            }
          }
        }
      } else {
        // Regular request
        const response = await fetch(`${API_ENDPOINTS.search}/optimized`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-Session-Id': getSessionId()
          },
          body: JSON.stringify({
            query,
            maxSources: 5,
            minConfidence: 0.5
          }),
          signal: abortControllerRef.current.signal
        });

        const data = await response.json();
        
        if (data.success) {
          setResult(data.data);
        } else {
          throw new Error(data.error || 'Search failed');
        }
      }

    } catch (err: any) {
      if (err.name !== 'AbortError') {
        setError(err);
      }
    } finally {
      setIsLoading(false);
    }
  }, [options]);

  const cancel = useCallback(() => {
    abortControllerRef.current?.abort();
    setIsLoading(false);
  }, []);

  return {
    search,
    cancel,
    isLoading,
    result,
    error,
    streamingText
  };
}
