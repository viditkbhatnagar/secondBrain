import React from 'react';
import { motion } from 'framer-motion';
import { Bot, Sparkles, FileText, MessageSquare } from 'lucide-react';
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
    <div className="h-full flex flex-col items-center justify-center px-4 py-8">
      <motion.div
        initial={{ opacity: 0, scale: 0.9 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 0.4 }}
        className="text-center max-w-lg"
      >
        {/* Icon */}
        <motion.div
          className="relative mx-auto mb-6"
          initial={{ y: -20 }}
          animate={{ y: 0 }}
          transition={{ delay: 0.1 }}
        >
          <div className="w-20 h-20 rounded-2xl bg-gradient-to-br from-primary-500 to-accent-600 flex items-center justify-center shadow-xl shadow-primary-500/25">
            <Bot className="w-10 h-10 text-white" />
          </div>
          <motion.div
            className="absolute -top-1 -right-1 w-6 h-6 rounded-full bg-success-500 flex items-center justify-center"
            animate={{ scale: [1, 1.2, 1] }}
            transition={{ duration: 2, repeat: Infinity }}
          >
            <Sparkles className="w-3 h-3 text-white" />
          </motion.div>
        </motion.div>

        {/* Title */}
        <motion.h2
          className="text-2xl font-bold text-secondary-900 dark:text-secondary-100 mb-2"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.2 }}
        >
          How can I help you today?
        </motion.h2>

        {/* Description */}
        <motion.p
          className="text-secondary-500 dark:text-secondary-400 mb-2"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.3 }}
        >
          Ask me anything about your documents. I'll search through your knowledge base and provide accurate answers with sources.
        </motion.p>

        {/* Stats */}
        {documentCount > 0 && (
          <motion.div
            className="flex items-center justify-center gap-4 mb-8"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.35 }}
          >
            <div className="flex items-center gap-1.5 text-sm text-secondary-500 dark:text-secondary-400">
              <FileText className="w-4 h-4" />
              <span>{documentCount} documents indexed</span>
            </div>
          </motion.div>
        )}

        {/* Suggestions */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.4 }}
        >
          <p className="text-xs font-medium text-secondary-400 dark:text-secondary-500 uppercase tracking-wide mb-3">
            Try asking
          </p>
          <Stagger className="space-y-2" staggerDelay={0.05}>
            {SUGGESTION_PROMPTS.map((suggestion, idx) => (
              <StaggerItem key={idx}>
                <button
                  onClick={() => onSuggestionClick(suggestion)}
                  className="w-full group"
                >
                  <Card
                    variant="outlined"
                    padding="sm"
                    hoverable
                    className="text-left transition-all hover:border-primary-300 dark:hover:border-primary-600"
                  >
                    <div className="flex items-center gap-3">
                      <div className="p-1.5 rounded-lg bg-primary-100 dark:bg-primary-900/30 group-hover:bg-primary-200 dark:group-hover:bg-primary-900/50 transition-colors">
                        <MessageSquare className="w-4 h-4 text-primary-600 dark:text-primary-400" />
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
