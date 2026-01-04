import React from 'react';
import { motion } from 'framer-motion';
import { MessageSquare, ArrowRight } from 'lucide-react';
import { Card } from '../ui';

interface RelatedQuestionsProps {
  questions: string[];
  onQuestionClick: (question: string) => void;
}

export const RelatedQuestions: React.FC<RelatedQuestionsProps> = ({
  questions,
  onQuestionClick,
}) => {
  if (!questions || questions.length === 0) return null;

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.7, duration: 0.5 }}
    >
      <Card
        variant="filled"
        padding="md"
        className="bg-gradient-to-br from-primary-50 to-accent-50 dark:from-primary-900/20 dark:to-accent-900/20 border-primary-100 dark:border-primary-800"
      >
        <div className="flex items-center gap-2 mb-4">
          <MessageSquare className="w-5 h-5 text-primary-600 dark:text-primary-400" />
          <span className="font-medium text-secondary-800 dark:text-secondary-200">
            Related questions
          </span>
        </div>

        <div className="space-y-2">
          {questions.map((question, idx) => (
            <motion.button
              key={idx}
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: 0.8 + idx * 0.1, duration: 0.3 }}
              whileHover={{ scale: 1.02, x: 4 }}
              whileTap={{ scale: 0.98 }}
              onClick={() => onQuestionClick(question)}
              className="w-full text-left px-4 py-3 bg-white dark:bg-secondary-800 rounded-lg border border-secondary-200 dark:border-secondary-700 hover:border-primary-300 dark:hover:border-primary-600 hover:shadow-sm transition-all flex items-center justify-between group"
            >
              <span className="text-sm text-secondary-700 dark:text-secondary-300">
                {question}
              </span>
              <ArrowRight className="w-4 h-4 text-secondary-400 group-hover:text-primary-600 dark:group-hover:text-primary-400 transition-colors" />
            </motion.button>
          ))}
        </div>
      </Card>
    </motion.div>
  );
};
