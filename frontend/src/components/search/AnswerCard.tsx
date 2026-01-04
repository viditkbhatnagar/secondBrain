import React, { useState } from 'react';
import { motion } from 'framer-motion';
import { Sparkles, Copy, RefreshCw, Check } from 'lucide-react';
import { Card, Badge, Button } from '../ui';

interface AnswerCardProps {
  answer: string;
  confidence: number;
  onCopy: () => void;
  onRegenerate: () => void;
}

export const AnswerCard: React.FC<AnswerCardProps> = ({
  answer,
  confidence,
  onCopy,
  onRegenerate,
}) => {
  const [copied, setCopied] = useState(false);

  const handleCopy = () => {
    onCopy();
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const getConfidenceVariant = () => {
    if (confidence >= 70) return 'success';
    if (confidence >= 50) return 'warning';
    return 'danger';
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 30 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, ease: 'easeOut' }}
    >
      <Card variant="elevated" padding="none" className="overflow-hidden">
        <div className="p-6 md:p-8">
          {/* Header */}
          <div className="flex items-start justify-between mb-6">
            <div className="flex items-center gap-3">
              <motion.div
                initial={{ scale: 0, rotate: -180 }}
                animate={{ scale: 1, rotate: 0 }}
                transition={{ delay: 0.2, duration: 0.5, type: 'spring' }}
                className="w-12 h-12 rounded-full bg-gradient-to-br from-primary-500 to-accent-600 flex items-center justify-center shadow-lg"
              >
                <Sparkles className="w-6 h-6 text-white" />
              </motion.div>
              <div>
                <h2 className="text-xl font-semibold text-secondary-900 dark:text-secondary-100">
                  Answer
                </h2>
                <p className="text-sm text-secondary-500 dark:text-secondary-400">
                  AI-generated response
                </p>
              </div>
            </div>

            <motion.div
              initial={{ scale: 0, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              transition={{ delay: 0.3, duration: 0.3 }}
            >
              <Badge variant={getConfidenceVariant()} size="md">
                {confidence}% confidence
              </Badge>
            </motion.div>
          </div>

          {/* Answer Content */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.4, duration: 0.5 }}
            className="prose dark:prose-invert max-w-none mb-6"
          >
            <p className="text-secondary-800 dark:text-secondary-200 leading-relaxed whitespace-pre-wrap">
              {answer}
            </p>
          </motion.div>

          {/* Actions */}
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.5, duration: 0.3 }}
            className="flex items-center gap-3 pt-4 border-t border-secondary-100 dark:border-secondary-700"
          >
            <Button
              variant="ghost"
              size="sm"
              onClick={handleCopy}
              leftIcon={
                copied ? (
                  <Check className="w-4 h-4 text-success-500" />
                ) : (
                  <Copy className="w-4 h-4" />
                )
              }
            >
              {copied ? 'Copied!' : 'Copy answer'}
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={onRegenerate}
              leftIcon={<RefreshCw className="w-4 h-4" />}
            >
              Regenerate
            </Button>
          </motion.div>
        </div>
      </Card>
    </motion.div>
  );
};
