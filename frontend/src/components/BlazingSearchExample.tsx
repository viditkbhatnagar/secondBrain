/**
 * Example component demonstrating blazing-fast search
 * 
 * This shows how to use the useBlazingSearch hook for ultra-fast searches
 * with automatic caching and instant repeat queries.
 */

import React, { useState } from 'react';
import { useBlazingSearch, clearSearchCache } from '../hooks/useBlazingSearch';

export function BlazingSearchExample() {
  const [query, setQuery] = useState('');
  const { search, loading, error, response, cacheStats } = useBlazingSearch();

  const handleSearch = async () => {
    if (!query.trim()) return;
    
    try {
      await search(query, {
        maxSources: 3,
        useCache: true
      });
    } catch (err) {
      console.error('Search failed:', err);
    }
  };

  const handleClearCache = async () => {
    await clearSearchCache();
    alert('Cache cleared!');
  };

  return (
    <div className="max-w-4xl mx-auto p-6">
      <div className="bg-white rounded-lg shadow-lg p-6">
        <h2 className="text-2xl font-bold mb-4">
          🚀 Blazing Fast Search
        </h2>
        
        <p className="text-gray-600 mb-6">
          Experience sub-second search with aggressive caching. 
          Repeat queries return in &lt; 100ms!
        </p>

        {/* Search Input */}
        <div className="mb-4">
          <div className="flex gap-2">
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyPress={(e) => e.key === 'Enter' && handleSearch()}
              placeholder="Ask a question..."
              className="flex-1 px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              disabled={loading}
            />
            <button
              onClick={handleSearch}
              disabled={loading || !query.trim()}
              className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:bg-gray-400 disabled:cursor-not-allowed transition-colors"
            >
              {loading ? 'Searching...' : 'Search'}
            </button>
          </div>
        </div>

        {/* Cache Statistics */}
        <div className="mb-6 p-4 bg-gray-50 rounded-lg">
          <div className="text-sm text-gray-600">
            <strong>Cache Stats:</strong> {' '}
            Memory: {cacheStats.memoryCacheSize} entries | {' '}
            Hits: {cacheStats.totalHits} | {' '}
            {cacheStats.dbAvailable ? '✅ IndexedDB Active' : '⚠️ Memory Only'}
          </div>
          <button
            onClick={handleClearCache}
            className="mt-2 text-xs text-red-600 hover:text-red-800"
          >
            Clear Cache
          </button>
        </div>

        {/* Error Display */}
        {error && (
          <div className="mb-4 p-4 bg-red-50 border border-red-200 rounded-lg">
            <p className="text-red-800">
              <strong>Error:</strong> {error}
            </p>
          </div>
        )}

        {/* Results */}
        {response && (
          <div className="space-y-4">
            {/* Performance Metrics */}
            <div className="flex items-center gap-4 text-sm">
              <div className="flex items-center gap-2">
                <span className="font-semibold">Response Time:</span>
                <span className={`${
                  response.responseTime < 100 ? 'text-green-600' :
                  response.responseTime < 1000 ? 'text-yellow-600' :
                  'text-orange-600'
                } font-bold`}>
                  {response.responseTime}ms
                </span>
              </div>
              
              {response.cached && (
                <div className="flex items-center gap-2">
                  <span className="px-2 py-1 bg-green-100 text-green-800 rounded text-xs font-semibold">
                    ⚡ CACHED
                  </span>
                  <span className="text-gray-500 text-xs">
                    ({response.metadata.cacheLayer})
                  </span>
                </div>
              )}
              
              <div className="flex items-center gap-2">
                <span className="font-semibold">Confidence:</span>
                <span className={`${
                  response.confidence > 80 ? 'text-green-600' :
                  response.confidence > 60 ? 'text-yellow-600' :
                  'text-orange-600'
                } font-bold`}>
                  {response.confidence}%
                </span>
              </div>
            </div>

            {/* Answer */}
            <div className="p-4 bg-blue-50 border border-blue-200 rounded-lg">
              <h3 className="font-semibold text-blue-900 mb-2">Answer:</h3>
              <p className="text-gray-800 whitespace-pre-wrap">
                {response.answer}
              </p>
            </div>

            {/* Sources */}
            {response.sources.length > 0 && (
              <div>
                <h3 className="font-semibold mb-2">Sources:</h3>
                <div className="space-y-2">
                  {response.sources.map((source, idx) => (
                    <div
                      key={idx}
                      className="p-3 bg-gray-50 border border-gray-200 rounded-lg"
                    >
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-sm font-semibold text-gray-900">
                          {source.documentName}
                        </span>
                        <span className="text-xs text-gray-500">
                          Relevance: {(source.relevanceScore * 100).toFixed(1)}%
                        </span>
                      </div>
                      <p className="text-xs text-gray-600 line-clamp-2">
                        {source.content}
                      </p>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Performance Breakdown */}
            {!response.cached && response.metadata.searchTime && (
              <div className="p-4 bg-gray-50 rounded-lg">
                <h4 className="text-sm font-semibold mb-2">Performance Breakdown:</h4>
                <div className="text-xs text-gray-600 space-y-1">
                  <div className="flex justify-between">
                    <span>Search Time:</span>
                    <span className="font-mono">{response.metadata.searchTime}ms</span>
                  </div>
                  <div className="flex justify-between">
                    <span>LLM Time:</span>
                    <span className="font-mono">{response.metadata.llmTime}ms</span>
                  </div>
                  <div className="flex justify-between border-t pt-1 font-semibold">
                    <span>Total:</span>
                    <span className="font-mono">{response.responseTime}ms</span>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Example Queries */}
        <div className="mt-8 pt-6 border-t border-gray-200">
          <h3 className="text-sm font-semibold text-gray-700 mb-3">
            Try these example queries:
          </h3>
          <div className="flex flex-wrap gap-2">
            {[
              'What is this about?',
              'How do I get started?',
              'What are the main features?',
              'Tell me more'
            ].map((example) => (
              <button
                key={example}
                onClick={() => {
                  setQuery(example);
                  search(example, { maxSources: 3, useCache: true });
                }}
                className="px-3 py-1 text-sm bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-full transition-colors"
                disabled={loading}
              >
                {example}
              </button>
            ))}
          </div>
        </div>

        {/* Performance Tips */}
        <div className="mt-6 p-4 bg-yellow-50 border border-yellow-200 rounded-lg">
          <h4 className="text-sm font-semibold text-yellow-900 mb-2">
            💡 Performance Tips:
          </h4>
          <ul className="text-xs text-yellow-800 space-y-1">
            <li>• First query: ~1-2 seconds (cold start)</li>
            <li>• Repeated query: &lt; 100ms (from cache)</li>
            <li>• Cache survives page refreshes</li>
            <li>• Works offline after first load</li>
            <li>• Clear cache after uploading new documents</li>
          </ul>
        </div>
      </div>
    </div>
  );
}

