import React from 'react';
import { motion } from 'framer-motion';
import { AnswerCard } from './AnswerCard';
import { RelatedQuestions } from './RelatedQuestions';
import { SourcesAccordion } from '../chat/SourcesAccordion';
import { Source } from './types';

interface ResultsViewProps {
  answer: string;
  confidence: number;
  sources: Source[];
  relatedQuestions: string[];
  onCopy: () => void;
  onRegenerate: () => void;
  onRelatedQuestionClick: (question: string) => void;
}

export const ResultsView: React.FC<ResultsViewProps> = ({
  answer,
  confidence,
  sources,
  relatedQuestions,
  onCopy,
  onRegenerate,
  onRelatedQuestionClick,
}) => {
  // Transform sources to match SourcesAccordion format
  const transformedSources = sources.map((source, idx) => ({
    documentName: source.documentName,
    content: source.content,
    similarity: source.similarity,
    chunkId: source.chunkId,
    relevance: source.similarity,
    snippet: source.content.substring(0, 200),
  }));

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.3 }}
      className="w-full max-w-4xl mx-auto space-y-6 px-4"
    >
      {/* Answer Card */}
      <AnswerCard
        answer={answer}
        confidence={confidence}
        onCopy={onCopy}
        onRegenerate={onRegenerate}
      />

      {/* Sources */}
      {sources.length > 0 && (
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.6, duration: 0.5 }}
        >
          <SourcesAccordion sources={transformedSources} confidence={confidence} />
        </motion.div>
      )}

      {/* Related Questions */}
      {relatedQuestions.length > 0 && (
        <RelatedQuestions
          questions={relatedQuestions}
          onQuestionClick={onRelatedQuestionClick}
        />
      )}
    </motion.div>
  );
};
