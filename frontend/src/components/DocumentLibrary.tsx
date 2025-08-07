import React, { useState } from 'react';
import { FileText, Trash2, Calendar, Hash, Tag, ChevronDown, ChevronUp } from 'lucide-react';
import { Document } from '../App';

interface DocumentLibraryProps {
  documents: Document[];
  onDeleteDocument: (documentId: string) => void;
}

export const DocumentLibrary: React.FC<DocumentLibraryProps> = ({ 
  documents, 
  onDeleteDocument 
}) => {
  const [expandedDocuments, setExpandedDocuments] = useState<Set<string>>(new Set());
  const [sortBy, setSortBy] = useState<'date' | 'name' | 'size'>('date');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc');

  const toggleExpanded = (documentId: string) => {
    const newExpanded = new Set(expandedDocuments);
    if (newExpanded.has(documentId)) {
      newExpanded.delete(documentId);
    } else {
      newExpanded.add(documentId);
    }
    setExpandedDocuments(newExpanded);
  };

  const handleDelete = async (documentId: string, documentName: string) => {
    if (window.confirm(`Are you sure you want to delete "${documentName}"? This action cannot be undone.`)) {
      onDeleteDocument(documentId);
    }
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  const formatFileSize = (wordCount: number) => {
    if (wordCount < 1000) return `${wordCount} words`;
    if (wordCount < 1000000) return `${(wordCount / 1000).toFixed(1)}K words`;
    return `${(wordCount / 1000000).toFixed(1)}M words`;
  };

  const getFileIcon = (filename: string) => {
    const extension = filename.split('.').pop()?.toLowerCase();
    const iconClass = "h-5 w-5";
    
    switch (extension) {
      case 'pdf':
        return <FileText className={`${iconClass} text-red-500`} />;
      case 'docx':
        return <FileText className={`${iconClass} text-blue-500`} />;
      case 'txt':
        return <FileText className={`${iconClass} text-gray-500`} />;
      case 'md':
        return <FileText className={`${iconClass} text-purple-500`} />;
      default:
        return <FileText className={`${iconClass} text-gray-400`} />;
    }
  };

  const sortedDocuments = [...documents].sort((a, b) => {
    let aValue, bValue;
    
    switch (sortBy) {
      case 'name':
        aValue = a.originalName.toLowerCase();
        bValue = b.originalName.toLowerCase();
        break;
      case 'size':
        aValue = a.wordCount;
        bValue = b.wordCount;
        break;
      case 'date':
      default:
        aValue = new Date(a.uploadedAt).getTime();
        bValue = new Date(b.uploadedAt).getTime();
        break;
    }
    
    if (sortOrder === 'asc') {
      return aValue > bValue ? 1 : -1;
    } else {
      return aValue < bValue ? 1 : -1;
    }
  });

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-gray-900">Document Library</h2>
          <p className="text-gray-600 mt-1">
            {documents.length} {documents.length === 1 ? 'document' : 'documents'} in your knowledge base
          </p>
        </div>
        
        {/* Sort Controls */}
        <div className="flex items-center space-x-2">
          <label className="text-sm text-gray-700">Sort by:</label>
          <select
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value as 'date' | 'name' | 'size')}
            className="text-sm border border-gray-300 rounded-md px-2 py-1 focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            <option value="date">Date</option>
            <option value="name">Name</option>
            <option value="size">Size</option>
          </select>
          <button
            onClick={() => setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc')}
            className="text-sm text-gray-600 hover:text-gray-900"
          >
            {sortOrder === 'asc' ? '↑' : '↓'}
          </button>
        </div>
      </div>

      {/* Documents List */}
      {documents.length === 0 ? (
        <div className="text-center py-12 bg-gray-50 rounded-lg">
          <FileText className="h-12 w-12 text-gray-400 mx-auto mb-4" />
          <h3 className="text-lg font-medium text-gray-900 mb-2">No documents yet</h3>
          <p className="text-gray-600">
            Upload your first document to start building your knowledge base
          </p>
        </div>
      ) : (
        <div className="bg-white shadow-sm rounded-lg border border-gray-200 overflow-hidden">
          {sortedDocuments.map((document) => (
            <div key={document.id} className="border-b border-gray-200 last:border-b-0">
              <div className="p-4 hover:bg-gray-50">
                <div className="flex items-center justify-between">
                  <div className="flex items-center space-x-3 flex-1 min-w-0">
                    {getFileIcon(document.filename)}
                    <div className="flex-1 min-w-0">
                      <h3 className="text-sm font-medium text-gray-900 truncate">
                        {document.originalName}
                      </h3>
                      <div className="flex items-center space-x-4 mt-1 text-xs text-gray-500">
                        <div className="flex items-center">
                          <Calendar className="h-3 w-3 mr-1" />
                          {formatDate(document.uploadedAt)}
                        </div>
                        <div className="flex items-center">
                          <Hash className="h-3 w-3 mr-1" />
                          {formatFileSize(document.wordCount)}
                        </div>
                        <div className="flex items-center">
                          <Tag className="h-3 w-3 mr-1" />
                          {document.chunkCount} chunks
                        </div>
                      </div>
                    </div>
                  </div>
                  
                  <div className="flex items-center space-x-2">
                    <button
                      onClick={() => toggleExpanded(document.id)}
                      className="p-1 text-gray-400 hover:text-gray-600 rounded"
                    >
                      {expandedDocuments.has(document.id) ? (
                        <ChevronUp className="h-4 w-4" />
                      ) : (
                        <ChevronDown className="h-4 w-4" />
                      )}
                    </button>
                    <button
                      onClick={() => handleDelete(document.id, document.originalName)}
                      className="p-1 text-gray-400 hover:text-red-600 rounded"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                </div>

                {/* Expanded Content */}
                {expandedDocuments.has(document.id) && (
                  <div className="mt-4 pt-4 border-t border-gray-100">
                    {document.summary && (
                      <div className="mb-4">
                        <h4 className="text-sm font-medium text-gray-900 mb-2">Summary</h4>
                        <p className="text-sm text-gray-700 leading-relaxed">
                          {document.summary}
                        </p>
                      </div>
                    )}
                    
                    {document.topics && document.topics.length > 0 && (
                      <div className="mb-4">
                        <h4 className="text-sm font-medium text-gray-900 mb-2">Topics</h4>
                        <div className="flex flex-wrap gap-1">
                          {document.topics.map((topic, index) => (
                            <span
                              key={index}
                              className="inline-block px-2 py-1 text-xs font-medium bg-blue-100 text-blue-800 rounded-md"
                            >
                              {topic}
                            </span>
                          ))}
                        </div>
                      </div>
                    )}
                    
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                      <div>
                        <span className="font-medium text-gray-900">File Size:</span>
                        <div className="text-gray-600">{formatFileSize(document.wordCount)}</div>
                      </div>
                      <div>
                        <span className="font-medium text-gray-900">Chunks:</span>
                        <div className="text-gray-600">{document.chunkCount}</div>
                      </div>
                      <div>
                        <span className="font-medium text-gray-900">Uploaded:</span>
                        <div className="text-gray-600">{formatDate(document.uploadedAt)}</div>
                      </div>
                      <div>
                        <span className="font-medium text-gray-900">File ID:</span>
                        <div className="text-gray-600 font-mono text-xs">{document.id}</div>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};