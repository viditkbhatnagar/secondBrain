import React, { useState, useEffect, lazy, Suspense, useCallback, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Brain, Search, Library, Upload, Menu, MessageSquare, Layers, X, BarChart2 } from 'lucide-react';
import { API_ENDPOINTS } from './config/api';
import './App.css';
import ErrorBoundary from './components/ErrorBoundary';
import {
  ThemeProvider,
  ThemeToggle,
  ToastProvider,
  Tooltip,
  TooltipProvider,
  Badge,
  PageTransition,
  PageLoader,
} from './components/ui';
import { OfflineProvider } from './contexts/OfflineContext';
import {
  OfflineIndicator,
  InstallPrompt,
  UpdatePrompt
} from './components/pwa';

// Lazy load heavy components for code splitting
const LandingPage = lazy(() => import('./components/LandingPage'));
const FileUpload = lazy(() => import('./components/FileUpload').then(m => ({ default: m.FileUpload })));
const DocumentLibrary = lazy(() => import('./components/DocumentLibrary').then(m => ({ default: m.DocumentLibrary })));
const SearchPage = lazy(() => import('./components/SearchPage'));
const Chat = lazy(() => import('./components/chat/ChatPage'));
const ClassifiedView = lazy(() => import('./components/ClassifiedView'));
const ClustersView = lazy(() => import('./components/ClustersView'));
const EntitiesPanel = lazy(() => import('./components/EntitiesPanel'));
const RightSidebar = lazy(() => import('./components/RightSidebar'));
const AnalyticsDashboard = lazy(() => import('./components/analytics/AnalyticsDashboard'));

export interface Document {
  id: string;
  filename: string;
  originalName: string;
  uploadedAt: string;
  wordCount: number;
  chunkCount: number;
  summary?: string;
  topics?: string[];
  fileSize?: number;
}

export interface SearchResult {
  answer: string;
  relevantChunks: Array<{
    content: string;
    documentName: string;
    documentId: string;
    chunkId: string;
    similarity: number;
  }>;
  confidence: number;
  sources: string[];
  isError?: boolean;
  metadata?: {
    strategy?: 'hybrid' | 'vector';
    rerankUsed?: boolean;
    rerankModel?: string;
  };
}

type ActiveTab = 'upload' | 'search' | 'library' | 'classified' | 'clusters' | 'chat' | 'analytics';

const tabs: { id: ActiveTab; label: string; icon: React.ReactNode }[] = [
  { id: 'upload', label: 'Upload', icon: <Upload className="h-4 w-4" /> },
  { id: 'search', label: 'Search', icon: <Search className="h-4 w-4" /> },
  { id: 'chat', label: 'Chat', icon: <MessageSquare className="h-4 w-4" /> },
  { id: 'library', label: 'Library', icon: <Library className="h-4 w-4" /> },
  { id: 'classified', label: 'Classified', icon: <Library className="h-4 w-4" /> },
  { id: 'clusters', label: 'Clusters', icon: <Layers className="h-4 w-4" /> },
  { id: 'analytics', label: 'Analytics', icon: <BarChart2 className="h-4 w-4" /> },
];

const validTabs: ActiveTab[] = ['upload', 'search', 'library', 'classified', 'clusters', 'chat', 'analytics'];

function getInitialView(): { showLanding: boolean; tab: ActiveTab } {
  const hash = window.location.hash.slice(1); // Remove #
  if (hash === '' || hash === 'home') {
    return { showLanding: true, tab: 'upload' };
  }
  if (validTabs.includes(hash as ActiveTab)) {
    return { showLanding: false, tab: hash as ActiveTab };
  }
  return { showLanding: true, tab: 'upload' };
}

function AppContent() {
  const [showLanding, setShowLanding] = useState(() => getInitialView().showLanding);
  const [activeTab, setActiveTab] = useState<ActiveTab>(() => getInitialView().tab);
  const [documents, setDocuments] = useState<Document[]>([]);
  const [stats, setStats] = useState({ totalDocuments: 0, totalChunks: 0 });
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [showUpdatePrompt, setShowUpdatePrompt] = useState(false);

  // Handle browser back/forward buttons
  useEffect(() => {
    const handlePopState = () => {
      const { showLanding: newShowLanding, tab: newTab } = getInitialView();
      setShowLanding(newShowLanding);
      setActiveTab(newTab);
    };

    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, []);

  // Listen for SW updates
  useEffect(() => {
    const handleSWUpdate = () => setShowUpdatePrompt(true);
    window.addEventListener('swUpdate', handleSWUpdate);
    return () => window.removeEventListener('swUpdate', handleSWUpdate);
  }, []);

  useEffect(() => {
    if (!showLanding) {
      loadDocuments();
      loadStats();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showLanding]);

  const loadDocuments = useCallback(async () => {
    try {
      const response = await fetch(API_ENDPOINTS.documents);
      if (response.ok) {
        const docs = await response.json();
        setDocuments(docs);
      }
    } catch (error) {
      console.error('Error loading documents:', error);
    }
  }, []);

  const loadStats = useCallback(async () => {
    try {
      const response = await fetch(API_ENDPOINTS.documentsStats);
      if (response.ok) {
        const statsData = await response.json();
        setStats(statsData);
      }
    } catch (error) {
      console.error('Error loading stats:', error);
    }
  }, []);

  const handleFileUploaded = useCallback((newDocument: Document) => {
    setDocuments(prev => [newDocument, ...prev]);
    setStats(prev => ({
      totalDocuments: prev.totalDocuments + 1,
      totalChunks: prev.totalChunks + newDocument.chunkCount
    }));
    navigateToTab('library');
  }, []);

  const handleDeleteDocument = useCallback(async (documentId: string) => {
    try {
      const response = await fetch(`${API_ENDPOINTS.documents}/${documentId}`, {
        method: 'DELETE',
      });
      
      if (response.ok) {
        setDocuments(prev => prev.filter(doc => doc.id !== documentId));
        loadStats();
      }
    } catch (error) {
      console.error('Error deleting document:', error);
    }
  }, [loadStats]);

  const handleEntitySelect = useCallback(async (e: { type: string; text: string }) => {
    try {
      const url = new URL(`${API_ENDPOINTS.documents}/by-entity`, window.location.origin);
      url.searchParams.set('type', e.type);
      url.searchParams.set('text', e.text);
      const res = await fetch(url.toString());
      if (res.ok) {
        const data = await res.json();
        setDocuments(data.documents || []);
      }
    } catch (err) {
      console.error('Failed to filter by entity', err);
    }
  }, []);

  // Navigate to a tab and update URL
  const navigateToTab = useCallback((tab: ActiveTab) => {
    setActiveTab(tab);
    setShowLanding(false);
    window.history.pushState(null, '', `#${tab}`);
  }, []);

  // Navigate to landing page
  const navigateToLanding = useCallback(() => {
    setShowLanding(true);
    window.history.pushState(null, '', '#home');
  }, []);

  // Handle Get Started from landing page
  const handleGetStarted = useCallback(() => {
    navigateToTab('upload');
  }, [navigateToTab]);

  // Memoize tab buttons to prevent re-renders
  const tabButtons = useMemo(() => tabs.map((tab) => (
    <button
      key={tab.id}
      onClick={() => navigateToTab(tab.id)}
      className={`
        relative flex items-center gap-2 px-4 py-2.5 rounded-lg text-sm font-medium
        transition-all duration-200
        ${activeTab === tab.id
          ? 'text-primary-600 dark:text-primary-400'
          : 'text-secondary-600 dark:text-secondary-400 hover:text-secondary-900 dark:hover:text-secondary-200 hover:bg-secondary-100 dark:hover:bg-secondary-800'
        }
      `}
    >
      {tab.icon}
      <span>{tab.label}</span>
      {activeTab === tab.id && (
        <motion.div
          layoutId="activeTab"
          className="absolute inset-0 bg-primary-100 dark:bg-primary-900/30 rounded-lg -z-10"
          transition={{ type: 'spring', bounce: 0.2, duration: 0.4 }}
        />
      )}
    </button>
  )), [activeTab, navigateToTab]);

  // Show Landing Page (completely separate, no header/nav)
  if (showLanding) {
    return (
      <div className="min-h-screen bg-white dark:bg-secondary-900 transition-colors duration-300">
        <Suspense fallback={<PageLoader message="Loading..." />}>
          <LandingPage onGetStarted={handleGetStarted} />
        </Suspense>
      </div>
    );
  }

  // Show Dashboard with header and navigation
  return (
    <div className="min-h-screen bg-surface dark:bg-secondary-900 transition-colors duration-300">
      {/* PWA Components */}
      <OfflineIndicator />
      <InstallPrompt />
      <UpdatePrompt
        show={showUpdatePrompt}
        onDismiss={() => setShowUpdatePrompt(false)}
      />

      {/* Skip Link for Accessibility */}
      <a href="#main-content" className="skip-link">
        Skip to main content
      </a>

      {/* Header */}
      <header className="sticky top-0 z-40 bg-white/80 dark:bg-secondary-900/80 backdrop-blur-md border-b border-secondary-200 dark:border-secondary-800">
        <div className="container-app">
          <div className="flex items-center justify-between h-16">
            {/* Logo */}
            <motion.div 
              className="flex items-center gap-3 cursor-pointer"
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ duration: 0.3 }}
              onClick={navigateToLanding}
            >
              <div className="relative">
                <div className="absolute inset-0 bg-primary-500/20 blur-xl rounded-full" />
                <Brain className="relative h-8 w-8 text-primary-600 dark:text-primary-400" />
              </div>
              <h1 className="text-xl font-bold bg-gradient-to-r from-primary-600 to-accent-600 dark:from-primary-400 dark:to-accent-400 bg-clip-text text-transparent">
                Second Brain
              </h1>
            </motion.div>
            
            {/* Stats & Actions */}
            <div className="flex items-center gap-4">
              <div className="hidden sm:flex items-center gap-3 text-sm">
                <Badge variant="secondary">
                  {stats.totalDocuments} docs
                </Badge>
                <Badge variant="secondary">
                  {stats.totalChunks} chunks
                </Badge>
              </div>
              
              <ThemeToggle />
              
              <Tooltip content="Open guide">
                <button
                  onClick={() => setIsSidebarOpen(true)}
                  className="btn-icon"
                  aria-label="Open guide"
                >
                  <Menu className="h-5 w-5" />
                </button>
              </Tooltip>

              {/* Mobile menu button */}
              <button
                onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
                className="btn-icon lg:hidden"
                aria-label="Toggle menu"
              >
                {isMobileMenuOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
              </button>
            </div>
          </div>
        </div>
      </header>

      {/* Navigation */}
      <nav className="sticky top-16 z-30 bg-white/80 dark:bg-secondary-900/80 backdrop-blur-md border-b border-secondary-200 dark:border-secondary-800">
        <div className="container-app">
          {/* Desktop Navigation */}
          <div className="hidden lg:flex items-center gap-1 py-2 overflow-x-auto scrollbar-hide">
            {tabButtons}
          </div>

          {/* Mobile Navigation */}
          <AnimatePresence>
            {isMobileMenuOpen && (
              <motion.div
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: 'auto', opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                transition={{ duration: 0.2 }}
                className="lg:hidden overflow-hidden"
              >
                <div className="py-2 space-y-1">
                  {tabs.map((tab) => (
                    <button
                      key={tab.id}
                      onClick={() => {
                        navigateToTab(tab.id);
                        setIsMobileMenuOpen(false);
                      }}
                      className={`
                        w-full flex items-center gap-3 px-4 py-3 rounded-lg text-sm font-medium
                        transition-colors duration-200
                        ${activeTab === tab.id
                          ? 'bg-primary-100 dark:bg-primary-900/30 text-primary-600 dark:text-primary-400'
                          : 'text-secondary-600 dark:text-secondary-400 hover:bg-secondary-100 dark:hover:bg-secondary-800'
                        }
                      `}
                    >
                      {tab.icon}
                      <span>{tab.label}</span>
                    </button>
                  ))}
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </nav>

      {/* Main Content */}
      <main id="main-content" className="container-app py-8">
        <AnimatePresence mode="wait">
          <PageTransition key={activeTab}>
            <Suspense fallback={<PageLoader message="Loading page..." />}>
              {activeTab === 'upload' && (
                <div className="max-w-2xl mx-auto">
                  <FileUpload onFileUploaded={handleFileUploaded} />
                </div>
              )}
              
              {activeTab === 'search' && <SearchPage />}
              
              {activeTab === 'library' && (
                <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
                  <div className="lg:col-span-3">
                    <DocumentLibrary 
                      documents={documents} 
                      onDeleteDocument={handleDeleteDocument}
                    />
                  </div>
                  <div className="lg:col-span-1">
                    <EntitiesPanel onSelect={handleEntitySelect} />
                  </div>
                </div>
              )}

              {activeTab === 'classified' && <ClassifiedView />}
              {activeTab === 'clusters' && <ClustersView />}
              {activeTab === 'chat' && <Chat />}
              {activeTab === 'analytics' && <AnalyticsDashboard />}
            </Suspense>
          </PageTransition>
        </AnimatePresence>
      </main>

      <Suspense fallback={null}>
        <RightSidebar isOpen={isSidebarOpen} onClose={() => setIsSidebarOpen(false)} />
      </Suspense>
    </div>
  );
}

function App() {
  return (
    <ErrorBoundary>
      <OfflineProvider>
        <ThemeProvider>
          <ToastProvider>
            <TooltipProvider delayDuration={300}>
              <AppContent />
            </TooltipProvider>
          </ToastProvider>
        </ThemeProvider>
      </OfflineProvider>
    </ErrorBoundary>
  );
}

export default App;
