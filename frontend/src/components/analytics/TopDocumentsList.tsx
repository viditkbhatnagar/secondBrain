import React, { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { FileText, Eye, Search, Loader } from 'lucide-react';
import { Card, CardHeader, CardContent } from '../ui/Card';
import { analyticsApi, TopDocument } from '../../services/analyticsApi';

interface TopDocumentsListProps {
  days: number;
}

export function TopDocumentsList({ days }: TopDocumentsListProps): JSX.Element {
  const [documents, setDocuments] = useState<TopDocument[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const fetchData = async () => {
      setIsLoading(true);
      try {
        const result = await analyticsApi.getTopDocuments(days, 10);
        setDocuments(result);
      } catch (error) {
        console.error('Failed to fetch top documents:', error);
      } finally {
        setIsLoading(false);
      }
    };

    fetchData();
  }, [days]);

  const maxViews = Math.max(...documents.map(d => d.views), 1);

  return (
    <Card className="h-full">
      <CardHeader>
        <div className="flex items-center gap-2">
          <FileText className="w-5 h-5 text-primary-500" />
          <h3 className="text-lg font-semibold text-secondary-900 dark:text-white">
            Top Documents
          </h3>
        </div>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="flex items-center justify-center h-64">
            <Loader className="w-6 h-6 text-primary-500 animate-spin" />
          </div>
        ) : documents.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-64 text-secondary-400">
            <FileText className="w-12 h-12 mb-2 opacity-50" />
            <p>No document data yet</p>
          </div>
        ) : (
          <div className="space-y-3">
            {documents.map((doc, index) => (
              <motion.div
                key={doc.documentId}
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: index * 0.05 }}
                className="group"
              >
                <div className="flex items-center justify-between mb-1">
                  <div className="flex items-center gap-2 min-w-0">
                    <span className="text-xs font-medium text-secondary-400 w-4">
                      {index + 1}
                    </span>
                    <span className="text-sm text-secondary-700 dark:text-secondary-300 truncate">
                      {doc.documentName || 'Untitled'}
                    </span>
                  </div>
                  <div className="flex items-center gap-3 text-xs text-secondary-500">
                    <div className="flex items-center gap-1">
                      <Eye className="w-3 h-3" />
                      <span>{doc.views}</span>
                    </div>
                    <div className="flex items-center gap-1">
                      <Search className="w-3 h-3" />
                      <span>{doc.searches}</span>
                    </div>
                  </div>
                </div>
                <div className="relative h-2 bg-secondary-100 dark:bg-secondary-800 rounded-full overflow-hidden">
                  <motion.div
                    initial={{ width: 0 }}
                    animate={{ width: `${(doc.views / maxViews) * 100}%` }}
                    transition={{ delay: index * 0.05 + 0.2, duration: 0.5 }}
                    className="absolute inset-y-0 left-0 bg-gradient-to-r from-primary-500 to-primary-400 rounded-full"
                  />
                </div>
              </motion.div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
