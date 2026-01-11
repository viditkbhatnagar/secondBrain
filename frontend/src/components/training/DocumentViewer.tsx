import React, { useState, useCallback } from 'react';
import { Document, Page, pdfjs } from 'react-pdf';
import 'react-pdf/dist/Page/AnnotationLayer.css';
import 'react-pdf/dist/Page/TextLayer.css';
import {
  ChevronLeft,
  ChevronRight,
  ZoomIn,
  ZoomOut,
  Lightbulb,
  BookOpen,
  HelpCircle,
  Volume2,
  Loader2,
  Maximize2,
  Minimize2,
  X,
  Play,
  Pause
} from 'lucide-react';
import {
  TrainingDocument,
  explainPage,
  generateFlashcards,
  generateQuiz,
  generateAudio,
  FlashcardContent,
  QuizContent
} from '../../services/trainingService';
import { getDocumentFileUrl } from '../../services/trainingService';
import FlashcardModal from './FlashcardModal';
import QuizModal from './QuizModal';

// Set up PDF.js worker
pdfjs.GlobalWorkerOptions.workerSrc = `https://unpkg.com/pdfjs-dist@${pdfjs.version}/build/pdf.worker.min.mjs`;

interface DocumentViewerProps {
  document: TrainingDocument;
}

export function DocumentViewer({ document }: DocumentViewerProps) {
  const [numPages, setNumPages] = useState<number>(0);
  const [currentPage, setCurrentPage] = useState(1);
  const [scale, setScale] = useState(1.0);
  const [isFullscreen, setIsFullscreen] = useState(false);

  // AI Feature states
  const [explanation, setExplanation] = useState<string | null>(null);
  const [flashcards, setFlashcards] = useState<FlashcardContent | null>(null);
  const [quiz, setQuiz] = useState<QuizContent | null>(null);
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const [audioRef, setAudioRef] = useState<HTMLAudioElement | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);

  // Loading states
  const [loadingExplain, setLoadingExplain] = useState(false);
  const [loadingFlashcards, setLoadingFlashcards] = useState(false);
  const [loadingQuiz, setLoadingQuiz] = useState(false);
  const [loadingAudio, setLoadingAudio] = useState(false);

  // Modal states
  const [showFlashcardModal, setShowFlashcardModal] = useState(false);
  const [showQuizModal, setShowQuizModal] = useState(false);
  const [showExplanationPanel, setShowExplanationPanel] = useState(false);

  const onDocumentLoadSuccess = useCallback(({ numPages }: { numPages: number }) => {
    setNumPages(numPages);
    setCurrentPage(1);
    // Reset AI states when document changes
    setExplanation(null);
    setFlashcards(null);
    setQuiz(null);
    if (audioUrl) URL.revokeObjectURL(audioUrl);
    setAudioUrl(null);
    setShowExplanationPanel(false);
  }, [audioUrl]);

  const goToPrevPage = () => {
    setCurrentPage(prev => Math.max(1, prev - 1));
    setExplanation(null);
    if (audioUrl) URL.revokeObjectURL(audioUrl);
    setAudioUrl(null);
  };

  const goToNextPage = () => {
    setCurrentPage(prev => Math.min(numPages, prev + 1));
    setExplanation(null);
    if (audioUrl) URL.revokeObjectURL(audioUrl);
    setAudioUrl(null);
  };

  const zoomIn = () => setScale(prev => Math.min(2.5, prev + 0.25));
  const zoomOut = () => setScale(prev => Math.max(0.5, prev - 0.25));
  const toggleFullscreen = () => setIsFullscreen(!isFullscreen);

  // AI Feature handlers
  const handleExplain = async () => {
    try {
      setLoadingExplain(true);
      const result = await explainPage(document.id, currentPage);
      setExplanation(result);
      setShowExplanationPanel(true);
    } catch (err: any) {
      console.error('Failed to explain page:', err);
      setExplanation(`Error: ${err.message}`);
      setShowExplanationPanel(true);
    } finally {
      setLoadingExplain(false);
    }
  };

  const handleFlashcards = async () => {
    try {
      setLoadingFlashcards(true);
      const result = await generateFlashcards(document.id, currentPage, 'all');
      setFlashcards(result);
      setShowFlashcardModal(true);
    } catch (err: any) {
      console.error('Failed to generate flashcards:', err);
    } finally {
      setLoadingFlashcards(false);
    }
  };

  const handleQuiz = async () => {
    try {
      setLoadingQuiz(true);
      const result = await generateQuiz(document.id, currentPage);
      setQuiz(result);
      setShowQuizModal(true);
    } catch (err: any) {
      console.error('Failed to generate quiz:', err);
    } finally {
      setLoadingQuiz(false);
    }
  };

  const handleAudio = async () => {
    try {
      setLoadingAudio(true);
      if (audioUrl) {
        URL.revokeObjectURL(audioUrl);
      }
      const blob = await generateAudio(document.id, currentPage);
      const url = URL.createObjectURL(blob);
      setAudioUrl(url);

      // Create and play audio
      const audio = new Audio(url);
      audio.onended = () => setIsPlaying(false);
      audio.onpause = () => setIsPlaying(false);
      audio.onplay = () => setIsPlaying(true);
      setAudioRef(audio);
      audio.play();
    } catch (err: any) {
      console.error('Failed to generate audio:', err);
    } finally {
      setLoadingAudio(false);
    }
  };

  const toggleAudioPlayback = () => {
    if (audioRef) {
      if (isPlaying) {
        audioRef.pause();
      } else {
        audioRef.play();
      }
    }
  };

  const pdfUrl = getDocumentFileUrl(document.id);

  return (
    <div className={`flex flex-col h-full ${isFullscreen ? 'fixed inset-0 z-50 bg-white dark:bg-secondary-900' : ''}`}>
      {/* Toolbar */}
      <div className="flex items-center justify-between px-4 py-2 border-b border-secondary-200 dark:border-secondary-700 bg-white dark:bg-secondary-800 flex-shrink-0">
        {/* Left - Document info */}
        <div className="flex items-center gap-2 min-w-0">
          <h3 className="font-medium text-secondary-900 dark:text-secondary-100 truncate text-sm">
            {document.originalName}
          </h3>
        </div>

        {/* Center - Navigation */}
        <div className="flex items-center gap-1">
          <button
            onClick={goToPrevPage}
            disabled={currentPage <= 1}
            className="p-1.5 rounded hover:bg-secondary-100 dark:hover:bg-secondary-700 disabled:opacity-50"
          >
            <ChevronLeft className="h-4 w-4" />
          </button>
          <span className="text-xs text-secondary-600 dark:text-secondary-400 min-w-[70px] text-center">
            {currentPage} / {numPages}
          </span>
          <button
            onClick={goToNextPage}
            disabled={currentPage >= numPages}
            className="p-1.5 rounded hover:bg-secondary-100 dark:hover:bg-secondary-700 disabled:opacity-50"
          >
            <ChevronRight className="h-4 w-4" />
          </button>

          <div className="w-px h-5 bg-secondary-300 dark:bg-secondary-600 mx-1" />

          <button onClick={zoomOut} className="p-1.5 rounded hover:bg-secondary-100 dark:hover:bg-secondary-700">
            <ZoomOut className="h-4 w-4" />
          </button>
          <span className="text-xs text-secondary-600 dark:text-secondary-400 w-10 text-center">
            {Math.round(scale * 100)}%
          </span>
          <button onClick={zoomIn} className="p-1.5 rounded hover:bg-secondary-100 dark:hover:bg-secondary-700">
            <ZoomIn className="h-4 w-4" />
          </button>

          <button onClick={toggleFullscreen} className="p-1.5 rounded hover:bg-secondary-100 dark:hover:bg-secondary-700">
            {isFullscreen ? <Minimize2 className="h-4 w-4" /> : <Maximize2 className="h-4 w-4" />}
          </button>
        </div>

        {/* Right - AI Features */}
        <div className="flex items-center gap-1.5">
          <button
            onClick={handleExplain}
            disabled={loadingExplain}
            className="flex items-center gap-1 px-2.5 py-1 rounded-md bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-300 hover:bg-amber-200 dark:hover:bg-amber-900/50 text-xs font-medium disabled:opacity-50"
          >
            {loadingExplain ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Lightbulb className="h-3.5 w-3.5" />}
            Explain
          </button>

          <button
            onClick={handleFlashcards}
            disabled={loadingFlashcards}
            className="flex items-center gap-1 px-2.5 py-1 rounded-md bg-purple-100 dark:bg-purple-900/30 text-purple-700 dark:text-purple-300 hover:bg-purple-200 dark:hover:bg-purple-900/50 text-xs font-medium disabled:opacity-50"
          >
            {loadingFlashcards ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <BookOpen className="h-3.5 w-3.5" />}
            Flashcards
          </button>

          <button
            onClick={handleQuiz}
            disabled={loadingQuiz}
            className="flex items-center gap-1 px-2.5 py-1 rounded-md bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-300 hover:bg-emerald-200 dark:hover:bg-emerald-900/50 text-xs font-medium disabled:opacity-50"
          >
            {loadingQuiz ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <HelpCircle className="h-3.5 w-3.5" />}
            Quiz
          </button>

          <button
            onClick={handleAudio}
            disabled={loadingAudio}
            className="flex items-center gap-1 px-2.5 py-1 rounded-md bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 hover:bg-blue-200 dark:hover:bg-blue-900/50 text-xs font-medium disabled:opacity-50"
          >
            {loadingAudio ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Volume2 className="h-3.5 w-3.5" />}
            Audio
          </button>
        </div>
      </div>

      {/* Content Area */}
      <div className="flex flex-1 overflow-hidden min-h-0">
        {/* PDF Viewer */}
        <div className={`overflow-auto bg-secondary-100 dark:bg-secondary-900 flex justify-center p-4 transition-all ${showExplanationPanel ? 'flex-1' : 'flex-1'}`}>
          <Document
            file={pdfUrl}
            onLoadSuccess={onDocumentLoadSuccess}
            loading={
              <div className="flex items-center justify-center h-64">
                <Loader2 className="h-8 w-8 animate-spin text-primary-500" />
              </div>
            }
            error={
              <div className="text-center p-8">
                <p className="text-red-500 font-medium">Failed to load PDF</p>
                <p className="text-sm mt-2 text-secondary-600 dark:text-secondary-400">
                  The document file may not be available in this environment.
                </p>
                <p className="text-xs mt-1 text-secondary-500 dark:text-secondary-500">
                  If running locally, you may need to re-upload documents in the Admin panel.
                </p>
              </div>
            }
          >
            <Page
              pageNumber={currentPage}
              scale={scale}
              renderTextLayer={false}
              renderAnnotationLayer={false}
              className="shadow-lg"
            />
          </Document>
        </div>

        {/* Explanation Panel - Fixed width, better styling */}
        {showExplanationPanel && (
          <div className="w-[400px] flex-shrink-0 border-l border-secondary-200 dark:border-secondary-700 bg-white dark:bg-secondary-800 flex flex-col">
            {/* Header */}
            <div className="flex items-center justify-between px-4 py-3 border-b border-secondary-200 dark:border-secondary-700 flex-shrink-0">
              <h4 className="font-semibold text-secondary-900 dark:text-secondary-100 flex items-center gap-2">
                <Lightbulb className="h-5 w-5 text-amber-500" />
                Page {currentPage} Explanation
              </h4>
              <button
                onClick={() => setShowExplanationPanel(false)}
                className="p-1 rounded hover:bg-secondary-100 dark:hover:bg-secondary-700 text-secondary-500"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            {/* Content - Scrollable */}
            <div className="flex-1 overflow-y-auto p-4">
              {explanation ? (
                <div className="prose prose-sm dark:prose-invert max-w-none">
                  <p className="text-secondary-700 dark:text-secondary-300 whitespace-pre-wrap leading-relaxed">
                    {explanation}
                  </p>
                </div>
              ) : (
                <p className="text-secondary-500 text-center py-8">Click "Explain" to get an explanation of this page.</p>
              )}
            </div>

            {/* Audio controls in explanation panel */}
            {explanation && (
              <div className="px-4 py-3 border-t border-secondary-200 dark:border-secondary-700 flex-shrink-0">
                <button
                  onClick={handleAudio}
                  disabled={loadingAudio}
                  className="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg bg-blue-500 hover:bg-blue-600 text-white font-medium disabled:opacity-50"
                >
                  {loadingAudio ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin" />
                      Generating Audio...
                    </>
                  ) : (
                    <>
                      <Volume2 className="h-4 w-4" />
                      Listen to Detailed Explanation
                    </>
                  )}
                </button>

                {/* Audio Player */}
                {audioUrl && (
                  <div className="mt-3 flex items-center gap-2 p-2 bg-secondary-50 dark:bg-secondary-900 rounded-lg">
                    <button
                      onClick={toggleAudioPlayback}
                      className="p-2 rounded-full bg-blue-500 hover:bg-blue-600 text-white"
                    >
                      {isPlaying ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
                    </button>
                    <audio
                      src={audioUrl}
                      ref={(el) => {
                        if (el && !audioRef) {
                          el.onended = () => setIsPlaying(false);
                          el.onpause = () => setIsPlaying(false);
                          el.onplay = () => setIsPlaying(true);
                          setAudioRef(el);
                        }
                      }}
                      className="flex-1 h-8"
                      controls
                    />
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Flashcard Modal */}
      {showFlashcardModal && flashcards && (
        <FlashcardModal
          flashcards={flashcards}
          onClose={() => setShowFlashcardModal(false)}
        />
      )}

      {/* Quiz Modal */}
      {showQuizModal && quiz && (
        <QuizModal
          quiz={quiz}
          onClose={() => setShowQuizModal(false)}
        />
      )}
    </div>
  );
}

export default DocumentViewer;
