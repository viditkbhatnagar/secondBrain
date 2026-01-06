import React from 'react';
import { motion } from 'framer-motion';
import { X } from 'lucide-react';
import { ProgressStages } from './ProgressStages';
import { SearchStage } from './types';
import { Button, BoxLoader } from '../ui';

interface SearchingViewProps {
  query: string;
  stage: SearchStage;
  documentsSearched: number;
  sectionsFound: number;
  onCancel: () => void;
}

export const SearchingView: React.FC<SearchingViewProps> = ({
  query,
  stage,
  documentsSearched,
  sectionsFound,
  onCancel,
}) => {
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.3 }}
      className="py-12 bg-gradient-to-br from-white via-primary-50/30 to-white dark:from-secondary-900 dark:via-primary-950/30 dark:to-secondary-900"
    >
      <div className="w-full max-w-2xl mx-auto px-4">
        {/* Box Loader Animation */}
        <motion.div
          initial={{ scale: 0.8, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ delay: 0.1, duration: 0.5 }}
          className="mb-8"
        >
          <BoxLoader />
        </motion.div>

        {/* Query Display */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2, duration: 0.5 }}
          className="text-center mb-8"
        >
          <p className="text-lg text-secondary-700 dark:text-secondary-300 italic max-w-xl mx-auto">
            "{query}"
          </p>
        </motion.div>

        {/* Progress Bar */}
        <motion.div
          initial={{ opacity: 0, scaleX: 0 }}
          animate={{ opacity: 1, scaleX: 1 }}
          transition={{ delay: 0.3, duration: 0.5 }}
          className="mb-8"
        >
          <div className="h-2 bg-secondary-200 dark:bg-secondary-700 rounded-full overflow-hidden">
            <motion.div
              className="h-full bg-gradient-to-r from-primary-500 via-accent-500 to-primary-500 rounded-full"
              style={{ backgroundSize: '200% 100%' }}
              animate={{
                backgroundPosition: ['200% 0', '-200% 0'],
              }}
              transition={{
                duration: 2,
                repeat: Infinity,
                ease: 'linear',
              }}
            />
          </div>
        </motion.div>

        {/* Progress Stages */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.4, duration: 0.5 }}
        >
          <ProgressStages
            stage={stage}
            documentsSearched={documentsSearched}
            sectionsFound={sectionsFound}
          />
        </motion.div>

        {/* Cancel Button */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.6, duration: 0.5 }}
          className="mt-12 text-center"
        >
          <Button
            variant="ghost"
            size="sm"
            onClick={onCancel}
            leftIcon={<X className="w-4 h-4" />}
          >
            Cancel
          </Button>
        </motion.div>
      </div>
    </motion.div>
  );
};
