import React from 'react';
import { motion } from 'framer-motion';
import { FileText, MessageSquare } from 'lucide-react';
import { SUGGESTION_PROMPTS } from './types';
import { Card, Stagger, StaggerItem } from '../ui';

interface WelcomeStateProps {
  onSuggestionClick: (suggestion: string) => void;
  documentCount: number;
}

export const WelcomeState: React.FC<WelcomeStateProps> = ({
  onSuggestionClick,
  documentCount,
}) => {
  return (
    <div className="h-full flex flex-col items-center justify-center px-4 py-6">
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4 }}
        className="text-center max-w-xl w-full"
      >
        {/* Title */}
        <motion.h1
          className="text-2xl lg:text-3xl font-bold text-secondary-900 dark:text-secondary-100 mb-2"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.1 }}
        >
          How can I help you today?
        </motion.h1>

        {/* Description */}
        <motion.p
          className="text-secondary-500 dark:text-secondary-400 mb-2 text-sm"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.2 }}
        >
          Ask me anything about your documents. I'll search through your knowledge base and provide accurate answers with sources.
        </motion.p>

        {/* Stats */}
        {documentCount > 0 && (
          <motion.div
            className="flex items-center justify-center gap-4 mb-6"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.25 }}
          >
            <div className="flex items-center gap-1.5 text-xs text-secondary-500 dark:text-secondary-400">
              <FileText className="w-3.5 h-3.5" />
              <span>{documentCount} documents indexed</span>
            </div>
          </motion.div>
        )}

        {/* Suggestions */}
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.3 }}
        >
          <p className="text-xs font-medium text-secondary-400 dark:text-secondary-500 uppercase tracking-wide mb-3">
            Try asking
          </p>
          <Stagger className="space-y-2" staggerDelay={0.05}>
            {SUGGESTION_PROMPTS.slice(0, 3).map((suggestion, idx) => (
              <StaggerItem key={idx}>
                <button
                  onClick={() => onSuggestionClick(suggestion)}
                  className="w-full group"
                >
                  <Card
                    variant="outlined"
                    padding="sm"
                    hoverable
                    className="text-left transition-all hover:border-primary-300 dark:hover:border-primary-600 hover:bg-primary-50/50 dark:hover:bg-primary-900/20"
                  >
                    <div className="flex items-center gap-3 py-0.5">
                      <div className="p-1.5 rounded-lg bg-primary-100 dark:bg-primary-900/30 group-hover:bg-primary-200 dark:group-hover:bg-primary-900/50 transition-colors">
                        <MessageSquare className="w-3.5 h-3.5 text-primary-600 dark:text-primary-400" />
                      </div>
                      <span className="text-sm text-secondary-700 dark:text-secondary-300 group-hover:text-primary-600 dark:group-hover:text-primary-400 transition-colors">
                        {suggestion}
                      </span>
                    </div>
                  </Card>
                </button>
              </StaggerItem>
            ))}
          </Stagger>
        </motion.div>
      </motion.div>
    </div>
  );
};

export default WelcomeState;
