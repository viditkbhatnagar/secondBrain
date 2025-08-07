import React from 'react';
import { CheckCircle, AlertCircle, FileText, Target } from 'lucide-react';
import { SearchResult } from '../App';

interface SearchResultsProps {
  results: SearchResult;
}

export const SearchResults: React.FC<SearchResultsProps> = ({ results }) => {
  const getConfidenceColor = (confidence: number) => {
    if (confidence >= 80) return 'text-green-600 bg-green-100';
    if (confidence >= 60) return 'text-yellow-600 bg-yellow-100';
    return 'text-red-600 bg-red-100';
  };

  const getConfidenceIcon = (confidence: number) => {
    if (confidence >= 60) {
      return <CheckCircle className="h-4 w-4" />;
    }
    return <AlertCircle className="h-4 w-4" />;
  };

  const formatSimilarity = (similarity: number) => {
    return `${Math.round(similarity * 100)}%`;
  };

  // Handle error results
  if ((results as any).isError) {
    return (
      <div className="bg-red-50 border border-red-200 rounded-lg p-6">
        <div className="flex items-start">
          <AlertCircle className="h-6 w-6 text-red-600 mr-3 mt-0.5 flex-shrink-0" />
          <div>
            <h3 className="text-lg font-semibold text-red-800 mb-2">
              Search Error
            </h3>
            <div className="text-red-700 whitespace-pre-wrap">
              {results.answer}
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Main Answer */}
      <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
        <div className="flex items-start justify-between mb-4">
          <h2 className="text-xl font-semibold text-gray-900">Answer</h2>
          {!results.isError && (
            <div className={`inline-flex items-center px-2 py-1 rounded-full text-xs font-medium ${getConfidenceColor(results.confidence)}`}>
              {getConfidenceIcon(results.confidence)}
              <span className="ml-1">{results.confidence}% confidence</span>
            </div>
          )}
        </div>
        
        <div className="prose prose-gray max-w-none">
          <p className="text-gray-800 leading-relaxed whitespace-pre-wrap">
            {results.answer}
          </p>
        </div>

        {/* Sources */}
        {results.sources.length > 0 && (
          <div className="mt-6 pt-4 border-t border-gray-100">
            <h3 className="text-sm font-medium text-gray-900 mb-2">Sources:</h3>
            <div className="flex flex-wrap gap-2">
              {results.sources.map((source, index) => (
                <span
                  key={index}
                  className="inline-flex items-center px-2 py-1 rounded-md text-xs font-medium bg-blue-100 text-blue-800"
                >
                  <FileText className="h-3 w-3 mr-1" />
                  {source}
                </span>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Relevant Chunks */}
      {results.relevantChunks.length > 0 && (
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
          <div className="flex items-center mb-4">
            <Target className="h-5 w-5 text-gray-400 mr-2" />
            <h3 className="text-lg font-semibold text-gray-900">
              Relevant Content ({results.relevantChunks.length} sections found)
            </h3>
          </div>
          
          <div className="space-y-4">
            {results.relevantChunks.map((chunk, index) => (
              <div
                key={chunk.chunkId}
                className="border border-gray-200 rounded-lg p-4 hover:border-gray-300 transition-colors"
              >
                <div className="flex items-start justify-between mb-3">
                  <div className="flex items-center space-x-2">
                    <FileText className="h-4 w-4 text-gray-400" />
                    <span className="text-sm font-medium text-gray-900">
                      {chunk.documentName}
                    </span>
                  </div>
                  <div className="flex items-center space-x-2">
                    <span className="text-xs text-gray-500">
                      Relevance: {formatSimilarity(chunk.similarity)}
                    </span>
                    <div className="w-16 bg-gray-200 rounded-full h-1">
                      <div
                        className="bg-blue-600 h-1 rounded-full transition-all"
                        style={{ width: `${chunk.similarity * 100}%` }}
                      ></div>
                    </div>
                  </div>
                </div>
                
                <div className="text-sm text-gray-700 leading-relaxed">
                  {chunk.content.length > 300 
                    ? `${chunk.content.substring(0, 300)}...` 
                    : chunk.content
                  }
                </div>
                
                {chunk.content.length > 300 && (
                  <button className="mt-2 text-xs text-blue-600 hover:text-blue-800">
                    Show more
                  </button>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* No Results Message - only show if not an error and no chunks */}
      {!results.isError && results.relevantChunks.length === 0 && results.answer.includes("couldn't find") && (
        <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-6 text-center">
          <AlertCircle className="h-8 w-8 text-yellow-600 mx-auto mb-3" />
          <h3 className="text-lg font-medium text-yellow-800 mb-2">
            No Relevant Information Found
          </h3>
          <p className="text-yellow-700">
            Try rephrasing your question with different keywords, or upload more relevant documents.
          </p>
        </div>
      )}
    </div>
  );
};