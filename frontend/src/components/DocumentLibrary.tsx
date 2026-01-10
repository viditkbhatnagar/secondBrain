import React, { useState, useRef, useMemo, useCallback, memo, useEffect } from 'react';
import { useVirtualizer } from '@tanstack/react-virtual';
import { FileText, Trash2, Calendar, Hash, Tag, ChevronDown, ChevronUp, FolderOpen, Folder, LayoutGrid, List } from 'lucide-react';
import { Document } from '../App';
import { Card, Badge, EmptyState } from './ui';
import { API_ENDPOINTS } from '../config/api';

interface CategoryGroup {
  name: string;
  displayName: string;
  description: string;
  keywords: string[];
  count: number;
  documents: Document[];
}

interface DocumentLibraryProps {
  documents: Document[];
  onDeleteDocument: (documentId: string) => void;
}

// Memoized document row component
const DocumentRow = memo(({ 
  document, 
  isExpanded, 
  onToggleExpand, 
  onDelete,
  formatDate,
  formatWordCount,
  formatBytes,
  getFileIcon
}: {
  document: Document;
  isExpanded: boolean;
  onToggleExpand: () => void;
  onDelete: () => void;
  formatDate: (date: string) => string;
  formatWordCount: (count: number) => string;
  formatBytes: (bytes?: number) => string;
  getFileIcon: (filename: string) => React.ReactNode;
}) => (
  <div className="border-b border-secondary-200 dark:border-secondary-700 last:border-b-0">
    <div className="p-4 hover:bg-secondary-50 dark:hover:bg-secondary-800/50 transition-colors">
      <div className="flex items-center justify-between">
        <div className="flex items-center space-x-3 flex-1 min-w-0">
          {getFileIcon(document.filename)}
          <div className="flex-1 min-w-0">
            <h3 className="text-sm font-medium text-secondary-900 dark:text-secondary-100 truncate">
              {document.originalName}
            </h3>
            <div className="flex items-center space-x-4 mt-1 text-xs text-secondary-500 dark:text-secondary-400">
              <div className="flex items-center">
                <Calendar className="h-3 w-3 mr-1" />
                {formatDate(document.uploadedAt)}
              </div>
              <div className="flex items-center">
                <Hash className="h-3 w-3 mr-1" />
                {formatWordCount(document.wordCount)}
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
            onClick={onToggleExpand}
            className="p-1 text-secondary-400 dark:text-secondary-500 hover:text-secondary-600 dark:hover:text-secondary-300 rounded transition-colors"
          >
            {isExpanded ? (
              <ChevronUp className="h-4 w-4" />
            ) : (
              <ChevronDown className="h-4 w-4" />
            )}
          </button>
          <button
            onClick={onDelete}
            className="p-1 text-secondary-400 dark:text-secondary-500 hover:text-danger-600 dark:hover:text-danger-400 rounded transition-colors"
          >
            <Trash2 className="h-4 w-4" />
          </button>
        </div>
      </div>

      {/* Expanded Content */}
      {isExpanded && (
        <div className="mt-4 pt-4 border-t border-secondary-100 dark:border-secondary-700">
          {document.summary && (
            <div className="mb-4">
              <h4 className="text-sm font-medium text-secondary-900 dark:text-secondary-100 mb-2">Summary</h4>
              <p className="text-sm text-secondary-700 dark:text-secondary-300 leading-relaxed">
                {document.summary}
              </p>
            </div>
          )}
          
          {document.topics && document.topics.length > 0 && (
            <div className="mb-4">
              <h4 className="text-sm font-medium text-secondary-900 dark:text-secondary-100 mb-2">Topics</h4>
              <div className="flex flex-wrap gap-1">
                {document.topics.map((topic, index) => (
                  <Badge key={index} variant="primary" size="sm">
                    {topic}
                  </Badge>
                ))}
              </div>
            </div>
          )}
          
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
            <div>
              <span className="font-medium text-secondary-900 dark:text-secondary-100">Word Count:</span>
              <div className="text-secondary-600 dark:text-secondary-400">{formatWordCount(document.wordCount)}</div>
            </div>
            <div>
              <span className="font-medium text-secondary-900 dark:text-secondary-100">File Size:</span>
              <div className="text-secondary-600 dark:text-secondary-400">{formatBytes((document as any).fileSize)}</div>
            </div>
            <div>
              <span className="font-medium text-secondary-900 dark:text-secondary-100">Chunks:</span>
              <div className="text-secondary-600 dark:text-secondary-400">{document.chunkCount}</div>
            </div>
            <div>
              <span className="font-medium text-secondary-900 dark:text-secondary-100">Uploaded:</span>
              <div className="text-secondary-600 dark:text-secondary-400">{formatDate(document.uploadedAt)}</div>
            </div>
            <div>
              <span className="font-medium text-secondary-900 dark:text-secondary-100">File ID:</span>
              <div className="text-secondary-600 dark:text-secondary-400 font-mono text-xs">{document.id}</div>
            </div>
          </div>
        </div>
      )}
    </div>
  </div>
));

DocumentRow.displayName = 'DocumentRow';

// Category section component
const CategorySection = memo(({
  category,
  isExpanded,
  onToggle,
  onDeleteDocument,
  expandedDocuments,
  onToggleDocument,
  formatDate,
  formatWordCount,
  formatBytes,
  getFileIcon
}: {
  category: CategoryGroup;
  isExpanded: boolean;
  onToggle: () => void;
  onDeleteDocument: (id: string, name: string) => void;
  expandedDocuments: Set<string>;
  onToggleDocument: (id: string) => void;
  formatDate: (date: string) => string;
  formatWordCount: (count: number) => string;
  formatBytes: (bytes?: number) => string;
  getFileIcon: (filename: string) => React.ReactNode;
}) => (
  <div className="mb-4">
    <button
      onClick={onToggle}
      className="w-full flex items-center justify-between p-4 bg-gradient-to-r from-primary-50 to-accent-50 dark:from-primary-900/20 dark:to-accent-900/20 rounded-lg hover:from-primary-100 hover:to-accent-100 dark:hover:from-primary-900/30 dark:hover:to-accent-900/30 transition-colors"
    >
      <div className="flex items-center gap-3">
        {isExpanded ? (
          <FolderOpen className="h-5 w-5 text-primary-600 dark:text-primary-400" />
        ) : (
          <Folder className="h-5 w-5 text-primary-600 dark:text-primary-400" />
        )}
        <div className="text-left">
          <h3 className="text-sm font-semibold text-secondary-900 dark:text-secondary-100 capitalize">
            {category.displayName}
          </h3>
          {category.description && (
            <p className="text-xs text-secondary-500 dark:text-secondary-400 mt-0.5 line-clamp-1">
              {category.description}
            </p>
          )}
        </div>
      </div>
      <div className="flex items-center gap-3">
        <Badge variant="primary" size="sm">
          {category.count} {category.count === 1 ? 'doc' : 'docs'}
        </Badge>
        {isExpanded ? (
          <ChevronUp className="h-4 w-4 text-secondary-400" />
        ) : (
          <ChevronDown className="h-4 w-4 text-secondary-400" />
        )}
      </div>
    </button>

    {isExpanded && (
      <Card variant="outlined" padding="none" className="mt-2 ml-4 border-l-2 border-primary-200 dark:border-primary-700">
        {category.documents.map((document) => (
          <DocumentRow
            key={document.id}
            document={document}
            isExpanded={expandedDocuments.has(document.id)}
            onToggleExpand={() => onToggleDocument(document.id)}
            onDelete={() => onDeleteDocument(document.id, document.originalName)}
            formatDate={formatDate}
            formatWordCount={formatWordCount}
            formatBytes={formatBytes}
            getFileIcon={getFileIcon}
          />
        ))}
      </Card>
    )}
  </div>
));

CategorySection.displayName = 'CategorySection';

export const DocumentLibrary: React.FC<DocumentLibraryProps> = ({
  documents,
  onDeleteDocument
}) => {
  const [expandedDocuments, setExpandedDocuments] = useState<Set<string>>(new Set());
  const [expandedCategories, setExpandedCategories] = useState<Set<string>>(new Set(['uncategorized']));
  const [sortBy, setSortBy] = useState<'date' | 'name' | 'size'>('date');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc');
  const [viewMode, setViewMode] = useState<'category' | 'list'>('category');
  const [categoryGroups, setCategoryGroups] = useState<CategoryGroup[]>([]);
  const [loading, setLoading] = useState(false);
  const parentRef = useRef<HTMLDivElement>(null);

  // Fetch documents by category
  useEffect(() => {
    const fetchByCategory = async () => {
      if (viewMode !== 'category') return;
      setLoading(true);
      try {
        const res = await fetch(`${API_ENDPOINTS.documents}/by-category`);
        const data = await res.json();
        if (data.success && data.categories) {
          setCategoryGroups(data.categories);
          // Auto-expand first category
          if (data.categories.length > 0) {
            setExpandedCategories(new Set([data.categories[0].name]));
          }
        }
      } catch (error) {
        console.error('Failed to fetch categories:', error);
      } finally {
        setLoading(false);
      }
    };
    fetchByCategory();
  }, [viewMode, documents.length]); // Re-fetch when documents change

  const toggleCategory = useCallback((categoryName: string) => {
    setExpandedCategories(prev => {
      const newExpanded = new Set(prev);
      if (newExpanded.has(categoryName)) {
        newExpanded.delete(categoryName);
      } else {
        newExpanded.add(categoryName);
      }
      return newExpanded;
    });
  }, []);

  const toggleExpanded = useCallback((documentId: string) => {
    setExpandedDocuments(prev => {
      const newExpanded = new Set(prev);
      if (newExpanded.has(documentId)) {
        newExpanded.delete(documentId);
      } else {
        newExpanded.add(documentId);
      }
      return newExpanded;
    });
  }, []);

  const handleDelete = useCallback((documentId: string, documentName: string) => {
    if (window.confirm(`Are you sure you want to delete "${documentName}"? This action cannot be undone.`)) {
      onDeleteDocument(documentId);
    }
  }, [onDeleteDocument]);

  const formatDate = useCallback((dateString: string) => {
    return new Date(dateString).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  }, []);

  const formatWordCount = useCallback((wordCount: number) => {
    if (wordCount < 1000) return `${wordCount} words`;
    if (wordCount < 1000000) return `${(wordCount / 1000).toFixed(1)}K words`;
    return `${(wordCount / 1000000).toFixed(1)}M words`;
  }, []);

  const formatBytes = useCallback((bytes?: number) => {
    if (!bytes && bytes !== 0) return '—';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return `${parseFloat((bytes / Math.pow(k, i)).toFixed(2))} ${sizes[i]}`;
  }, []);

  const getFileIcon = useCallback((filename: string) => {
    const extension = (filename || '').split('.').pop()?.toLowerCase();
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
  }, []);

  const sortedDocuments = useMemo(() => {
    return [...documents].sort((a, b) => {
      let aValue: string | number, bValue: string | number;
      
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
  }, [documents, sortBy, sortOrder]);

  // Use virtual scrolling for lists > 50 items
  const useVirtual = sortedDocuments.length > 50;
  
  const rowVirtualizer = useVirtualizer({
    count: sortedDocuments.length,
    getScrollElement: () => parentRef.current,
    estimateSize: useCallback((index: number) => {
      // Estimate row height based on whether it's expanded
      const doc = sortedDocuments[index];
      return expandedDocuments.has(doc?.id) ? 280 : 80;
    }, [sortedDocuments, expandedDocuments]),
    overscan: 5,
    enabled: useVirtual
  });

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <h2 className="text-2xl font-bold text-secondary-900 dark:text-secondary-100">Document Library</h2>
          <p className="text-secondary-600 dark:text-secondary-400 mt-1">
            {documents.length} {documents.length === 1 ? 'document' : 'documents'} in {categoryGroups.length} {categoryGroups.length === 1 ? 'category' : 'categories'}
          </p>
        </div>

        {/* View Mode & Sort Controls */}
        <div className="flex items-center space-x-4">
          {/* View Mode Toggle */}
          <div className="flex items-center bg-secondary-100 dark:bg-secondary-800 rounded-lg p-1">
            <button
              onClick={() => setViewMode('category')}
              className={`p-2 rounded-md transition-colors ${
                viewMode === 'category'
                  ? 'bg-white dark:bg-secondary-700 text-primary-600 shadow-sm'
                  : 'text-secondary-500 hover:text-secondary-700'
              }`}
              title="Category View"
            >
              <LayoutGrid className="h-4 w-4" />
            </button>
            <button
              onClick={() => setViewMode('list')}
              className={`p-2 rounded-md transition-colors ${
                viewMode === 'list'
                  ? 'bg-white dark:bg-secondary-700 text-primary-600 shadow-sm'
                  : 'text-secondary-500 hover:text-secondary-700'
              }`}
              title="List View"
            >
              <List className="h-4 w-4" />
            </button>
          </div>

          {/* Sort Controls (only in list view) */}
          {viewMode === 'list' && (
            <div className="flex items-center space-x-2">
              <label className="text-sm text-secondary-700 dark:text-secondary-300">Sort:</label>
              <select
                value={sortBy}
                onChange={(e) => setSortBy(e.target.value as 'date' | 'name' | 'size')}
                className="text-sm border border-secondary-300 dark:border-secondary-600 rounded-md px-2 py-1 bg-white dark:bg-secondary-800 text-secondary-900 dark:text-secondary-100 focus:outline-none focus:ring-2 focus:ring-primary-500"
              >
                <option value="date">Date</option>
                <option value="name">Name</option>
                <option value="size">Size</option>
              </select>
              <button
                onClick={() => setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc')}
                className="text-sm text-secondary-600 dark:text-secondary-400 hover:text-secondary-900 dark:hover:text-secondary-100"
              >
                {sortOrder === 'asc' ? '↑' : '↓'}
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Category View */}
      {viewMode === 'category' && (
        <div className="space-y-2">
          {loading ? (
            <div className="text-center py-8 text-secondary-500">Loading categories...</div>
          ) : categoryGroups.length === 0 ? (
            <EmptyState
              icon={<Folder className="h-12 w-12" />}
              title="No categories yet"
              description="Upload documents to automatically categorize them"
            />
          ) : (
            categoryGroups.map((category) => (
              <CategorySection
                key={category.name}
                category={category}
                isExpanded={expandedCategories.has(category.name)}
                onToggle={() => toggleCategory(category.name)}
                onDeleteDocument={handleDelete}
                expandedDocuments={expandedDocuments}
                onToggleDocument={toggleExpanded}
                formatDate={formatDate}
                formatWordCount={formatWordCount}
                formatBytes={formatBytes}
                getFileIcon={getFileIcon}
              />
            ))
          )}
        </div>
      )}

      {/* List View */}
      {viewMode === 'list' && (
        documents.length === 0 ? (
          <EmptyState
            icon={<FileText className="h-12 w-12" />}
            title="No documents yet"
            description="Upload your first document to start building your knowledge base"
          />
        ) : useVirtual ? (
        // Virtual scrolling for large lists
        <Card variant="outlined" padding="none">
          <div
            ref={parentRef}
            className="max-h-[600px] overflow-auto"
          >
            <div
              style={{
                height: `${rowVirtualizer.getTotalSize()}px`,
                width: '100%',
                position: 'relative',
              }}
            >
              {rowVirtualizer.getVirtualItems().map((virtualRow) => {
                const document = sortedDocuments[virtualRow.index];
                return (
                  <div
                    key={document.id}
                    style={{
                      position: 'absolute',
                      top: 0,
                      left: 0,
                      width: '100%',
                      transform: `translateY(${virtualRow.start}px)`,
                    }}
                  >
                    <DocumentRow
                      document={document}
                      isExpanded={expandedDocuments.has(document.id)}
                      onToggleExpand={() => toggleExpanded(document.id)}
                      onDelete={() => handleDelete(document.id, document.originalName)}
                      formatDate={formatDate}
                      formatWordCount={formatWordCount}
                      formatBytes={formatBytes}
                      getFileIcon={getFileIcon}
                    />
                  </div>
                );
              })}
            </div>
          </div>
        </Card>
      ) : (
        // Regular rendering for small lists
        <Card variant="outlined" padding="none">
          {sortedDocuments.map((document) => (
            <DocumentRow
              key={document.id}
              document={document}
              isExpanded={expandedDocuments.has(document.id)}
              onToggleExpand={() => toggleExpanded(document.id)}
              onDelete={() => handleDelete(document.id, document.originalName)}
              formatDate={formatDate}
              formatWordCount={formatWordCount}
              formatBytes={formatBytes}
              getFileIcon={getFileIcon}
            />
          ))}
        </Card>
        )
      )}
    </div>
  );
};