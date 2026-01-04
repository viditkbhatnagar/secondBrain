import React, { useState, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Search, Loader, Zap, CheckCircle, AlertCircle } from 'lucide-react';
import { useSearch } from '../hooks/useSearch';
import { useDebounce } from '../hooks/useDebounce';
import { Input, Button, Card } from './ui';

interface SourcePreview {
  documentName: string;
  score: number;
  preview: string;
}

export function OptimizedSearch(): JSX.Element {
  const [query, setQuery] = useState('');
  const [sources, setSources] = useState<SourcePreview[]>([]);
  
  const { search, isLoading, result, streamingText, error } = useSearch({
    streaming: true,
    onSourcesReceived: setSources,
    onToken: () => {
      // Optional: play typing sound, etc.
    }
  });

  const debouncedQuery = useDebounce(query, 300);

  const handleSearch = useCallback(() => {
    if (query.trim()) {
      search(query);
    }
  }, [query, search]);

  const handleKeyPress = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSearch();
    }
  }, [handleSearch]);

  const displayText = streamingText || result?.answer || '';

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      {/* Search Input */}
      <div className="relative">
        <div className="relative flex items-center">
          <Search className="absolute left-4 w-5 h-5 text-secondary-400" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyPress={handleKeyPress}
            placeholder="Ask anything about your documents..."
            className="w-full pl-12 pr-24 py-4 bg-white dark:bg-secondary-800 border border-secondary-200 dark:border-secondary-700 rounded-xl focus:ring-2 focus:ring-primary-500 focus:border-transparent transition-all"
          />
          <Button
            onClick={handleSearch}
            disabled={isLoading || !query.trim()}
            className="absolute right-2"
            size="sm"
          >
            {isLoading ? (
              <Loader className="w-4 h-4 animate-spin" />
            ) : (
              <Zap className="w-4 h-4" />
            )}
          </Button>
        </div>
      </div>

      {/* Sources (shown immediately) */}
      <AnimatePresence>
        {sources.length > 0 && (
          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            className="flex flex-wrap gap-2"
          >
            {sources.map((source, i) => (
              <motion.div
                key={i}
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ delay: i * 0.1 }}
                className="px-3 py-1 bg-primary-100 dark:bg-primary-900/30 rounded-full text-sm text-primary-700 dark:text-primary-300"
              >
                {source.documentName}
              </motion.div>
            ))}
          </motion.div>
        )}
      </AnimatePresence>

      {/* Response */}
      <AnimatePresence>
        {(displayText || isLoading) && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
          >
            <Card className="p-6">
              {/* Response Header */}
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-2">
                  {isLoading ? (
                    <>
                      <Loader className="w-4 h-4 animate-spin text-primary-500" />
                      <span className="text-sm text-secondary-500">Generating...</span>
                    </>
                  ) : result && (
                    <>
                      <CheckCircle className="w-4 h-4 text-success-500" />
                      <span className="text-sm text-secondary-500">
                        {result.responseTime}ms
                      </span>
                      {result.cached && (
                        <span className="px-2 py-0.5 bg-success-100 text-success-700 rounded text-xs">
                          Cached
                        </span>
                      )}
                    </>
                  )}
                </div>
                {result && (
                  <div className="flex items-center gap-1">
                    <Zap className="w-4 h-4 text-warning-500" />
                    <span className="text-sm text-secondary-500">
                      {Math.round(result.confidence * 100)}% confidence
                    </span>
                  </div>
                )}
              </div>

              {/* Response Text */}
              <div className="prose dark:prose-invert max-w-none">
                {displayText}
                {isLoading && (
                  <motion.span
                    animate={{ opacity: [0, 1, 0] }}
                    transition={{ repeat: Infinity, duration: 1 }}
                    className="inline-block w-2 h-5 bg-primary-500 ml-1"
                  />
                )}
              </div>
            </Card>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Error */}
      {error && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="p-4 bg-danger-100 dark:bg-danger-900/30 text-danger-700 dark:text-danger-300 rounded-lg flex items-center gap-2"
        >
          <AlertCircle className="w-5 h-5" />
          {error.message}
        </motion.div>
      )}
    </div>
  );
}
