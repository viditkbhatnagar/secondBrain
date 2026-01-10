import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, HelpCircle, CheckCircle, XCircle, ChevronRight, RotateCcw, Trophy } from 'lucide-react';
import { QuizContent, QuizQuestion } from '../../services/trainingService';

interface QuizModalProps {
  quiz: QuizContent;
  onClose: () => void;
}

export function QuizModal({ quiz, onClose }: QuizModalProps) {
  const [currentQuestionIndex, setCurrentQuestionIndex] = useState(0);
  const [selectedAnswer, setSelectedAnswer] = useState<string | boolean | null>(null);
  const [showResult, setShowResult] = useState(false);
  const [answers, setAnswers] = useState<(string | boolean | null)[]>(new Array(quiz.questions.length).fill(null));
  const [isCompleted, setIsCompleted] = useState(false);

  const currentQuestion = quiz.questions[currentQuestionIndex];
  const totalQuestions = quiz.questions.length;

  const handleAnswerSelect = (answer: string | boolean) => {
    if (showResult) return;
    setSelectedAnswer(answer);
  };

  const handleSubmitAnswer = () => {
    if (selectedAnswer === null) return;

    const newAnswers = [...answers];
    newAnswers[currentQuestionIndex] = selectedAnswer;
    setAnswers(newAnswers);
    setShowResult(true);
  };

  const handleNext = () => {
    if (currentQuestionIndex < totalQuestions - 1) {
      setCurrentQuestionIndex(currentQuestionIndex + 1);
      setSelectedAnswer(answers[currentQuestionIndex + 1]);
      setShowResult(answers[currentQuestionIndex + 1] !== null);
    } else {
      setIsCompleted(true);
    }
  };

  const handleRestart = () => {
    setCurrentQuestionIndex(0);
    setSelectedAnswer(null);
    setShowResult(false);
    setAnswers(new Array(quiz.questions.length).fill(null));
    setIsCompleted(false);
  };

  const isCorrect = selectedAnswer === currentQuestion?.correctAnswer;

  const getScore = () => {
    return answers.reduce((score, answer, index) => {
      return score + (answer === quiz.questions[index]?.correctAnswer ? 1 : 0);
    }, 0);
  };

  const renderQuestionContent = (question: QuizQuestion) => {
    switch (question.type) {
      case 'mcq':
        return (
          <div className="space-y-3">
            {question.options?.map((option, index) => (
              <button
                key={index}
                onClick={() => handleAnswerSelect(option)}
                disabled={showResult}
                className={`w-full text-left px-4 py-3 rounded-lg border-2 transition-all ${
                  showResult
                    ? option === question.correctAnswer
                      ? 'border-green-500 bg-green-50 dark:bg-green-900/20'
                      : selectedAnswer === option
                      ? 'border-red-500 bg-red-50 dark:bg-red-900/20'
                      : 'border-secondary-200 dark:border-secondary-700'
                    : selectedAnswer === option
                    ? 'border-primary-500 bg-primary-50 dark:bg-primary-900/20'
                    : 'border-secondary-200 dark:border-secondary-700 hover:border-primary-300'
                }`}
              >
                <div className="flex items-center gap-3">
                  <span className="w-8 h-8 flex items-center justify-center rounded-full bg-secondary-100 dark:bg-secondary-700 text-sm font-medium">
                    {String.fromCharCode(65 + index)}
                  </span>
                  <span className="text-secondary-800 dark:text-secondary-200">{option}</span>
                  {showResult && option === question.correctAnswer && (
                    <CheckCircle className="h-5 w-5 text-green-500 ml-auto" />
                  )}
                  {showResult && selectedAnswer === option && option !== question.correctAnswer && (
                    <XCircle className="h-5 w-5 text-red-500 ml-auto" />
                  )}
                </div>
              </button>
            ))}
          </div>
        );

      case 'trueFalse':
        return (
          <div className="flex gap-4">
            {[true, false].map((value) => (
              <button
                key={String(value)}
                onClick={() => handleAnswerSelect(value)}
                disabled={showResult}
                className={`flex-1 px-6 py-4 rounded-lg border-2 transition-all ${
                  showResult
                    ? value === question.correctAnswer
                      ? 'border-green-500 bg-green-50 dark:bg-green-900/20'
                      : selectedAnswer === value
                      ? 'border-red-500 bg-red-50 dark:bg-red-900/20'
                      : 'border-secondary-200 dark:border-secondary-700'
                    : selectedAnswer === value
                    ? 'border-primary-500 bg-primary-50 dark:bg-primary-900/20'
                    : 'border-secondary-200 dark:border-secondary-700 hover:border-primary-300'
                }`}
              >
                <div className="flex items-center justify-center gap-2">
                  <span className="text-lg font-medium text-secondary-800 dark:text-secondary-200">
                    {value ? 'True' : 'False'}
                  </span>
                  {showResult && value === question.correctAnswer && (
                    <CheckCircle className="h-5 w-5 text-green-500" />
                  )}
                  {showResult && selectedAnswer === value && value !== question.correctAnswer && (
                    <XCircle className="h-5 w-5 text-red-500" />
                  )}
                </div>
              </button>
            ))}
          </div>
        );

      case 'fillBlank':
        return (
          <div className="space-y-4">
            <input
              type="text"
              value={typeof selectedAnswer === 'string' ? selectedAnswer : ''}
              onChange={(e) => setSelectedAnswer(e.target.value)}
              disabled={showResult}
              placeholder="Type your answer..."
              className={`w-full px-4 py-3 rounded-lg border-2 bg-white dark:bg-secondary-900 transition-all ${
                showResult
                  ? isCorrect
                    ? 'border-green-500'
                    : 'border-red-500'
                  : 'border-secondary-200 dark:border-secondary-700 focus:border-primary-500'
              }`}
            />
            {showResult && (
              <div className="flex items-center gap-2 text-sm">
                {isCorrect ? (
                  <CheckCircle className="h-4 w-4 text-green-500" />
                ) : (
                  <XCircle className="h-4 w-4 text-red-500" />
                )}
                <span className="text-secondary-600 dark:text-secondary-400">
                  Correct answer: <strong>{String(question.correctAnswer)}</strong>
                </span>
              </div>
            )}
          </div>
        );

      default:
        return null;
    }
  };

  // Completed state - show results
  if (isCompleted) {
    const score = getScore();
    const percentage = Math.round((score / totalQuestions) * 100);

    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
        <motion.div
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          className="bg-white dark:bg-secondary-800 rounded-2xl shadow-2xl w-full max-w-md p-8 text-center"
        >
          <div className="mb-6">
            <Trophy className={`h-16 w-16 mx-auto ${percentage >= 70 ? 'text-yellow-500' : 'text-secondary-400'}`} />
          </div>

          <h2 className="text-2xl font-bold text-secondary-900 dark:text-secondary-100 mb-2">
            Quiz Complete!
          </h2>

          <p className="text-4xl font-bold text-primary-600 dark:text-primary-400 mb-4">
            {score} / {totalQuestions}
          </p>

          <div className="w-full bg-secondary-200 dark:bg-secondary-700 rounded-full h-4 mb-4">
            <div
              className={`h-4 rounded-full ${percentage >= 70 ? 'bg-green-500' : percentage >= 50 ? 'bg-yellow-500' : 'bg-red-500'}`}
              style={{ width: `${percentage}%` }}
            />
          </div>

          <p className="text-secondary-600 dark:text-secondary-400 mb-6">
            {percentage >= 70
              ? 'Great job! You have a good understanding of this material.'
              : percentage >= 50
              ? 'Good effort! Review the material to improve your score.'
              : 'Keep studying! Review the page content and try again.'}
          </p>

          <div className="flex gap-3">
            <button
              onClick={handleRestart}
              className="flex-1 flex items-center justify-center gap-2 px-4 py-3 rounded-lg bg-secondary-100 dark:bg-secondary-700 hover:bg-secondary-200 dark:hover:bg-secondary-600 text-secondary-700 dark:text-secondary-300"
            >
              <RotateCcw className="h-4 w-4" />
              Try Again
            </button>
            <button
              onClick={onClose}
              className="flex-1 px-4 py-3 rounded-lg bg-primary-500 hover:bg-primary-600 text-white"
            >
              Done
            </button>
          </div>
        </motion.div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        className="bg-white dark:bg-secondary-800 rounded-2xl shadow-2xl w-full max-w-2xl max-h-[80vh] overflow-hidden"
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-secondary-200 dark:border-secondary-700">
          <div className="flex items-center gap-3">
            <HelpCircle className="h-6 w-6 text-emerald-500" />
            <h2 className="text-xl font-semibold text-secondary-900 dark:text-secondary-100">
              Quiz - Page {quiz.pageNumber}
            </h2>
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-lg hover:bg-secondary-100 dark:hover:bg-secondary-700 text-secondary-500"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Progress */}
        <div className="px-6 py-3 bg-secondary-50 dark:bg-secondary-900">
          <div className="flex items-center justify-between text-sm text-secondary-600 dark:text-secondary-400 mb-2">
            <span>Question {currentQuestionIndex + 1} of {totalQuestions}</span>
            <span className="text-xs uppercase tracking-wide px-2 py-1 rounded bg-secondary-200 dark:bg-secondary-700">
              {currentQuestion?.type === 'mcq' ? 'Multiple Choice' : currentQuestion?.type === 'trueFalse' ? 'True/False' : 'Fill in the Blank'}
            </span>
          </div>
          <div className="w-full bg-secondary-200 dark:bg-secondary-700 rounded-full h-2">
            <div
              className="bg-emerald-500 h-2 rounded-full transition-all"
              style={{ width: `${((currentQuestionIndex + 1) / totalQuestions) * 100}%` }}
            />
          </div>
        </div>

        {/* Question Content */}
        <div className="p-6 overflow-y-auto" style={{ maxHeight: 'calc(80vh - 220px)' }}>
          <h3 className="text-lg font-medium text-secondary-900 dark:text-secondary-100 mb-6">
            {currentQuestion?.question}
          </h3>

          {currentQuestion && renderQuestionContent(currentQuestion)}

          {/* Explanation */}
          <AnimatePresence>
            {showResult && currentQuestion?.explanation && (
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: 'auto' }}
                exit={{ opacity: 0, height: 0 }}
                className="mt-6 p-4 rounded-lg bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800"
              >
                <p className="text-sm text-blue-800 dark:text-blue-200">
                  <strong>Explanation:</strong> {currentQuestion.explanation}
                </p>
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-secondary-200 dark:border-secondary-700 flex justify-between">
          <button
            onClick={handleRestart}
            className="flex items-center gap-2 px-4 py-2 rounded-lg text-secondary-600 dark:text-secondary-400 hover:bg-secondary-100 dark:hover:bg-secondary-700"
          >
            <RotateCcw className="h-4 w-4" />
            Restart
          </button>

          {!showResult ? (
            <button
              onClick={handleSubmitAnswer}
              disabled={selectedAnswer === null}
              className="px-6 py-2 rounded-lg bg-emerald-500 hover:bg-emerald-600 text-white font-medium disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Submit Answer
            </button>
          ) : (
            <button
              onClick={handleNext}
              className="flex items-center gap-2 px-6 py-2 rounded-lg bg-primary-500 hover:bg-primary-600 text-white font-medium"
            >
              {currentQuestionIndex < totalQuestions - 1 ? (
                <>
                  Next Question
                  <ChevronRight className="h-4 w-4" />
                </>
              ) : (
                'See Results'
              )}
            </button>
          )}
        </div>
      </motion.div>
    </div>
  );
}

export default QuizModal;
