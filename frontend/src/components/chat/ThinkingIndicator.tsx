import React, { useEffect } from 'react';
import { motion } from 'framer-motion';
import { Brain, Search, FileText, Sparkles, Bot } from 'lucide-react';
import { ThinkingStage } from './types';
import { Progress, LoadingDots } from '../ui';

interface ThinkingIndicatorProps {
  stage: ThinkingStage;
  documentCount?: number;
  foundCount?: number;
  smartSearch?: {
    enabled: boolean;
    categories: string[];
    searchedDocs: number;
    totalDocs: number;
    chunksFound: number;
    reasoning?: string;
    confidence?: number;
    timings?: number;
  };
}

const stages = [
  {
    key: 'understanding',
    icon: Brain,
    text: 'Understanding your question...',
    color: 'text-accent-500',
    bgColor: 'bg-accent-100 dark:bg-accent-900/30',
  },
  {
    key: 'searching',
    icon: Search,
    text: 'Searching through documents...',
    color: 'text-primary-500',
    bgColor: 'bg-primary-100 dark:bg-primary-900/30',
  },
  {
    key: 'found',
    icon: FileText,
    text: 'Found relevant sections',
    color: 'text-success-500',
    bgColor: 'bg-success-100 dark:bg-success-900/30',
  },
  {
    key: 'composing',
    icon: Sparkles,
    text: 'Composing answer...',
    color: 'text-warning-500',
    bgColor: 'bg-warning-100 dark:bg-warning-900/30',
  },
];

export const ThinkingIndicator: React.FC<ThinkingIndicatorProps> = ({
  stage,
  documentCount = 0,
  foundCount = 0,
  smartSearch,
}) => {

  const currentStageIndex = stages.findIndex((s) => s.key === stage);
  const current = stages[currentStageIndex] || stages[0];
  const Icon = current.icon;

  const getText = () => {
    switch (stage) {
      case 'searching':
        // If we have chunks found, show that (final state with results)
        if (smartSearch && smartSearch.chunksFound && smartSearch.chunksFound > 0) {
          if (smartSearch.enabled && smartSearch.categories && smartSearch.categories.length > 0) {
            // Smart search with categories
            return `✓ Found ${smartSearch.chunksFound} relevant chunks from ${smartSearch.searchedDocs}/${smartSearch.totalDocs} documents`;
          } else {
            // Full search (no category match)
            return `✓ Found ${smartSearch.chunksFound} relevant chunks from ${smartSearch.searchedDocs} documents`;
          }
        }
        // If we have smart search info with categories (searching in progress)
        else if (smartSearch?.enabled && smartSearch.categories && smartSearch.categories.length > 0) {
          const categoryText = smartSearch.categories.length === 1 
            ? smartSearch.categories[0]
            : `${smartSearch.categories.length} categories`;
          return `🎯 Smart search: ${smartSearch.searchedDocs}/${smartSearch.totalDocs} docs in "${categoryText}"`;
        }
        // Full search in progress (no categories matched)
        else if (smartSearch && smartSearch.searchedDocs > 0 && smartSearch.totalDocs > 0) {
          return `🔍 Searching all ${smartSearch.totalDocs} documents...`;
        }
        // Default fallback
        return `Searching through ${documentCount} documents...`;
      case 'found':
        return `✓ Found ${foundCount} relevant chunks`;
      default:
        return current.text;
    }
  };

  const getSubText = () => {
    switch (stage) {
      case 'searching':
        if (smartSearch?.enabled && smartSearch.categories.length > 0) {
          return `Categories: ${smartSearch.categories.join(', ')}`;
        }
        return null;
      case 'found':
        if (smartSearch && smartSearch.chunksFound && smartSearch.chunksFound > 0) {
          return `${smartSearch.chunksFound} chunks from multiple documents`;
        }
        return null;
      default:
        return null;
    }
  };

  const getProgress = () => {
    switch (stage) {
      case 'understanding':
        return 15;
      case 'searching':
        return 40;
      case 'found':
        return 70;
      case 'composing':
        return 90;
      default:
        return 0;
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -10 }}
      className="flex items-start gap-3"
    >
      {/* Avatar */}
      <div className="w-9 h-9 rounded-full bg-gradient-to-br from-primary-500 to-accent-600 flex items-center justify-center flex-shrink-0 shadow-md">
        <Bot className="w-5 h-5 text-white" />
      </div>

      {/* Content */}
      <div className="flex-1 max-w-[80%]">
        <motion.div
          className="bg-white dark:bg-secondary-800 rounded-2xl rounded-tl-md p-4 shadow-card border border-secondary-200 dark:border-secondary-700"
          initial={{ scale: 0.95 }}
          animate={{ scale: 1 }}
        >
          {/* Stage indicator */}
          <div className="space-y-2 mb-3">
            <div className="flex items-center gap-3">
              <motion.div
                className={`p-2 rounded-lg ${current.bgColor}`}
                animate={{ scale: [1, 1.1, 1] }}
                transition={{ duration: 1, repeat: Infinity }}
              >
                <Icon className={`w-4 h-4 ${current.color}`} />
              </motion.div>
              <span className="text-sm font-medium text-secondary-700 dark:text-secondary-300">
                {getText()}
              </span>
              <LoadingDots className="ml-auto" />
            </div>
            
            {/* Sub-text with additional details */}
            {getSubText() && (
              <div className="ml-11 text-xs text-secondary-500 dark:text-secondary-400">
                {getSubText()}
              </div>
            )}

            {/* Smart search details */}
            {stage === 'searching' && smartSearch?.enabled && smartSearch.categories.length > 0 && (
              <div className="ml-11 flex flex-wrap gap-1.5">
                {smartSearch.categories.map((cat, idx) => (
                  <span
                    key={idx}
                    className="inline-flex items-center px-2 py-0.5 rounded-md text-xs font-medium bg-primary-50 dark:bg-primary-900/20 text-primary-700 dark:text-primary-300 border border-primary-200 dark:border-primary-800"
                  >
                    {cat}
                  </span>
                ))}
                {smartSearch.confidence && (
                  <span className="inline-flex items-center px-2 py-0.5 rounded-md text-xs font-medium bg-success-50 dark:bg-success-900/20 text-success-700 dark:text-success-300 border border-success-200 dark:border-success-800">
                    {Math.round(smartSearch.confidence * 100)}% confident
                  </span>
                )}
              </div>
            )}

            {/* Show timing when chunks are found */}
            {smartSearch && smartSearch.chunksFound > 0 && smartSearch.timings && (
              <div className="ml-11 text-xs text-secondary-500 dark:text-secondary-400">
                Completed in {(smartSearch.timings / 1000).toFixed(1)}s
              </div>
            )}
          </div>

          {/* Progress bar */}
          <Progress
            value={getProgress()}
            variant="primary"
            size="sm"
            animated
            className="mb-3"
          />

          {/* Stage steps */}
          <div className="flex items-center gap-2">
            {stages.map((s, idx) => {
              const isActive = idx === currentStageIndex;
              const isComplete = idx < currentStageIndex;
              const StageIcon = s.icon;

              return (
                <div
                  key={s.key}
                  className={`flex items-center gap-1 text-xs ${
                    isActive
                      ? s.color
                      : isComplete
                      ? 'text-success-500'
                      : 'text-secondary-400 dark:text-secondary-600'
                  }`}
                >
                  <StageIcon className="w-3 h-3" />
                  {idx < stages.length - 1 && (
                    <div
                      className={`w-4 h-0.5 ${
                        isComplete
                          ? 'bg-success-500'
                          : 'bg-secondary-300 dark:bg-secondary-600'
                      }`}
                    />
                  )}
                </div>
              );
            })}
          </div>
        </motion.div>
      </div>
    </motion.div>
  );
};

export default ThinkingIndicator;
