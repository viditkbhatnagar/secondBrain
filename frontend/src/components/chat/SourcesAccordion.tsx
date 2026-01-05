import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { FileText, ChevronDown } from 'lucide-react';
import { SourceInfo } from './types';
import { Badge, Progress } from '../ui';

interface SourcesAccordionProps {
  sources: SourceInfo[];
  confidence: number;
}

export const SourcesAccordion: React.FC<SourcesAccordionProps> = ({
  sources,
  confidence,
}) => {
  const [isExpanded, setIsExpanded] = useState(false);

  if (!sources || sources.length === 0) return null;

  const getConfidenceVariant = () => {
    if (confidence >= 70) return 'success';
    if (confidence >= 50) return 'warning';
    return 'danger';
  };

  const getConfidenceLabel = () => {
    if (confidence >= 80) return 'High confidence';
    if (confidence >= 60) return 'Good confidence';
    if (confidence >= 40) return 'Moderate confidence';
    return 'Low confidence';
  };

  return (
    <div className="mt-4 border border-secondary-200 dark:border-secondary-700 rounded-xl overflow-hidden">
      {/* Header */}
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className="w-full px-4 py-3 flex items-center justify-between bg-secondary-50 dark:bg-secondary-800/50 hover:bg-secondary-100 dark:hover:bg-secondary-800 transition-colors"
      >
        <div className="flex items-center gap-3">
          <div className="p-1.5 rounded-lg bg-primary-100 dark:bg-primary-900/30">
            <FileText className="w-4 h-4 text-primary-600 dark:text-primary-400" />
          </div>
          <span className="text-sm font-medium text-secondary-700 dark:text-secondary-300">
            {sources.length} source{sources.length !== 1 ? 's' : ''} used
          </span>
          <Badge variant={getConfidenceVariant()} size="sm">
            {confidence}% • {getConfidenceLabel()}
          </Badge>
        </div>
        <motion.div
          animate={{ rotate: isExpanded ? 180 : 0 }}
          transition={{ duration: 0.2 }}
        >
          <ChevronDown className="w-4 h-4 text-secondary-500" />
        </motion.div>
      </button>

      {/* Content */}
      <AnimatePresence>
        {isExpanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="overflow-hidden"
          >
            <div className="p-4 space-y-3 bg-white dark:bg-secondary-900">
              {sources.map((source, idx) => (
                <motion.div
                  key={idx}
                  initial={{ opacity: 0, x: -10 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: idx * 0.05 }}
                  className="p-3 bg-secondary-50 dark:bg-secondary-800 rounded-lg border border-secondary-200 dark:border-secondary-700"
                >
                  <div className="flex items-start justify-between gap-2 mb-2">
                    <div className="flex items-center gap-2 min-w-0">
                      <span className="flex-shrink-0 w-5 h-5 rounded-full bg-primary-100 dark:bg-primary-900/30 text-primary-600 dark:text-primary-400 text-xs font-medium flex items-center justify-center">
                        {idx + 1}
                      </span>
                      <span className="text-sm font-medium text-secondary-800 dark:text-secondary-200 truncate">
                        {source.documentName}
                      </span>
                    </div>
                    <Badge
                      variant={(source.relevance || source.similarity || 0) >= 0.7 ? 'success' : (source.relevance || source.similarity || 0) >= 0.5 ? 'warning' : 'secondary'}
                      size="sm"
                    >
                      {Math.round((source.relevance || source.similarity || 0.75) * 100)}%
                    </Badge>
                  </div>

                  {source.snippet && (
                    <p className="text-xs text-secondary-600 dark:text-secondary-400 line-clamp-2 italic mb-2 pl-7">
                      "{source.snippet}"
                    </p>
                  )}

                  <div className="pl-7">
                    <Progress
                      value={(source.relevance || source.similarity || 0.75) * 100}
                      variant={(source.relevance || source.similarity || 0) >= 0.7 ? 'success' : (source.relevance || source.similarity || 0) >= 0.5 ? 'warning' : 'primary'}
                      size="sm"
                    />
                  </div>
                </motion.div>
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

export default SourcesAccordion;
