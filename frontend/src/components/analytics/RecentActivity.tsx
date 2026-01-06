import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { formatDistanceToNow } from 'date-fns';
import { Upload, Clock, FileText, ChevronRight } from 'lucide-react';
import { Card, CardHeader, CardContent } from '../ui/Card';
import { API_ENDPOINTS } from '../../config/api';

interface Document {
  id: string;
  filename: string;
  originalName: string;
  uploadedAt: string;
  wordCount: number;
  chunkCount: number;
  fileSize?: number;
}

export function RecentActivity(): JSX.Element {
  const [documents, setDocuments] = useState<Document[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    let mounted = true;
    
    const fetchDocuments = async () => {
      try {
        const response = await fetch(API_ENDPOINTS.documents);
        if (response.ok) {
          const data = await response.json();
          if (mounted) {
            // Sort by upload date (newest first)
            const sorted = [...data].sort((a, b) => 
              new Date(b.uploadedAt).getTime() - new Date(a.uploadedAt).getTime()
            );
            setDocuments(sorted);
          }
        }
      } catch (error) {
        console.error('Failed to fetch documents:', error);
      } finally {
        if (mounted) {
          setIsLoading(false);
        }
      }
    };

    fetchDocuments();
    // Refresh every 60 seconds
    const interval = setInterval(fetchDocuments, 60000);
    return () => {
      mounted = false;
      clearInterval(interval);
    };
  }, []);

  const formatFileSize = (bytes?: number): string => {
    if (!bytes) return 'N/A';
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  return (
    <Card className="h-full">
      <CardHeader>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Upload className="w-5 h-5 text-warning-500" />
            <h3 className="text-lg font-semibold text-secondary-900 dark:text-white">
              Recent Uploads
            </h3>
          </div>
          <span className="text-xs text-secondary-400">{documents.length} documents</span>
        </div>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="space-y-3">
            {[1, 2, 3, 4, 5].map(i => (
              <div key={i} className="animate-pulse flex items-center gap-3">
                <div className="w-8 h-8 bg-secondary-200 dark:bg-secondary-700 rounded-lg" />
                <div className="flex-1">
                  <div className="h-3 bg-secondary-200 dark:bg-secondary-700 rounded w-3/4 mb-1" />
                  <div className="h-2 bg-secondary-200 dark:bg-secondary-700 rounded w-1/4" />
                </div>
              </div>
            ))}
          </div>
        ) : documents.length === 0 ? (
          <div className="text-center py-8 text-secondary-400">
            <FileText className="w-12 h-12 mx-auto mb-2 opacity-50" />
            <p>No documents uploaded yet</p>
          </div>
        ) : (
          <div className="space-y-2 max-h-[400px] overflow-y-auto pr-2">
            <AnimatePresence mode="popLayout">
              {documents.map((doc, index) => (
                <motion.div
                  key={doc.id}
                  initial={{ opacity: 0, x: -20 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: 20 }}
                  transition={{ delay: Math.min(index * 0.03, 0.3) }}
                  className="flex items-center gap-3 p-3 rounded-lg hover:bg-secondary-50 dark:hover:bg-secondary-800/50 transition-colors group border border-transparent hover:border-secondary-200 dark:hover:border-secondary-700"
                >
                  <div className="w-10 h-10 rounded-lg bg-warning-100 dark:bg-warning-900/30 flex items-center justify-center flex-shrink-0">
                    <FileText className="w-5 h-5 text-warning-600 dark:text-warning-400" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-secondary-900 dark:text-secondary-100 truncate">
                      {doc.originalName}
                    </p>
                    <div className="flex items-center gap-2 mt-1">
                      <p className="text-xs text-secondary-400">
                        {formatDistanceToNow(new Date(doc.uploadedAt), { addSuffix: true })}
                      </p>
                      <span className="text-xs text-secondary-300">•</span>
                      <p className="text-xs text-secondary-400">
                        {formatFileSize(doc.fileSize)}
                      </p>
                      <span className="text-xs text-secondary-300">•</span>
                      <p className="text-xs text-secondary-400">
                        {doc.chunkCount} chunks
                      </p>
                    </div>
                  </div>
                  <ChevronRight className="w-4 h-4 text-secondary-300 opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0" />
                </motion.div>
              ))}
            </AnimatePresence>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
