import React from 'react';
import { motion } from 'framer-motion';
import { Sparkles, Database, Layers, Zap } from 'lucide-react';
import { Badge } from '../ui';

interface IdleViewProps {
  documentsCount: number;
  chunksCount: number;
  onExampleClick: (question: string) => void;
}

export const IdleView: React.FC<IdleViewProps> = ({
  documentsCount,
  chunksCount,
  onExampleClick,
}) => {
  const examples = [
    "Summarize the key findings",
    "What are the main recommendations?",
    "What challenges were mentioned?",
    "Compare the different approaches",
  ];

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -20 }}
      transition={{ duration: 0.4 }}
      className="flex flex-col items-center justify-center min-h-[60vh] px-4"
    >
      {/* Icon */}
      <motion.div
        initial={{ scale: 0.8, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={{ delay: 0.1, duration: 0.5 }}
        className="w-20 h-20 rounded-full bg-gradient-to-br from-primary-500 to-accent-600 flex items-center justify-center mb-6 shadow-lg"
      >
        <Sparkles className="w-10 h-10 text-white" />
      </motion.div>

      {/* Title */}
      <motion.h1
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.2, duration: 0.5 }}
        className="text-3xl md:text-4xl font-bold text-secondary-900 dark:text-secondary-100 mb-2 text-center"
      >
        AI-Powered Search
      </motion.h1>

      {/* Subtitle */}
      <motion.p
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.3, duration: 0.5 }}
        className="text-secondary-600 dark:text-secondary-400 mb-8 text-center max-w-md"
      >
        Ask questions about your documents and get intelligent, sourced answers
      </motion.p>

      {/* Stats */}
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.4, duration: 0.5 }}
        className="flex items-center gap-4 md:gap-6 mb-10 flex-wrap justify-center"
      >
        <Badge variant="primary" size="md" className="flex items-center gap-2">
          <Database className="w-4 h-4" />
          {documentsCount} documents
        </Badge>
        <Badge
          variant="secondary"
          size="md"
          className="flex items-center gap-2 bg-accent-50 dark:bg-accent-900/20 text-accent-700 dark:text-accent-300"
        >
          <Layers className="w-4 h-4" />
          {chunksCount} chunks
        </Badge>
        <Badge variant="success" size="md" className="flex items-center gap-2">
          <Zap className="w-4 h-4" />
          Smart retrieval
        </Badge>
      </motion.div>

      {/* Example Questions */}
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.5, duration: 0.5 }}
        className="w-full max-w-2xl"
      >
        <p className="text-sm text-secondary-500 dark:text-secondary-400 mb-3 text-center">
          Try asking:
        </p>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {examples.map((example, idx) => (
            <motion.button
              key={idx}
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ delay: 0.6 + idx * 0.1, duration: 0.3 }}
              whileHover={{ scale: 1.02, y: -2 }}
              whileTap={{ scale: 0.98 }}
              onClick={() => onExampleClick(example)}
              className="text-left px-4 py-3 bg-white dark:bg-secondary-800 border border-secondary-200 dark:border-secondary-700 rounded-xl hover:border-primary-300 dark:hover:border-primary-600 hover:shadow-md transition-all text-sm text-secondary-700 dark:text-secondary-300"
            >
              "{example}"
            </motion.button>
          ))}
        </div>
      </motion.div>
    </motion.div>
  );
};
