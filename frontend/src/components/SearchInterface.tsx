import React, { useState } from 'react';
import { Search, Sparkles } from 'lucide-react';

interface SearchInterfaceProps {
  onSearch: (query: string) => void;
  isSearching: boolean;
}

export const SearchInterface: React.FC<SearchInterfaceProps> = ({ onSearch, isSearching }) => {
  const [query, setQuery] = useState('');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (query.trim() && !isSearching) {
      onSearch(query.trim());
    }
  };

  const exampleQueries = [
    "What are the main findings in the research papers?",
    "Summarize the key points about machine learning",
    "What does the document say about data privacy?",
    "Find information about project timelines",
    "What are the recommendations mentioned?"
  ];

  const handleExampleClick = (exampleQuery: string) => {
    setQuery(exampleQuery);
    onSearch(exampleQuery);
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="text-center">
        <div className="flex items-center justify-center space-x-2 mb-2">
          <Sparkles className="h-6 w-6 text-blue-600" />
          <h2 className="text-2xl font-bold text-gray-900">AI-Powered Search</h2>
        </div>
        <p className="text-gray-600">
          Ask questions about your documents and get intelligent answers
        </p>
      </div>

      {/* Search Form */}
      <div className="relative">
        <form onSubmit={handleSubmit} className="relative">
          <div className="relative">
            <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
              <Search className="h-5 w-5 text-gray-400" />
            </div>
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Ask a question about your documents..."
              disabled={isSearching}
              className="block w-full pl-10 pr-12 py-4 text-lg border border-gray-300 rounded-lg shadow-sm placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 disabled:bg-gray-100 disabled:cursor-not-allowed"
            />
            <div className="absolute inset-y-0 right-0 flex items-center">
              <button
                type="submit"
                disabled={!query.trim() || isSearching}
                className="mr-2 inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md shadow-sm text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:bg-gray-400 disabled:cursor-not-allowed"
              >
                {isSearching ? (
                  <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                ) : (
                  'Search'
                )}
              </button>
            </div>
          </div>
        </form>
      </div>

      {/* Example Queries */}
      <div className="bg-gray-50 rounded-lg p-6">
        <h3 className="text-sm font-medium text-gray-900 mb-3">
          Try these example questions:
        </h3>
        <div className="space-y-2">
          {exampleQueries.map((example, index) => (
            <button
              key={index}
              onClick={() => handleExampleClick(example)}
              disabled={isSearching}
              className="w-full text-left px-3 py-2 text-sm text-gray-700 bg-white rounded-md border border-gray-200 hover:bg-gray-50 hover:border-gray-300 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              "{example}"
            </button>
          ))}
        </div>
      </div>

      {/* Search Tips */}
      <div className="bg-blue-50 rounded-lg p-4">
        <h3 className="text-sm font-medium text-blue-900 mb-2">
          💡 Search Tips
        </h3>
        <ul className="text-sm text-blue-800 space-y-1">
          <li>• Ask specific questions for better results</li>
          <li>• Use natural language - no need for keywords</li>
          <li>• Reference topics, themes, or concepts from your documents</li>
          <li>• Ask for summaries, explanations, or comparisons</li>
        </ul>
      </div>
    </div>
  );
};