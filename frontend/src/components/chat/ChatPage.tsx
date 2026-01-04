import React, { useState, useEffect, useRef, useCallback } from 'react';
import { AnimatePresence } from 'framer-motion';
import { ChevronDown, Menu, X } from 'lucide-react';
import { API_ENDPOINTS } from '../../config/api';
import { ChatMessage, ChatThread, ThinkingStage, SourceInfo } from './types';
import { ThreadSidebar } from './ThreadSidebar';
import { MessageBubble } from './MessageBubble';
import { ThinkingIndicator } from './ThinkingIndicator';
import { WelcomeState } from './WelcomeState';
import { ChatInput } from './ChatInput';
import { useToast } from '../ui';

export const ChatPage: React.FC = () => {
  // State
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [activeThreadId, setActiveThreadId] = useState<string | null>(null);
  const [threads, setThreads] = useState<ChatThread[]>([]);
  const [strategy, setStrategy] = useState<'hybrid' | 'vector'>('hybrid');
  const [rerank, setRerank] = useState(true);
  const [isSending, setIsSending] = useState(false);
  const [thinkingStage, setThinkingStage] = useState<ThinkingStage>(null);
  const [documentCount, setDocumentCount] = useState(0);
  const [foundCount, setFoundCount] = useState(0);
  const [autoScroll, setAutoScroll] = useState(true);
  const [isMobileSidebarOpen, setIsMobileSidebarOpen] = useState(false);

  // Refs
  const endRef = useRef<HTMLDivElement>(null);
  const messagesContainerRef = useRef<HTMLDivElement>(null);

  // Toast
  const toast = useToast();

  // Auto-scroll
  useEffect(() => {
    if (autoScroll) {
      endRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages, thinkingStage, autoScroll]);

  // Handle scroll
  const handleScroll = useCallback(() => {
    if (!messagesContainerRef.current) return;
    const { scrollTop, scrollHeight, clientHeight } = messagesContainerRef.current;
    const isAtBottom = scrollHeight - scrollTop - clientHeight < 100;
    setAutoScroll(isAtBottom);
  }, []);

  // Load initial data
  useEffect(() => {
    loadThreads();
    fetchDocumentCount();
  }, []);

  const fetchDocumentCount = async () => {
    try {
      const res = await fetch(API_ENDPOINTS.documentsStats);
      const data = await res.json();
      setDocumentCount(data.totalDocuments || 0);
    } catch (error) {
      console.error('Failed to fetch document count:', error);
    }
  };

  const loadThreads = async () => {
    try {
      const res = await fetch(`${API_ENDPOINTS.baseChat}/threads`);
      const data = await res.json();
      setThreads(data.threads || []);
    } catch (error) {
      console.error('Failed to load threads:', error);
    }
  };

  const loadMessages = async (threadId: string) => {
    try {
      const res = await fetch(`${API_ENDPOINTS.baseChat}/threads/${threadId}/messages`);
      const data = await res.json();
      const msgs: ChatMessage[] = (data.messages || []).map((m: any) => ({
        role: m.role,
        content: m.content,
        metadata: m.metadata,
        sources: extractSources(m.agentTrace),
        confidence: m.metadata?.confidence || 75,
        createdAt: m.createdAt,
      }));
      setMessages(msgs);
    } catch (error) {
      console.error('Failed to load messages:', error);
    }
  };

  const extractSources = (agentTrace: any[]): SourceInfo[] => {
    if (!agentTrace) return [];
    const chunksSummary = agentTrace.find((t: any) => t.step === 'chunks-summary');
    if (chunksSummary?.detail?.sources) {
      return chunksSummary.detail.sources.map((s: any) => ({
        documentName: s.doc,
        relevance: s.sim / 100,
        snippet: '',
      }));
    }
    return [];
  };

  const generateTitle = async (threadId: string, firstMessage: string) => {
    try {
      await fetch(`${API_ENDPOINTS.baseChat}/threads/${threadId}/generate-title`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ firstMessage }),
      });
      loadThreads();
    } catch (error) {
      console.error('Failed to generate title:', error);
    }
  };

  const startStream = async (prompt: string, threadId?: string) => {
    setThinkingStage('understanding');
    let fullAnswer = '';
    let sources: SourceInfo[] = [];
    let confidence = 75;
    let newThreadId: string | null = null;
    const isFirstMessage = !threadId;

    // Progress through thinking stages
    setTimeout(() => setThinkingStage('searching'), 800);

    const params = new URLSearchParams({
      query: prompt,
      strategy,
      rerank: String(rerank),
    });
    if (threadId) params.set('threadId', threadId);

    const url = `${API_ENDPOINTS.search}/agent/stream?${params.toString()}`;
    const es = new EventSource(url);

    es.addEventListener('thread', (e: MessageEvent) => {
      const data = JSON.parse(e.data);
      newThreadId = data.threadId;
      setActiveThreadId(data.threadId);
      loadThreads();
      if (isFirstMessage && newThreadId) {
        setTimeout(() => generateTitle(newThreadId!, prompt), 500);
      }
    });

    es.addEventListener('retrieval', (e: MessageEvent) => {
      const data = JSON.parse(e.data);
      setFoundCount(data.count || 0);
      setThinkingStage('found');
      setTimeout(() => setThinkingStage('composing'), 1000);
    });

    es.addEventListener('answer', (e: MessageEvent) => {
      const data = JSON.parse(e.data);
      fullAnswer += data.partial;
      setThinkingStage(null);

      // Update or create streaming message
      setMessages((prev) => {
        const existing = prev.find((m) => m.isStreaming);
        if (existing) {
          return prev.map((m) =>
            m.isStreaming ? { ...m, content: fullAnswer } : m
          );
        } else {
          return [
            ...prev,
            {
              role: 'assistant',
              content: fullAnswer,
              isStreaming: true,
              sources: [],
              confidence: 0,
            },
          ];
        }
      });
    });

    es.addEventListener('done', (e: MessageEvent) => {
      const data = JSON.parse(e.data);

      // Extract sources from trace
      sources = extractSources(data.agentTrace);

      // Extract confidence
      const qualityStep = data.agentTrace?.find(
        (t: any) => t.step === 'retrieval-quality'
      );
      if (qualityStep?.detail?.topSimilarity) {
        confidence = Math.min(qualityStep.detail.topSimilarity + 10, 99);
      }

      // Finalize message
      setMessages((prev) =>
        prev.map((m) =>
          m.isStreaming ? { ...m, isStreaming: false, sources, confidence } : m
        )
      );
      setThinkingStage(null);
      es.close();
    });

    es.addEventListener('error', (e: MessageEvent) => {
      try {
        const data = JSON.parse(e.data);
        setMessages((prev) => [
          ...prev.filter((m) => !m.isStreaming),
          {
            role: 'assistant',
            content: `Error: ${data.message}`,
            sources: [],
            confidence: 0,
          },
        ]);
        toast.error('Error', data.message);
      } catch {
        toast.error('Connection error', 'Failed to get response');
      }
      setThinkingStage(null);
      es.close();
    });

    es.onerror = () => {
      setThinkingStage(null);
      es.close();
    };
  };

  const handleSend = async () => {
    const text = input.trim();
    if (!text || isSending || thinkingStage) return;

    setIsSending(true);
    setAutoScroll(true);
    setMessages((prev) => [...prev, { role: 'user', content: text }]);
    setInput('');

    try {
      await startStream(text, activeThreadId || undefined);
    } finally {
      setIsSending(false);
    }
  };

  const handleNewChat = () => {
    setActiveThreadId(null);
    setMessages([]);
    setInput('');
    setThinkingStage(null);
    setIsMobileSidebarOpen(false);
  };

  const handleSelectThread = async (threadId: string) => {
    setActiveThreadId(threadId);
    setIsMobileSidebarOpen(false);
    await loadMessages(threadId);
  };

  const handleRenameThread = async (threadId: string, newTitle: string) => {
    try {
      await fetch(`${API_ENDPOINTS.baseChat}/threads/${threadId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: newTitle }),
      });
      loadThreads();
      toast.success('Renamed', 'Conversation renamed successfully');
    } catch (error) {
      toast.error('Error', 'Failed to rename conversation');
    }
  };

  const handleDeleteThread = async (threadId: string) => {
    try {
      await fetch(`${API_ENDPOINTS.baseChat}/threads/${threadId}`, {
        method: 'DELETE',
      });
      if (activeThreadId === threadId) {
        handleNewChat();
      }
      loadThreads();
      toast.success('Deleted', 'Conversation deleted');
    } catch (error) {
      toast.error('Error', 'Failed to delete conversation');
    }
  };

  const handleSuggestionClick = (suggestion: string) => {
    setInput(suggestion);
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    toast.success('Copied', 'Response copied to clipboard');
  };

  const scrollToBottom = () => {
    setAutoScroll(true);
    endRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  const showWelcome = messages.length === 0 && !activeThreadId && !thinkingStage;

  return (
    <div className="flex h-[calc(100vh-180px)] bg-secondary-50 dark:bg-secondary-950 rounded-xl overflow-hidden border border-secondary-200 dark:border-secondary-800 shadow-sm">
      {/* Mobile sidebar toggle */}
      <button
        onClick={() => setIsMobileSidebarOpen(!isMobileSidebarOpen)}
        className="lg:hidden fixed top-20 left-4 z-50 p-2 bg-white dark:bg-secondary-800 rounded-lg shadow-lg border border-secondary-200 dark:border-secondary-700"
      >
        {isMobileSidebarOpen ? (
          <X className="w-5 h-5" />
        ) : (
          <Menu className="w-5 h-5" />
        )}
      </button>

      {/* Sidebar - Desktop */}
      <div className="hidden lg:block">
        <ThreadSidebar
          threads={threads}
          activeThreadId={activeThreadId}
          onNewChat={handleNewChat}
          onSelectThread={handleSelectThread}
          onRenameThread={handleRenameThread}
          onDeleteThread={handleDeleteThread}
        />
      </div>

      {/* Sidebar - Mobile */}
      <AnimatePresence>
        {isMobileSidebarOpen && (
          <div className="lg:hidden fixed inset-0 z-40">
            <div
              className="absolute inset-0 bg-black/50"
              onClick={() => setIsMobileSidebarOpen(false)}
            />
            <div className="absolute left-0 top-0 h-full">
              <ThreadSidebar
                threads={threads}
                activeThreadId={activeThreadId}
                onNewChat={handleNewChat}
                onSelectThread={handleSelectThread}
                onRenameThread={handleRenameThread}
                onDeleteThread={handleDeleteThread}
              />
            </div>
          </div>
        )}
      </AnimatePresence>

      {/* Main Chat Area */}
      <div className="flex-1 flex flex-col bg-gradient-to-b from-white to-secondary-50 dark:from-secondary-900 dark:to-secondary-950">
        {/* Messages */}
        <div
          ref={messagesContainerRef}
          onScroll={handleScroll}
          className="flex-1 overflow-y-auto p-4 lg:p-6 scrollbar-thin"
        >
          {showWelcome ? (
            <WelcomeState
              onSuggestionClick={handleSuggestionClick}
              documentCount={documentCount}
            />
          ) : (
            <div className="max-w-3xl mx-auto space-y-6">
              {messages.map((message, idx) => (
                <div key={idx} className="group">
                  <MessageBubble
                    message={message}
                    onCopy={copyToClipboard}
                  />
                </div>
              ))}

              {thinkingStage && (
                <ThinkingIndicator
                  stage={thinkingStage}
                  documentCount={documentCount}
                  foundCount={foundCount}
                />
              )}

              <div ref={endRef} />
            </div>
          )}
        </div>

        {/* Scroll to bottom button */}
        {!autoScroll && !showWelcome && (
          <button
            onClick={scrollToBottom}
            className="absolute bottom-24 right-8 p-2 bg-white dark:bg-secondary-800 border border-secondary-200 dark:border-secondary-700 rounded-full shadow-lg hover:shadow-xl transition-shadow"
          >
            <ChevronDown className="w-5 h-5 text-secondary-600 dark:text-secondary-400" />
          </button>
        )}

        {/* Input Area */}
        <ChatInput
          value={input}
          onChange={setInput}
          onSend={handleSend}
          isLoading={isSending || !!thinkingStage}
          strategy={strategy}
          onStrategyChange={setStrategy}
          rerank={rerank}
          onRerankChange={setRerank}
        />
      </div>
    </div>
  );
};

export default ChatPage;
