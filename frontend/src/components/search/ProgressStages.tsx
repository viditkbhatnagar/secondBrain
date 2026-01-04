import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Brain, Search, Target, Sparkles, Check } from 'lucide-react';
import { SearchStage } from './types';

interface ProgressStagesProps {
  stage: SearchStage;
  documentsSearched: number;
  sectionsFound: number;
}

export const ProgressStages: React.FC<ProgressStagesProps> = ({
  stage,
  documentsSearched,
  sectionsFound,
}) => {
  const stages = [
    {
      key: 'understanding' as SearchStage,
      icon: Brain,
      text: 'Understanding your question...',
      active: true,
    },
    {
      key: 'searching' as SearchStage,
      icon: Search,
      text: `Searching through ${documentsSearched} documents...`,
      active: stage !== 'understanding',
    },
    {
      key: 'found' as SearchStage,
      icon: Target,
      text: `Found ${sectionsFound} relevant sections`,
      active: ['found', 'composing', 'done'].includes(stage),
    },
    {
      key: 'composing' as SearchStage,
      icon: Sparkles,
      text: 'Composing your answer...',
      active: ['composing', 'done'].includes(stage),
    },
  ];

  const currentIndex = stages.findIndex((s) => s.key === stage);

  return (
    <div className="space-y-4 w-full max-w-md mx-auto">
      {stages.map((s, idx) => {
        const Icon = s.icon;
        const isCurrent = s.key === stage;
        const isPast = currentIndex > idx;
        const isFuture = currentIndex < idx;

        return (
          <motion.div
            key={s.key}
            initial={{ opacity: 0, x: -20 }}
            animate={{
              opacity: isFuture ? 0.3 : 1,
              x: 0,
              scale: isCurrent ? 1.05 : 1,
            }}
            transition={{ duration: 0.3, delay: idx * 0.1 }}
            className={`flex items-center gap-3 transition-all duration-300 ${
              isCurrent
                ? 'text-primary-600 dark:text-primary-400'
                : isPast
                ? 'text-success-600 dark:text-success-400'
                : 'text-secondary-400 dark:text-secondary-500'
            }`}
          >
            <div className="relative">
              <AnimatePresence mode="wait">
                {isPast ? (
                  <motion.div
                    key="check"
                    initial={{ scale: 0, rotate: -180 }}
                    animate={{ scale: 1, rotate: 0 }}
                    exit={{ scale: 0, rotate: 180 }}
                    transition={{ duration: 0.3 }}
                  >
                    <Check className="w-6 h-6" />
                  </motion.div>
                ) : isCurrent ? (
                  <motion.div
                    key="current"
                    animate={{
                      scale: [1, 1.2, 1],
                      rotate: [0, 5, -5, 0],
                    }}
                    transition={{
                      duration: 2,
                      repeat: Infinity,
                      ease: "easeInOut",
                    }}
                  >
                    <Icon className="w-6 h-6" />
                  </motion.div>
                ) : (
                  <motion.div
                    key="future"
                    initial={{ scale: 0.8 }}
                    animate={{ scale: 1 }}
                  >
                    <div className="w-6 h-6 rounded-full border-2 border-current" />
                  </motion.div>
                )}
              </AnimatePresence>
            </div>

            <motion.span
              className={`text-sm ${isCurrent ? 'font-medium' : ''}`}
              animate={{
                opacity: isFuture ? 0.5 : 1,
              }}
            >
              {s.text}
            </motion.span>
          </motion.div>
        );
      })}
    </div>
  );
};
