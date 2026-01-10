import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, BookOpen, ChevronLeft, ChevronRight, RotateCcw, Lightbulb, BookMarked, HelpCircle } from 'lucide-react';
import { FlashcardContent } from '../../services/trainingService';

interface FlashcardModalProps {
  flashcards: FlashcardContent;
  onClose: () => void;
}

type CardType = 'explanation' | 'keyTerms' | 'qa';

export function FlashcardModal({ flashcards, onClose }: FlashcardModalProps) {
  const [activeTab, setActiveTab] = useState<CardType>('explanation');
  const [currentTermIndex, setCurrentTermIndex] = useState(0);
  const [currentQAIndex, setCurrentQAIndex] = useState(0);
  const [showAnswer, setShowAnswer] = useState(false);
  const [isFlipped, setIsFlipped] = useState(false);

  const keyTerms = flashcards.content.keyTerms || [];
  const questions = flashcards.content.questions || [];

  const tabs = [
    { id: 'explanation' as CardType, label: 'Explanation', icon: Lightbulb, count: flashcards.content.explanation ? 1 : 0 },
    { id: 'keyTerms' as CardType, label: 'Key Terms', icon: BookMarked, count: keyTerms.length },
    { id: 'qa' as CardType, label: 'Q&A', icon: HelpCircle, count: questions.length },
  ];

  const handleFlip = () => setIsFlipped(!isFlipped);

  const nextTerm = () => {
    setCurrentTermIndex((prev) => (prev + 1) % keyTerms.length);
    setIsFlipped(false);
  };

  const prevTerm = () => {
    setCurrentTermIndex((prev) => (prev - 1 + keyTerms.length) % keyTerms.length);
    setIsFlipped(false);
  };

  const nextQA = () => {
    setCurrentQAIndex((prev) => (prev + 1) % questions.length);
    setShowAnswer(false);
  };

  const prevQA = () => {
    setCurrentQAIndex((prev) => (prev - 1 + questions.length) % questions.length);
    setShowAnswer(false);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.95 }}
        className="bg-white dark:bg-secondary-800 rounded-2xl shadow-2xl w-full max-w-2xl max-h-[80vh] overflow-hidden"
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-secondary-200 dark:border-secondary-700">
          <div className="flex items-center gap-3">
            <BookOpen className="h-6 w-6 text-purple-500" />
            <h2 className="text-xl font-semibold text-secondary-900 dark:text-secondary-100">
              Flashcards - Page {flashcards.pageNumber}
            </h2>
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-lg hover:bg-secondary-100 dark:hover:bg-secondary-700 text-secondary-500"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Tabs */}
        <div className="flex border-b border-secondary-200 dark:border-secondary-700 px-6">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`flex items-center gap-2 px-4 py-3 border-b-2 transition-colors ${
                activeTab === tab.id
                  ? 'border-purple-500 text-purple-600 dark:text-purple-400'
                  : 'border-transparent text-secondary-500 hover:text-secondary-700 dark:hover:text-secondary-300'
              }`}
            >
              <tab.icon className="h-4 w-4" />
              <span className="font-medium">{tab.label}</span>
              {tab.count > 0 && (
                <span className="text-xs bg-secondary-100 dark:bg-secondary-700 px-2 py-0.5 rounded-full">
                  {tab.count}
                </span>
              )}
            </button>
          ))}
        </div>

        {/* Content */}
        <div className="p-6 overflow-y-auto" style={{ maxHeight: 'calc(80vh - 180px)' }}>
          {/* Explanation Tab */}
          {activeTab === 'explanation' && (
            <div className="prose prose-sm dark:prose-invert max-w-none">
              {flashcards.content.explanation ? (
                <p className="text-secondary-700 dark:text-secondary-300 text-lg leading-relaxed">
                  {flashcards.content.explanation}
                </p>
              ) : (
                <p className="text-secondary-500 text-center py-8">No explanation available</p>
              )}
            </div>
          )}

          {/* Key Terms Tab */}
          {activeTab === 'keyTerms' && (
            <div>
              {keyTerms.length > 0 ? (
                <div className="space-y-6">
                  {/* Flashcard */}
                  <div
                    className="relative h-64 cursor-pointer perspective-1000"
                    onClick={handleFlip}
                  >
                    <motion.div
                      className="absolute inset-0 rounded-xl shadow-lg"
                      animate={{ rotateY: isFlipped ? 180 : 0 }}
                      transition={{ duration: 0.5 }}
                      style={{ transformStyle: 'preserve-3d' }}
                    >
                      {/* Front - Term */}
                      <div
                        className="absolute inset-0 flex items-center justify-center p-6 rounded-xl bg-gradient-to-br from-purple-500 to-purple-600 text-white backface-hidden"
                        style={{ backfaceVisibility: 'hidden' }}
                      >
                        <div className="text-center">
                          <p className="text-sm uppercase tracking-wider opacity-70 mb-2">Term</p>
                          <h3 className="text-2xl font-bold">{keyTerms[currentTermIndex]?.term}</h3>
                          <p className="text-sm mt-4 opacity-70">Click to flip</p>
                        </div>
                      </div>
                      {/* Back - Definition */}
                      <div
                        className="absolute inset-0 flex items-center justify-center p-6 rounded-xl bg-gradient-to-br from-indigo-500 to-indigo-600 text-white"
                        style={{ backfaceVisibility: 'hidden', transform: 'rotateY(180deg)' }}
                      >
                        <div className="text-center">
                          <p className="text-sm uppercase tracking-wider opacity-70 mb-2">Definition</p>
                          <p className="text-lg">{keyTerms[currentTermIndex]?.definition}</p>
                        </div>
                      </div>
                    </motion.div>
                  </div>

                  {/* Navigation */}
                  <div className="flex items-center justify-between">
                    <button
                      onClick={prevTerm}
                      className="flex items-center gap-1 px-4 py-2 rounded-lg bg-secondary-100 dark:bg-secondary-700 hover:bg-secondary-200 dark:hover:bg-secondary-600"
                    >
                      <ChevronLeft className="h-4 w-4" />
                      Previous
                    </button>
                    <span className="text-secondary-500">
                      {currentTermIndex + 1} / {keyTerms.length}
                    </span>
                    <button
                      onClick={nextTerm}
                      className="flex items-center gap-1 px-4 py-2 rounded-lg bg-secondary-100 dark:bg-secondary-700 hover:bg-secondary-200 dark:hover:bg-secondary-600"
                    >
                      Next
                      <ChevronRight className="h-4 w-4" />
                    </button>
                  </div>

                  {/* Reset button */}
                  <button
                    onClick={() => {
                      setCurrentTermIndex(0);
                      setIsFlipped(false);
                    }}
                    className="flex items-center gap-2 mx-auto text-secondary-500 hover:text-secondary-700 dark:hover:text-secondary-300"
                  >
                    <RotateCcw className="h-4 w-4" />
                    Reset
                  </button>
                </div>
              ) : (
                <p className="text-secondary-500 text-center py-8">No key terms available</p>
              )}
            </div>
          )}

          {/* Q&A Tab */}
          {activeTab === 'qa' && (
            <div>
              {questions.length > 0 ? (
                <div className="space-y-6">
                  {/* Question Card */}
                  <div className="bg-secondary-50 dark:bg-secondary-900 rounded-xl p-6">
                    <p className="text-sm text-secondary-500 mb-2">Question {currentQAIndex + 1}</p>
                    <h3 className="text-lg font-medium text-secondary-900 dark:text-secondary-100 mb-4">
                      {questions[currentQAIndex]?.question}
                    </h3>

                    {/* Answer */}
                    <AnimatePresence>
                      {showAnswer ? (
                        <motion.div
                          initial={{ opacity: 0, height: 0 }}
                          animate={{ opacity: 1, height: 'auto' }}
                          exit={{ opacity: 0, height: 0 }}
                          className="mt-4 pt-4 border-t border-secondary-200 dark:border-secondary-700"
                        >
                          <p className="text-sm text-secondary-500 mb-2">Answer</p>
                          <p className="text-secondary-700 dark:text-secondary-300">
                            {questions[currentQAIndex]?.answer}
                          </p>
                        </motion.div>
                      ) : (
                        <button
                          onClick={() => setShowAnswer(true)}
                          className="w-full py-3 rounded-lg bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-300 font-medium hover:bg-emerald-200 dark:hover:bg-emerald-900/50"
                        >
                          Show Answer
                        </button>
                      )}
                    </AnimatePresence>
                  </div>

                  {/* Navigation */}
                  <div className="flex items-center justify-between">
                    <button
                      onClick={prevQA}
                      className="flex items-center gap-1 px-4 py-2 rounded-lg bg-secondary-100 dark:bg-secondary-700 hover:bg-secondary-200 dark:hover:bg-secondary-600"
                    >
                      <ChevronLeft className="h-4 w-4" />
                      Previous
                    </button>
                    <span className="text-secondary-500">
                      {currentQAIndex + 1} / {questions.length}
                    </span>
                    <button
                      onClick={nextQA}
                      className="flex items-center gap-1 px-4 py-2 rounded-lg bg-secondary-100 dark:bg-secondary-700 hover:bg-secondary-200 dark:hover:bg-secondary-600"
                    >
                      Next
                      <ChevronRight className="h-4 w-4" />
                    </button>
                  </div>
                </div>
              ) : (
                <p className="text-secondary-500 text-center py-8">No Q&A available</p>
              )}
            </div>
          )}
        </div>
      </motion.div>
    </div>
  );
}

export default FlashcardModal;
