import React, { useState, useEffect, useRef } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { Search, X } from 'lucide-react';
import { API_ENDPOINTS } from '../config/api';
import { IdleView, SearchingView, ResultsView, SearchState, SearchStage, Source } from './search';
import { Button, useToast } from './ui';

export const SearchPage: React.FC = () => {
  // State
  const [state, setState] = useState<SearchState>('idle');
  const [stage, setStage] = useState<SearchStage>('understanding');
  const [query, setQuery] = useState('');
  const [currentQuery, setCurrentQuery] = useState('');
  const [answer, setAnswer] = useState<string | null>(null);
  const [confidence, setConfidence] = useState(0);
  const [sources, setSources] = useState<Source[]>([]);
  const [relatedQuestions, setRelatedQuestions] = useState<string[]>([]);
  const [strategy, setStrategy] = useState<'hybrid' | 'vector'>('hybrid');
  const [rerank, setRerank] = useState(true);
  const [stats, setStats] = useState({ totalDocuments: 0, totalChunks: 0 });
  const [sectionsFound, setSectionsFound] = useState(0);

  // Refs
  const inputRef = useRef<HTMLInputElement>(null);
  const abortControllerRef = useRef<AbortController | null>(null);

  // Toast
  const toast = useToast();

  // Load stats on mount
  useEffect(() => {
    fetchStats();
  }, []);

  const fetchStats = async () => {
    try {
      const res = await fetch(API_ENDPOINTS.documentsStats);
      if (res.ok) {
        const data = await res.json();
        setStats({
          totalDocuments: data.totalDocuments || 0,
          totalChunks: data.totalChunks || 0,
        });
      }
    } catch (error) {
      console.error('Failed to fetch stats:', error);
    }
  };

  const handleSearch = async (searchQuery?: string) => {
    const q = (searchQuery || query).trim();
    if (!q) return;

    // Reset state
    setCurrentQuery(q);
    setState('searching');
    setStage('understanding');
    setAnswer(null);
    setSources([]);
    setRelatedQuestions([]);
    setSectionsFound(0);

    // Create abort controller
    abortControllerRef.current = new AbortController();

    // Simulate stage progression
    setTimeout(() => setStage('searching'), 800);

    try {
      // Use blazing-fast search endpoint for 95% faster responses!
      const response = await fetch(API_ENDPOINTS.blazingSearch, {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'X-Session-ID': sessionStorage.getItem('session-id') || `session-${Date.now()}`
        },
        body: JSON.stringify({ 
          query: q, 
          maxSources: 3,  // Optimized for speed
          useCache: true   // Enable aggressive caching
        }),
        signal: abortControllerRef.current.signal,
      });

      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.message || 'Search failed');
      }

      // Extract data from blazing search response format
      const data = result.success ? result.data : result;

      // Update found count
      setStage('found');
      setSectionsFound(data.sources?.length || 0);
      
      // If cached, skip the artificial delays (instant response!)
      const delayTime = data.cached ? 50 : 800;
      await new Promise((r) => setTimeout(r, delayTime));

      // Composing stage
      setStage('composing');
      await new Promise((r) => setTimeout(r, data.cached ? 30 : 600));

      // Transform sources (blazing format uses 'sources' not 'relevantChunks')
      const transformedSources: Source[] = (data.sources || []).map(
        (source: any) => ({
          documentName: source.documentName,
          content: source.content,
          similarity: source.relevanceScore,
          chunkId: source.documentId, // Use documentId as fallback
        })
      );

      // Set results
      setAnswer(data.answer);
      setConfidence(data.confidence || 0);
      setSources(transformedSources);

      // Log performance metrics
      console.log(`🚀 Search completed in ${data.responseTime}ms`, {
        cached: data.cached,
        cacheLayer: data.metadata?.cacheLayer,
        confidence: data.confidence
      });

      // Generate related questions
      if (data.answer) {
        generateRelatedQuestions(q, data.answer);
      }

      // Transition to results
      setStage('done');
      await new Promise((r) => setTimeout(r, 300));
      setState('results');
    } catch (error: any) {
      if (error.name === 'AbortError') {
        // Search was cancelled
        setState('idle');
        return;
      }

      console.error('Search error:', error);
      toast.error('Search failed', error.message || 'Please try again');
      setState('idle');
    }
  };

  const generateRelatedQuestions = async (query: string, answer: string) => {
    try {
      const response = await fetch(`${API_ENDPOINTS.search}/related-questions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query, answer: answer.substring(0, 500) }),
      });

      if (response.ok) {
        const data = await response.json();
        setRelatedQuestions(data.questions || []);
      }
    } catch (error) {
      console.error('Failed to generate related questions:', error);
      // Fallback questions
      setRelatedQuestions([
        'Can you provide more details?',
        'What are the implications?',
        'Are there any alternatives?',
      ]);
    }
  };

  const handleCancel = () => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
    setState('idle');
    setQuery('');
  };

  const handleClear = () => {
    setState('idle');
    setQuery('');
    setCurrentQuery('');
    setAnswer(null);
    setSources([]);
    setRelatedQuestions([]);
    inputRef.current?.focus();
  };

  const handleExampleClick = (example: string) => {
    setQuery(example);
    handleSearch(example);
  };

  const handleRegenerate = () => {
    handleSearch(currentQuery);
  };

  const copyAnswer = () => {
    if (answer) {
      navigator.clipboard.writeText(answer);
      toast.success('Copied', 'Answer copied to clipboard');
    }
  };

  const handleRelatedQuestionClick = (question: string) => {
    setQuery(question);
    handleSearch(question);
  };

  return (
    <div className="min-h-[calc(100vh-200px)] relative">
      {/* Search Bar - Sticky when in results state */}
      <motion.div
        className={`transition-all duration-500 ${
          state === 'results'
            ? 'sticky top-0 z-40 bg-white/95 dark:bg-secondary-900/95 backdrop-blur-sm py-4 px-4 -mx-4 shadow-sm mb-6'
            : state === 'idle'
            ? 'mb-0'
            : 'hidden'
        }`}
        layout
      >
        <div className={`max-w-2xl mx-auto ${state === 'idle' ? 'pt-8' : ''}`}>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              handleSearch();
            }}
            className="relative"
          >
            <div className="relative flex items-center">
              <Search className="absolute left-4 w-5 h-5 text-secondary-400 dark:text-secondary-500" />
              <input
                ref={inputRef}
                type="text"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="What would you like to know?"
                disabled={state === 'searching'}
                className="w-full pl-12 pr-56 py-4 text-lg border-2 border-secondary-200 dark:border-secondary-700 rounded-2xl shadow-sm bg-white dark:bg-secondary-800 text-secondary-900 dark:text-secondary-100 placeholder-secondary-400 dark:placeholder-secondary-500 focus:outline-none focus:border-primary-500 dark:focus:border-primary-400 focus:ring-4 focus:ring-primary-100 dark:focus:ring-primary-900/30 disabled:bg-secondary-50 dark:disabled:bg-secondary-900 transition-all"
              />
              <div className="absolute right-3 flex items-center gap-2">
                {state === 'results' && query && (
                  <button
                    type="button"
                    onClick={handleClear}
                    className="p-1.5 text-secondary-400 hover:text-secondary-600 dark:hover:text-secondary-300 hover:bg-secondary-100 dark:hover:bg-secondary-700 rounded-full transition-colors"
                    aria-label="Clear search"
                  >
                    <X className="w-4 h-4" />
                  </button>
                )}
                <select
                  value={strategy}
                  onChange={(e) =>
                    setStrategy(e.target.value as 'hybrid' | 'vector')
                  }
                  className="text-xs border border-secondary-200 dark:border-secondary-600 rounded-lg px-2 py-1.5 bg-white dark:bg-secondary-700 text-secondary-700 dark:text-secondary-300 focus:outline-none focus:ring-2 focus:ring-primary-500"
                >
                  <option value="hybrid">Hybrid</option>
                  <option value="vector">Vector</option>
                </select>
                <label className="flex items-center text-xs text-secondary-600 dark:text-secondary-400 cursor-pointer whitespace-nowrap">
                  <input
                    type="checkbox"
                    className="mr-1 rounded"
                    checked={rerank}
                    onChange={(e) => setRerank(e.target.checked)}
                  />
                  Rerank
                </label>
                <Button
                  type="submit"
                  variant="primary"
                  size="md"
                  disabled={!query.trim() || state === 'searching'}
                >
                  Search
                </Button>
              </div>
            </div>
          </form>
        </div>
      </motion.div>

      {/* Content Area with AnimatePresence */}
      <AnimatePresence mode="wait">
        {state === 'idle' && (
          <IdleView
            key="idle"
            documentsCount={stats.totalDocuments}
            chunksCount={stats.totalChunks}
            onExampleClick={handleExampleClick}
          />
        )}

        {state === 'searching' && (
          <SearchingView
            key="searching"
            query={currentQuery}
            stage={stage}
            documentsSearched={stats.totalDocuments}
            sectionsFound={sectionsFound}
            onCancel={handleCancel}
          />
        )}

        {state === 'results' && answer && (
          <ResultsView
            key="results"
            answer={answer}
            confidence={confidence}
            sources={sources}
            relatedQuestions={relatedQuestions}
            onCopy={copyAnswer}
            onRegenerate={handleRegenerate}
            onRelatedQuestionClick={handleRelatedQuestionClick}
          />
        )}
      </AnimatePresence>
    </div>
  );
};

export default SearchPage;
