import React, { useState, useEffect } from 'react';
import { FileUpload } from './components/FileUpload';
import { SearchInterface } from './components/SearchInterface';
import { DocumentLibrary } from './components/DocumentLibrary';
import { SearchResults } from './components/SearchResults';
import { Brain, Search, Library, Upload, Menu, MessageSquare } from 'lucide-react';
import { API_ENDPOINTS } from './config/api';
import './App.css';
import RightSidebar from './components/RightSidebar';
import Chat from './components/Chat';
import HashListener from './components/HashListener';

export interface Document {
  id: string;
  filename: string;
  originalName: string;
  uploadedAt: string;
  wordCount: number;
  chunkCount: number;
  summary?: string;
  topics?: string[];
  fileSize?: number;
}

export interface SearchResult {
  answer: string;
  relevantChunks: Array<{
    content: string;
    documentName: string;
    documentId: string;
    chunkId: string;
    similarity: number;
  }>;
  confidence: number;
  sources: string[];
  isError?: boolean;
  metadata?: {
    strategy?: 'hybrid' | 'vector';
    rerankUsed?: boolean;
    rerankModel?: string;
  };
}

type ActiveTab = 'upload' | 'search' | 'library' | 'chat';

function App() {
  const [activeTab, setActiveTab] = useState<ActiveTab>('upload');
  const [documents, setDocuments] = useState<Document[]>([]);
  const [searchResults, setSearchResults] = useState<SearchResult | null>(null);
  const [isSearching, setIsSearching] = useState(false);
  const [stats, setStats] = useState({ totalDocuments: 0, totalChunks: 0 });
  const [recentSearches, setRecentSearches] = useState<Array<{ query: string; timestamp: string }>>([]);
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);

  // Load documents and stats on component mount
  useEffect(() => {
    loadDocuments();
    loadStats();
    loadRecentSearches();
  }, []);

  const loadDocuments = async () => {
    try {
      const response = await fetch(API_ENDPOINTS.documents);
      if (response.ok) {
        const docs = await response.json();
        setDocuments(docs);
      }
    } catch (error) {
      console.error('Error loading documents:', error);
    }
  };

  const loadStats = async () => {
    try {
      const response = await fetch(API_ENDPOINTS.documentsStats);
      if (response.ok) {
        const statsData = await response.json();
        setStats(statsData);
      }
    } catch (error) {
      console.error('Error loading stats:', error);
    }
  };

  const loadRecentSearches = async () => {
    try {
      const response = await fetch(API_ENDPOINTS.searchRecent);
      if (response.ok) {
        const data = await response.json();
        const recent = (data.recent || []).map((item: any) => ({
          query: item.query,
          timestamp: item.timestamp,
        }));
        setRecentSearches(recent);
      }
    } catch (error) {
      console.error('Error loading recent searches:', error);
    }
  };

  const handleFileUploaded = (newDocument: Document) => {
    setDocuments(prev => [newDocument, ...prev]);
    setStats(prev => ({
      totalDocuments: prev.totalDocuments + 1,
      totalChunks: prev.totalChunks + newDocument.chunkCount
    }));
    
    // Switch to library tab to show the uploaded document
    setActiveTab('library');
  };

  const handleSearch = async (query: string, strategy: 'vector' | 'hybrid' = 'hybrid', rerank: boolean = true) => {
    setIsSearching(true);
    setSearchResults(null);
    
    try {
      const response = await fetch(API_ENDPOINTS.search, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ query, strategy, rerank }),
      });
      
      const results = await response.json();
      
      if (response.ok) {
        setSearchResults(results);
        // Refresh recent searches after a successful search
        loadRecentSearches();
      } else {
        // Handle specific error responses from backend
        const errorMessage = results.message || results.error || 'Search failed';
        console.error('Search failed:', errorMessage);
        
        // Set error state with specific message
        setSearchResults({
          answer: getSearchErrorMessage(results),
          relevantChunks: [],
          confidence: 0,
          sources: [],
          isError: true
        });
      }
    } catch (error: any) {
      console.error('Error during search:', error);
      setSearchResults({
        answer: 'Network error occurred. Please check your connection and try again.',
        relevantChunks: [],
        confidence: 0,
        sources: [],
        isError: true
      });
    } finally {
      setIsSearching(false);
    }
  };

  const getSearchErrorMessage = (errorResult: any): string => {
    const message = errorResult.message || '';
    const code = errorResult.code || '';
    
    if (code === 'NO_DOCUMENTS') {
      return '📁 No documents found. Please upload some documents first before searching.';
    } else if (code === 'INVALID_QUERY' || code === 'QUERY_TOO_SHORT') {
      return '❓ Please enter a valid search question (at least 3 characters).';
    } else if (code === 'QUERY_TOO_LONG') {
      return '📝 Your question is too long. Please limit it to 1000 characters.';
    } else if (message.includes('Configuration Error') || message.includes('authentication')) {
      return '⚙️ Service configuration error. Please contact the administrator.';
    } else if (message.includes('rate limit')) {
      return '⏱️ Service is temporarily busy. Please try again in a few minutes.';
    } else if (message.includes('credits') || message.includes('quota')) {
      return '💳 Service quota exceeded. Please contact the administrator to add credits.';
    } else {
      return `❌ Search failed: ${message}`;
    }
  };

  const handleDeleteDocument = async (documentId: string) => {
    try {
      const response = await fetch(`${API_ENDPOINTS.documents}/${documentId}`, {
        method: 'DELETE',
      });
      
      if (response.ok) {
        setDocuments(prev => prev.filter(doc => doc.id !== documentId));
        loadStats(); // Refresh stats
      }
    } catch (error) {
      console.error('Error deleting document:', error);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white shadow-sm border-b">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">
            <div className="flex items-center space-x-3">
              <Brain className="h-8 w-8 text-blue-600" />
              <h1 className="text-2xl font-bold text-gray-900">
                Personal Knowledge Base
              </h1>
            </div>
            
            <div className="flex items-center space-x-6 text-sm text-gray-600">
              <span>{stats.totalDocuments} documents</span>
              <span>{stats.totalChunks} chunks</span>
              <button
                onClick={() => setIsSidebarOpen(true)}
                className="p-2 rounded hover:bg-gray-100"
                title="Open guide"
              >
                <Menu className="h-5 w-5" />
              </button>
            </div>
          </div>
        </div>
      </header>

      {/* Navigation */}
      <nav className="bg-white border-b">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex space-x-8">
            <button
              onClick={() => setActiveTab('upload')}
              className={`py-4 px-2 border-b-2 font-medium text-sm flex items-center space-x-2 ${
                activeTab === 'upload'
                  ? 'border-blue-500 text-blue-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
              }`}
            >
              <Upload className="h-4 w-4" />
              <span>Upload</span>
            </button>
            
            <button
              onClick={() => setActiveTab('search')}
              className={`py-4 px-2 border-b-2 font-medium text-sm flex items-center space-x-2 ${
                activeTab === 'search'
                  ? 'border-blue-500 text-blue-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
              }`}
            >
              <Search className="h-4 w-4" />
              <span>Search</span>
            </button>
            <button
              onClick={() => setActiveTab('chat')}
              className={`py-4 px-2 border-b-2 font-medium text-sm flex items-center space-x-2 ${
                activeTab === 'chat'
                  ? 'border-blue-500 text-blue-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
              }`}
            >
              <MessageSquare className="h-4 w-4" />
              <span>Chat</span>
            </button>
            
            <button
              onClick={() => setActiveTab('library')}
              className={`py-4 px-2 border-b-2 font-medium text-sm flex items-center space-x-2 ${
                activeTab === 'library'
                  ? 'border-blue-500 text-blue-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
              }`}
            >
              <Library className="h-4 w-4" />
              <span>Library</span>
            </button>
          </div>
        </div>
      </nav>

      {/* Main Content */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Hash anchor listener for deep-linking from AgentTrace */}
        <HashListener />
        {activeTab === 'upload' && (
          <div className="max-w-2xl mx-auto">
            <FileUpload onFileUploaded={handleFileUploaded} />
          </div>
        )}
        
        {activeTab === 'search' && (
          <div className="space-y-6">
            <div className="max-w-2xl mx-auto">
              <SearchInterface 
                onSearch={handleSearch} 
                isSearching={isSearching} 
              />
            </div>

            {/* Recent Searches */}
            {recentSearches.length > 0 && (
              <div className="max-w-2xl mx-auto bg-white rounded-lg border border-gray-200 p-4">
                <h3 className="text-sm font-medium text-gray-900 mb-2">Recent Searches</h3>
                <div className="flex flex-wrap gap-2">
                  {recentSearches.map((s, idx) => (
                    <button
                      key={`${s.query}-${idx}`}
                      onClick={() => handleSearch(s.query)}
                      className="px-2 py-1 text-xs rounded-md bg-gray-100 text-gray-800 hover:bg-gray-200"
                    >
                      {s.query}
                    </button>
                  ))}
                </div>
              </div>
            )}
            
            {searchResults && (
              <SearchResults results={searchResults} />
            )}
            
            {isSearching && (
              <div className="flex items-center justify-center py-12">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
                <span className="ml-3 text-gray-600">Searching your knowledge base...</span>
              </div>
            )}
          </div>
        )}
        
        {activeTab === 'library' && (
          <DocumentLibrary 
            documents={documents} 
            onDeleteDocument={handleDeleteDocument}
          />
        )}

        {activeTab === 'chat' && (
          <Chat />
        )}
      </main>

      <RightSidebar isOpen={isSidebarOpen} onClose={() => setIsSidebarOpen(false)} />
    </div>
  );
}

export default App;