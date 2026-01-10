import React, { useState, useEffect, lazy, Suspense, useCallback, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Brain, Library, Upload, Menu, MessageSquare, Layers, X, BarChart2, LogOut, GraduationCap } from 'lucide-react';
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
import { AuthProvider, useAuth } from './contexts/AuthContext';
import {
  OfflineIndicator,
  InstallPrompt,
  UpdatePrompt
} from './components/pwa';

// Lazy load heavy components for code splitting
const LandingPage = lazy(() => import('./components/LandingPage'));
const AdminLogin = lazy(() => import('./components/AdminLogin'));
const FileUpload = lazy(() => import('./components/FileUpload').then(m => ({ default: m.FileUpload })));
const DocumentLibrary = lazy(() => import('./components/DocumentLibrary').then(m => ({ default: m.DocumentLibrary })));
const Chat = lazy(() => import('./components/chat/ChatPage'));
const ClassifiedView = lazy(() => import('./components/ClassifiedView'));
const ClustersView = lazy(() => import('./components/ClustersView'));
const EntitiesPanel = lazy(() => import('./components/EntitiesPanel'));
const RightSidebar = lazy(() => import('./components/RightSidebar'));
const AnalyticsDashboard = lazy(() => import('./components/analytics/AnalyticsDashboard'));
const TrainingPage = lazy(() => import('./components/training/TrainingPage'));
const AdminTraining = lazy(() => import('./components/training/AdminTraining'));

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

type ActiveTab = 'upload' | 'library' | 'classified' | 'clusters' | 'chat' | 'analytics' | 'training' | 'admin-training';
type ViewState = 'landing' | 'login' | 'dashboard';

// All navigation items with access control
const allTabs: { id: ActiveTab; label: string; icon: React.ReactNode; adminOnly: boolean; hidden?: boolean }[] = [
  { id: 'chat', label: 'Chat', icon: <MessageSquare className="h-4 w-4" />, adminOnly: false },
  { id: 'library', label: 'Library', icon: <Library className="h-4 w-4" />, adminOnly: false },
  { id: 'training', label: 'Training', icon: <GraduationCap className="h-4 w-4" />, adminOnly: false },
  { id: 'upload', label: 'Upload', icon: <Upload className="h-4 w-4" />, adminOnly: true },
  { id: 'admin-training', label: 'Training Admin', icon: <GraduationCap className="h-4 w-4" />, adminOnly: true },
  { id: 'classified', label: 'Classified', icon: <Library className="h-4 w-4" />, adminOnly: true, hidden: true },
  { id: 'clusters', label: 'Clusters', icon: <Layers className="h-4 w-4" />, adminOnly: true, hidden: true },
  { id: 'analytics', label: 'Analytics', icon: <BarChart2 className="h-4 w-4" />, adminOnly: true },
];

const validTabs: ActiveTab[] = ['upload', 'library', 'classified', 'clusters', 'chat', 'analytics', 'training', 'admin-training'];

function getInitialView(): { view: ViewState; tab: ActiveTab } {
  const hash = window.location.hash.slice(1); // Remove #
  if (hash === '' || hash === 'home') {
    return { view: 'landing', tab: 'chat' };
  }
  if (hash === 'login') {
    return { view: 'login', tab: 'chat' };
  }
  if (validTabs.includes(hash as ActiveTab)) {
    return { view: 'dashboard', tab: hash as ActiveTab };
  }
  return { view: 'landing', tab: 'chat' };
}

function AppContent() {
  const { isAdmin, logout, admin } = useAuth();
  const [viewState, setViewState] = useState<ViewState>(() => getInitialView().view);
  const [activeTab, setActiveTab] = useState<ActiveTab>(() => getInitialView().tab);
  const [documents, setDocuments] = useState<Document[]>([]);
  const [stats, setStats] = useState({ totalDocuments: 0, totalChunks: 0 });
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [showUpdatePrompt, setShowUpdatePrompt] = useState(false);

  // Filter tabs based on role and visibility
  const tabs = useMemo(() => {
    return isAdmin 
      ? allTabs.filter(tab => !tab.hidden)
      : allTabs.filter(tab => !tab.adminOnly && !tab.hidden);
  }, [isAdmin]);

  // Handle browser back/forward buttons
  useEffect(() => {
    const handlePopState = () => {
      const { view: newView, tab: newTab } = getInitialView();
      setViewState(newView);
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
    if (viewState === 'dashboard') {
      loadDocuments();
      loadStats();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [viewState]);

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
    // Check if user has access to this tab
    const tabConfig = allTabs.find(t => t.id === tab);
    if (tabConfig?.adminOnly && !isAdmin) {
      // Redirect to chat if trying to access admin-only tab
      setActiveTab('chat');
      setViewState('dashboard');
      window.history.pushState(null, '', '#chat');
      return;
    }
    setActiveTab(tab);
    setViewState('dashboard');
    window.history.pushState(null, '', `#${tab}`);
  }, [isAdmin]);

  // Navigate to landing page
  const navigateToLanding = useCallback(() => {
    setViewState('landing');
    window.history.pushState(null, '', '#home');
  }, []);

  // Navigate to admin login
  const navigateToLogin = useCallback(() => {
    setViewState('login');
    window.history.pushState(null, '', '#login');
  }, []);

  // Handle Get Started from landing page (guest user)
  const handleGetStarted = useCallback(() => {
    navigateToTab('chat');
  }, [navigateToTab]);

  // Handle Training button from landing page
  const handleTraining = useCallback(() => {
    navigateToTab('training');
  }, [navigateToTab]);

  // Handle Admin Login button
  const handleAdminLogin = useCallback(() => {
    navigateToLogin();
  }, [navigateToLogin]);

  // Handle successful login
  const handleLoginSuccess = useCallback(() => {
    navigateToTab('upload');
  }, [navigateToTab]);

  // Handle logout
  const handleLogout = useCallback(() => {
    logout();
    navigateToLanding();
  }, [logout, navigateToLanding]);

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
  )), [activeTab, navigateToTab, tabs]);

  // Show Landing Page
  if (viewState === 'landing') {
    return (
      <div className="min-h-screen bg-white dark:bg-secondary-900 transition-colors duration-300">
        <Suspense fallback={<PageLoader message="Loading..." />}>
          <LandingPage onGetStarted={handleGetStarted} onAdminLogin={handleAdminLogin} onTraining={handleTraining} />
        </Suspense>
      </div>
    );
  }

  // Show Admin Login Page
  if (viewState === 'login') {
    return (
      <div className="min-h-screen bg-white dark:bg-secondary-900 transition-colors duration-300">
        <Suspense fallback={<PageLoader message="Loading..." />}>
          <AdminLogin onBack={navigateToLanding} onSuccess={handleLoginSuccess} />
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
                {isAdmin && (
                  <Badge variant="default" className="bg-primary-100 text-primary-700 dark:bg-primary-900/30 dark:text-primary-400">
                    Admin
                  </Badge>
                )}
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

              {/* Admin logout button */}
              {isAdmin && (
                <Tooltip content={`Logout (${admin?.name})`}>
                  <button
                    onClick={handleLogout}
                    className="btn-icon text-secondary-600 hover:text-red-500 dark:text-secondary-400 dark:hover:text-red-400"
                    aria-label="Logout"
                  >
                    <LogOut className="h-5 w-5" />
                  </button>
                </Tooltip>
              )}

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
              {activeTab === 'training' && <TrainingPage />}
              {activeTab === 'admin-training' && <AdminTraining />}
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
              <AuthProvider>
                <AppContent />
              </AuthProvider>
            </TooltipProvider>
          </ToastProvider>
        </ThemeProvider>
      </OfflineProvider>
    </ErrorBoundary>
  );
}

export default App;
