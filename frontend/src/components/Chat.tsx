import React, { useEffect, useRef, useState, useCallback } from 'react';
import { API_ENDPOINTS } from '../config/api';
import { 
  PenSquare, Trash2, Edit3, MoreHorizontal, X, Check, MessageSquare, 
  Brain, Search, FileText, Sparkles, ChevronDown, ChevronUp, Copy,
  RefreshCw, ThumbsUp, ThumbsDown, Bot, User, Loader2
} from 'lucide-react';

interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
  metadata?: any;
  sources?: SourceInfo[];
  confidence?: number;
  isStreaming?: boolean;
  createdAt?: string;
}

interface SourceInfo {
  documentName: string;
  relevance: number;
  snippet?: string;
}

interface ChatThread {
  threadId: string;
  title?: string;
  strategy: 'hybrid' | 'vector';
  rerank: boolean;
  messageCount: number;
  createdAt: string;
  updatedAt: string;
}

interface GroupedThreads {
  today: ChatThread[];
  yesterday: ChatThread[];
  previous7Days: ChatThread[];
  previous30Days: ChatThread[];
  older: ChatThread[];
}

type ThinkingStage = 'understanding' | 'searching' | 'found' | 'composing' | null;

const groupThreadsByDate = (threads: ChatThread[]): GroupedThreads => {
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const yesterday = new Date(today); yesterday.setDate(yesterday.getDate() - 1);
  const sevenDaysAgo = new Date(today); sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
  const thirtyDaysAgo = new Date(today); thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

  const groups: GroupedThreads = { today: [], yesterday: [], previous7Days: [], previous30Days: [], older: [] };
  threads.forEach(thread => {
    const threadDate = new Date(thread.createdAt);
    if (threadDate >= today) groups.today.push(thread);
    else if (threadDate >= yesterday) groups.yesterday.push(thread);
    else if (threadDate >= sevenDaysAgo) groups.previous7Days.push(thread);
    else if (threadDate >= thirtyDaysAgo) groups.previous30Days.push(thread);
    else groups.older.push(thread);
  });
  return groups;
};

// Thinking Indicator Component
const ThinkingIndicator: React.FC<{ stage: ThinkingStage; documentCount?: number; foundCount?: number }> = ({ 
  stage, documentCount = 0, foundCount = 0 
}) => {
  const stages = [
    { key: 'understanding', icon: Brain, text: 'Understanding your question...', color: 'text-purple-500' },
    { key: 'searching', icon: Search, text: `Searching through ${documentCount} documents...`, color: 'text-blue-500' },
    { key: 'found', icon: FileText, text: `Found ${foundCount} relevant sections`, color: 'text-green-500' },
    { key: 'composing', icon: Sparkles, text: 'Composing answer...', color: 'text-amber-500' },
  ];
  const current = stages.find(s => s.key === stage) || stages[0];
  const Icon = current.icon;

  return (
    <div className="flex items-start gap-3 animate-fadeIn">
      <div className="w-8 h-8 rounded-full bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center flex-shrink-0 animate-pulse">
        <Bot className="w-5 h-5 text-white" />
      </div>
      <div className="flex-1 bg-gray-50 rounded-2xl rounded-tl-md p-4 max-w-[80%]">
        <div className="flex items-center gap-3">
          <div className={`${current.color} animate-bounce`}><Icon className="w-5 h-5" /></div>
          <span className="text-gray-700 text-sm font-medium">{current.text}</span>
        </div>
        <div className="mt-3 h-1.5 bg-gray-200 rounded-full overflow-hidden">
          <div className="h-full bg-gradient-to-r from-blue-500 via-purple-500 to-blue-500 rounded-full animate-shimmer" 
               style={{ width: '100%', backgroundSize: '200% 100%' }} />
        </div>
      </div>
    </div>
  );
};

// Sources Accordion Component
const SourcesAccordion: React.FC<{ sources: SourceInfo[]; confidence: number }> = ({ sources, confidence }) => {
  const [expanded, setExpanded] = useState(false);
  const confidenceColor = confidence >= 70 ? 'text-green-600 bg-green-50' : confidence >= 50 ? 'text-amber-600 bg-amber-50' : 'text-red-600 bg-red-50';
  const confidenceBarColor = confidence >= 70 ? 'bg-green-500' : confidence >= 50 ? 'bg-amber-500' : 'bg-red-500';

  return (
    <div className="mt-4 border border-gray-200 rounded-xl overflow-hidden">
      <button onClick={() => setExpanded(!expanded)}
        className="w-full px-4 py-3 flex items-center justify-between bg-gray-50 hover:bg-gray-100 transition-colors">
        <div className="flex items-center gap-3">
          <FileText className="w-4 h-4 text-gray-500" />
          <span className="text-sm font-medium text-gray-700">{sources.length} sources used</span>
          <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${confidenceColor}`}>{confidence}% confidence</span>
        </div>
        {expanded ? <ChevronUp className="w-4 h-4 text-gray-500" /> : <ChevronDown className="w-4 h-4 text-gray-500" />}
      </button>
      {expanded && (
        <div className="p-4 space-y-3 bg-white animate-fadeIn">
          {sources.map((source, idx) => (
            <div key={idx} className="p-3 bg-gray-50 rounded-lg">
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm font-medium text-gray-800">{idx + 1}. {source.documentName}</span>
                <span className="text-xs text-gray-500">{Math.round(source.relevance * 100)}%</span>
              </div>
              {source.snippet && <p className="text-xs text-gray-600 line-clamp-2 italic">"{source.snippet}"</p>}
              <div className="mt-2 h-1.5 bg-gray-200 rounded-full overflow-hidden">
                <div className={`h-full ${confidenceBarColor} rounded-full transition-all duration-500`} 
                     style={{ width: `${source.relevance * 100}%` }} />
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

// Message Actions Component
const MessageActions: React.FC<{ onCopy: () => void; onRegenerate?: () => void }> = ({ onCopy, onRegenerate }) => {
  const [copied, setCopied] = useState(false);
  const handleCopy = () => { onCopy(); setCopied(true); setTimeout(() => setCopied(false), 2000); };

  return (
    <div className="flex items-center gap-1 mt-3 opacity-0 group-hover:opacity-100 transition-opacity">
      <button onClick={handleCopy} className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-500 hover:text-gray-700 transition-colors"
        title="Copy response">
        {copied ? <Check className="w-4 h-4 text-green-500" /> : <Copy className="w-4 h-4" />}
      </button>
      {onRegenerate && (
        <button onClick={onRegenerate} className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-500 hover:text-gray-700 transition-colors"
          title="Regenerate"><RefreshCw className="w-4 h-4" /></button>
      )}
      <button className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-500 hover:text-green-600 transition-colors" title="Good response">
        <ThumbsUp className="w-4 h-4" />
      </button>
      <button className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-500 hover:text-red-600 transition-colors" title="Poor response">
        <ThumbsDown className="w-4 h-4" />
      </button>
    </div>
  );
};

// Typewriter Text Component
const TypewriterText: React.FC<{ text: string; isStreaming: boolean }> = ({ text, isStreaming }) => {
  const [displayedText, setDisplayedText] = useState('');
  const [currentIndex, setCurrentIndex] = useState(0);

  useEffect(() => {
    if (currentIndex < text.length) {
      const charsToAdd = Math.min(3, text.length - currentIndex);
      const timeout = setTimeout(() => {
        setDisplayedText(text.slice(0, currentIndex + charsToAdd));
        setCurrentIndex(prev => prev + charsToAdd);
      }, 15);
      return () => clearTimeout(timeout);
    }
  }, [currentIndex, text]);

  useEffect(() => { setDisplayedText(''); setCurrentIndex(0); }, []);

  return (
    <div className="whitespace-pre-wrap text-sm text-gray-800 leading-relaxed">
      {displayedText || text}
      {isStreaming && currentIndex < text.length && <span className="inline-block w-2 h-4 bg-blue-500 ml-0.5 animate-blink" />}
    </div>
  );
};

// Main Chat Component
export const Chat: React.FC = () => {
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
  const [editingThreadId, setEditingThreadId] = useState<string | null>(null);
  const [editTitle, setEditTitle] = useState('');
  const [menuOpenThreadId, setMenuOpenThreadId] = useState<string | null>(null);
  const [autoScroll, setAutoScroll] = useState(true);
  const endRef = useRef<HTMLDivElement>(null);
  const messagesContainerRef = useRef<HTMLDivElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  // Auto-scroll logic
  useEffect(() => {
    if (autoScroll) endRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, thinkingStage, autoScroll]);

  // Handle scroll to detect manual scrolling
  const handleScroll = useCallback(() => {
    if (!messagesContainerRef.current) return;
    const { scrollTop, scrollHeight, clientHeight } = messagesContainerRef.current;
    const isAtBottom = scrollHeight - scrollTop - clientHeight < 100;
    setAutoScroll(isAtBottom);
  }, []);

  useEffect(() => { loadThreads(); fetchDocumentCount(); }, []);
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setMenuOpenThreadId(null);
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const fetchDocumentCount = async () => {
    try {
      const res = await fetch(API_ENDPOINTS.documentsStats);
      const data = await res.json();
      setDocumentCount(data.totalDocuments || 0);
    } catch {}
  };

  const loadThreads = async () => {
    try {
      const res = await fetch(`${API_ENDPOINTS.baseChat}/threads`);
      const data = await res.json();
      setThreads(data.threads || []);
    } catch {}
  };

  const loadMessages = async (tid: string) => {
    try {
      const res = await fetch(`${API_ENDPOINTS.baseChat}/threads/${tid}/messages`);
      const data = await res.json();
      const msgs: ChatMessage[] = (data.messages || []).map((m: any) => ({
        role: m.role, content: m.content, metadata: m.metadata,
        sources: m.agentTrace?.find((t: any) => t.step === 'chunks-summary')?.detail?.sources?.map((s: any) => ({
          documentName: s.doc, relevance: s.sim / 100, snippet: ''
        })) || [],
        confidence: m.metadata?.confidence || 75,
        createdAt: m.createdAt,
      }));
      setMessages(msgs);
    } catch {}
  };

  const generateTitle = async (threadId: string, firstMessage: string) => {
    try {
      await fetch(`${API_ENDPOINTS.baseChat}/threads/${threadId}/generate-title`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ firstMessage })
      });
      loadThreads();
    } catch {}
  };

  const startStream = async (prompt: string, tid?: string) => {
    setThinkingStage('understanding');
    let fullAnswer = '';
    let sources: SourceInfo[] = [];
    let confidence = 75;
    let newThreadId: string | null = null;
    const isFirstMessage = !tid;

    // Simulate thinking stages
    setTimeout(() => setThinkingStage('searching'), 800);

    const params = new URLSearchParams({ query: prompt, strategy, rerank: String(rerank) });
    if (tid) params.set('threadId', tid);
    const url = `${API_ENDPOINTS.search}/agent/stream?${params.toString()}`;
    const es = new EventSource(url);

    es.addEventListener('thread', (e: MessageEvent) => {
      const data = JSON.parse(e.data);
      newThreadId = data.threadId;
      setActiveThreadId(data.threadId);
      loadThreads();
      if (isFirstMessage && newThreadId) setTimeout(() => generateTitle(newThreadId!, prompt), 500);
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
      // Update the streaming message
      setMessages(prev => {
        const existing = prev.find(m => m.isStreaming);
        if (existing) {
          return prev.map(m => m.isStreaming ? { ...m, content: fullAnswer } : m);
        } else {
          return [...prev, { role: 'assistant', content: fullAnswer, isStreaming: true, sources: [], confidence: 0 }];
        }
      });
    });

    es.addEventListener('done', (e: MessageEvent) => {
      const data = JSON.parse(e.data);
      // Extract sources from trace
      const chunksSummary = data.agentTrace?.find((t: any) => t.step === 'chunks-summary');
      if (chunksSummary?.detail?.sources) {
        sources = chunksSummary.detail.sources.map((s: any) => ({
          documentName: s.doc, relevance: s.sim / 100, snippet: ''
        }));
      }
      const qualityStep = data.agentTrace?.find((t: any) => t.step === 'retrieval-quality');
      if (qualityStep?.detail?.topSimilarity) confidence = Math.min(qualityStep.detail.topSimilarity + 10, 99);

      // Finalize the message
      setMessages(prev => prev.map(m => m.isStreaming ? { ...m, isStreaming: false, sources, confidence } : m));
      setThinkingStage(null);
      es.close();
    });

    es.addEventListener('error', (e: MessageEvent) => {
      try {
        const data = JSON.parse(e.data);
        setMessages(prev => [...prev.filter(m => !m.isStreaming), { role: 'assistant', content: `Error: ${data.message}`, sources: [], confidence: 0 }]);
      } catch {}
      setThinkingStage(null);
      es.close();
    });
  };

  const send = async () => {
    const text = input.trim();
    if (!text || isSending || thinkingStage) return;
    setIsSending(true);
    setAutoScroll(true);
    setMessages(prev => [...prev, { role: 'user', content: text }]);
    setInput('');
    try { await startStream(text, activeThreadId || undefined); }
    finally { setIsSending(false); }
  };

  const newChat = () => { setActiveThreadId(null); setMessages([]); setInput(''); setThinkingStage(null); };
  const selectThread = async (tid: string) => { setActiveThreadId(tid); setMenuOpenThreadId(null); await loadMessages(tid); };
  const deleteThread = async (tid: string) => {
    if (!window.confirm('Delete this thread?')) return;
    try { await fetch(`${API_ENDPOINTS.baseChat}/threads/${tid}`, { method: 'DELETE' }); if (activeThreadId === tid) newChat(); loadThreads(); } catch {}
    setMenuOpenThreadId(null);
  };
  const startRename = (thread: ChatThread) => { setEditingThreadId(thread.threadId); setEditTitle(thread.title || ''); setMenuOpenThreadId(null); };
  const saveRename = async () => {
    if (!editingThreadId) return;
    try { await fetch(`${API_ENDPOINTS.baseChat}/threads/${editingThreadId}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ title: editTitle }) }); loadThreads(); } catch {}
    setEditingThreadId(null); setEditTitle('');
  };
  const cancelRename = () => { setEditingThreadId(null); setEditTitle(''); };
  const copyToClipboard = (text: string) => { navigator.clipboard.writeText(text); };
  const getThreadDisplayTitle = (thread: ChatThread) => thread.title || 'New Chat';
  const groupedThreads = groupThreadsByDate(threads);

  const renderThreadGroup = (label: string, threadList: ChatThread[]) => {
    if (threadList.length === 0) return null;
    return (
      <div className="mb-4">
        <div className="text-xs font-semibold text-gray-500 uppercase tracking-wide px-2 mb-2">{label}</div>
        {threadList.map(t => (
          <div key={t.threadId} className="relative group">
            {editingThreadId === t.threadId ? (
              <div className="flex items-center px-2 py-2 gap-1">
                <input value={editTitle} onChange={(e) => setEditTitle(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter') saveRename(); if (e.key === 'Escape') cancelRename(); }}
                  className="flex-1 text-sm border rounded px-2 py-1 focus:outline-none focus:ring-1 focus:ring-blue-500" autoFocus />
                <button onClick={saveRename} className="p-1 text-green-600 hover:bg-green-50 rounded"><Check className="w-4 h-4" /></button>
                <button onClick={cancelRename} className="p-1 text-gray-500 hover:bg-gray-100 rounded"><X className="w-4 h-4" /></button>
              </div>
            ) : (
              <button onClick={() => selectThread(t.threadId)}
                className={`w-full text-left px-3 py-2 rounded-lg flex items-center justify-between transition-colors ${activeThreadId === t.threadId ? 'bg-blue-50 text-blue-700' : 'hover:bg-gray-100 text-gray-700'}`}>
                <div className="flex items-center gap-2 min-w-0 flex-1">
                  <MessageSquare className="w-4 h-4 flex-shrink-0 opacity-60" />
                  <span className="text-sm truncate">{getThreadDisplayTitle(t)}</span>
                </div>
                <div className="relative" ref={menuOpenThreadId === t.threadId ? menuRef : null}>
                  <button onClick={(e) => { e.stopPropagation(); setMenuOpenThreadId(menuOpenThreadId === t.threadId ? null : t.threadId); }}
                    className="p-1 opacity-0 group-hover:opacity-100 hover:bg-gray-200 rounded transition-opacity">
                    <MoreHorizontal className="w-4 h-4" />
                  </button>
                  {menuOpenThreadId === t.threadId && (
                    <div className="absolute right-0 top-full mt-1 bg-white border rounded-lg shadow-lg py-1 z-10 min-w-[120px]">
                      <button onClick={(e) => { e.stopPropagation(); startRename(t); }}
                        className="w-full text-left px-3 py-2 text-sm hover:bg-gray-100 flex items-center gap-2">
                        <Edit3 className="w-4 h-4" /> Rename
                      </button>
                      <button onClick={(e) => { e.stopPropagation(); deleteThread(t.threadId); }}
                        className="w-full text-left px-3 py-2 text-sm hover:bg-gray-100 text-red-600 flex items-center gap-2">
                        <Trash2 className="w-4 h-4" /> Delete
                      </button>
                    </div>
                  )}
                </div>
              </button>
            )}
          </div>
        ))}
      </div>
    );
  };

  const formatTime = (dateStr?: string) => {
    if (!dateStr) return '';
    return new Date(dateStr).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  };

  return (
    <div className="flex h-[calc(100vh-200px)] bg-gray-50 rounded-xl overflow-hidden border shadow-sm">
      {/* Sidebar */}
      <div className="w-64 bg-white border-r flex flex-col">
        <div className="p-3 border-b">
          <button onClick={newChat}
            className="w-full flex items-center justify-center gap-2 px-4 py-2.5 bg-gradient-to-r from-blue-600 to-blue-700 text-white rounded-xl hover:from-blue-700 hover:to-blue-800 transition-all font-medium shadow-sm hover:shadow">
            <PenSquare className="w-4 h-4" /> New Chat
          </button>
        </div>
        <div className="flex-1 overflow-y-auto p-2">
          {threads.length === 0 ? (
            <div className="text-center text-gray-500 text-sm py-8">No conversations yet</div>
          ) : (
            <>
              {renderThreadGroup('Today', groupedThreads.today)}
              {renderThreadGroup('Yesterday', groupedThreads.yesterday)}
              {renderThreadGroup('Previous 7 Days', groupedThreads.previous7Days)}
              {renderThreadGroup('Previous 30 Days', groupedThreads.previous30Days)}
              {renderThreadGroup('Older', groupedThreads.older)}
            </>
          )}
        </div>
      </div>

      {/* Main Chat Area */}
      <div className="flex-1 flex flex-col bg-gradient-to-b from-white to-gray-50">
        {/* Messages */}
        <div ref={messagesContainerRef} onScroll={handleScroll} className="flex-1 overflow-y-auto p-6">
          {messages.length === 0 && !activeThreadId && !thinkingStage ? (
            <div className="h-full flex flex-col items-center justify-center text-gray-500">
              <div className="w-20 h-20 rounded-full bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center mb-6 shadow-lg">
                <Bot className="w-10 h-10 text-white" />
              </div>
              <h2 className="text-2xl font-semibold text-gray-700 mb-2">How can I help you today?</h2>
              <p className="text-sm text-gray-500 max-w-md text-center">Ask me anything about your documents. I'll search through your knowledge base and provide accurate answers with sources.</p>
            </div>
          ) : (
            <div className="max-w-3xl mx-auto space-y-6">
              {messages.map((m, i) => (
                <div key={i} className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'} animate-slideIn group`}>
                  {m.role === 'assistant' && (
                    <div className="w-8 h-8 rounded-full bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center flex-shrink-0 mr-3 shadow-sm">
                      <Bot className="w-5 h-5 text-white" />
                    </div>
                  )}
                  <div className={`max-w-[80%] ${m.role === 'user' ? 'order-1' : ''}`}>
                    <div className={`px-4 py-3 rounded-2xl shadow-sm ${m.role === 'user' ? 'bg-gradient-to-r from-blue-600 to-blue-700 text-white rounded-br-md' : 'bg-white text-gray-800 rounded-tl-md border border-gray-100'}`}>
                      {m.role === 'assistant' && m.isStreaming ? (
                        <TypewriterText text={m.content} isStreaming={true} />
                      ) : (
                        <div className="whitespace-pre-wrap text-sm leading-relaxed">{m.content}</div>
                      )}
                    </div>
                    {m.role === 'assistant' && !m.isStreaming && m.sources && m.sources.length > 0 && (
                      <SourcesAccordion sources={m.sources} confidence={m.confidence || 75} />
                    )}
                    {m.role === 'assistant' && !m.isStreaming && (
                      <MessageActions onCopy={() => copyToClipboard(m.content)} />
                    )}
                    {m.createdAt && <div className="text-xs text-gray-400 mt-1 px-1">{formatTime(m.createdAt)}</div>}
                  </div>
                  {m.role === 'user' && (
                    <div className="w-8 h-8 rounded-full bg-gray-200 flex items-center justify-center flex-shrink-0 ml-3 shadow-sm">
                      <User className="w-5 h-5 text-gray-600" />
                    </div>
                  )}
                </div>
              ))}
              {thinkingStage && <ThinkingIndicator stage={thinkingStage} documentCount={documentCount} foundCount={foundCount} />}
              <div ref={endRef} />
            </div>
          )}
        </div>

        {/* Scroll to bottom button */}
        {!autoScroll && (
          <button onClick={() => { setAutoScroll(true); endRef.current?.scrollIntoView({ behavior: 'smooth' }); }}
            className="absolute bottom-24 right-8 p-2 bg-white border rounded-full shadow-lg hover:shadow-xl transition-shadow">
            <ChevronDown className="w-5 h-5 text-gray-600" />
          </button>
        )}

        {/* Input Area */}
        <div className="border-t p-4 bg-white">
          <div className="max-w-3xl mx-auto">
            <div className="flex items-center gap-4 mb-3">
              <select value={strategy} onChange={(e) => setStrategy(e.target.value as 'hybrid' | 'vector')}
                className="text-sm border rounded-lg px-3 py-1.5 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 shadow-sm">
                <option value="hybrid">Hybrid Search</option>
                <option value="vector">Vector Search</option>
              </select>
              <label className="text-sm text-gray-600 flex items-center gap-2 cursor-pointer">
                <input type="checkbox" className="w-4 h-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500" checked={rerank} onChange={(e) => setRerank(e.target.checked)} />
                Rerank Results
              </label>
            </div>
            <div className="flex gap-2">
              <div className="flex-1 relative">
                <input value={input} onChange={(e) => setInput(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); } }}
                  className="w-full border rounded-xl px-4 py-3 pr-12 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent shadow-sm"
                  placeholder="Ask anything about your documents..." disabled={isSending || !!thinkingStage} />
                {(isSending || thinkingStage) && (
                  <div className="absolute right-4 top-1/2 -translate-y-1/2">
                    <Loader2 className="w-5 h-5 text-blue-500 animate-spin" />
                  </div>
                )}
              </div>
              <button onClick={send} disabled={isSending || !!thinkingStage || !input.trim()}
                className="px-6 py-3 bg-gradient-to-r from-blue-600 to-blue-700 text-white rounded-xl hover:from-blue-700 hover:to-blue-800 disabled:from-gray-300 disabled:to-gray-400 disabled:cursor-not-allowed transition-all font-medium shadow-sm hover:shadow flex items-center gap-2">
                {isSending || thinkingStage ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
                {isSending || thinkingStage ? 'Thinking...' : 'Send'}
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* CSS Animations */}
      <style>{`
        @keyframes shimmer { 0% { background-position: 200% 0; } 100% { background-position: -200% 0; } }
        @keyframes blink { 0%, 50% { opacity: 1; } 51%, 100% { opacity: 0; } }
        @keyframes fadeIn { from { opacity: 0; transform: translateY(10px); } to { opacity: 1; transform: translateY(0); } }
        @keyframes slideIn { from { opacity: 0; transform: translateX(10px); } to { opacity: 1; transform: translateX(0); } }
        .animate-shimmer { animation: shimmer 2s infinite linear; }
        .animate-blink { animation: blink 1s infinite; }
        .animate-fadeIn { animation: fadeIn 0.3s ease-out; }
        .animate-slideIn { animation: slideIn 0.3s ease-out; }
      `}</style>
    </div>
  );
};

export default Chat;
