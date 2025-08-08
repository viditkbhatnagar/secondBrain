import React, { useEffect, useRef, useState } from 'react';
import { API_ENDPOINTS } from '../config/api';
import ThreadActions from './ThreadActions';
import AgentTrace from './AgentTrace';

interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
  metadata?: any;
  agentTrace?: any[];
  createdAt?: string;
}

interface ChatThread {
  threadId: string;
  title?: string;
  strategy: 'hybrid' | 'vector';
  rerank: boolean;
  messageCount: number;
  updatedAt: string;
}

export const Chat: React.FC = () => {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [threadId, setThreadId] = useState<string | undefined>(undefined);
  const [threads, setThreads] = useState<ChatThread[]>([]);
  const [strategy, setStrategy] = useState<'hybrid' | 'vector'>('hybrid');
  const [rerank, setRerank] = useState(true);
  const [isSending, setIsSending] = useState(false);
  const [isStreaming, setIsStreaming] = useState(false);
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => { endRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [messages]);
  useEffect(() => { loadThreads(); }, []);

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
        role: m.role,
        content: m.content,
        metadata: m.metadata,
        agentTrace: m.agentTrace,
        createdAt: m.createdAt,
      }));
      setMessages(msgs);
    } catch {}
  };

  const startStream = async (prompt: string) => {
    setIsStreaming(true);
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
      setThreadId(data.threadId);
      loadThreads();
    });

    es.addEventListener('step', () => {});

    es.addEventListener('clarify', (e: MessageEvent) => {
      const data = JSON.parse(e.data);
      setMessages(prev => [...prev, { role: 'assistant', content: `Clarifying question: ${data.question}` }]);
    });

    es.addEventListener('retrieval', (e: MessageEvent) => {
      const data = JSON.parse(e.data);
      setMessages(prev => [...prev, { role: 'assistant', content: `Retrieval: strategy=${data.strategy}, rerank=${data.rerank ? 'on' : 'off'}, hits=${data.count}` }]);
    });

    es.addEventListener('answer', (e: MessageEvent) => {
      const data = JSON.parse(e.data);
      setMessages(prev => [...prev, { role: 'assistant', content: data.partial }]);
    });

    es.addEventListener('done', (e: MessageEvent) => {
      const data = JSON.parse(e.data);
      if (data.agentTrace) {
        setMessages(prev => [...prev, { role: 'assistant', content: `Trace steps: ${data.agentTrace.length}` }]);
      }
      es.close();
      setIsStreaming(false);
    });

    es.addEventListener('error', (e: MessageEvent) => {
      try { const data = JSON.parse(e.data); setMessages(prev => [...prev, { role: 'assistant', content: `Error: ${data.message}` }]); } catch {}
      es.close();
      setIsStreaming(false);
    });
  };

  const send = async () => {
    const text = input.trim();
    if (!text || isSending || isStreaming) return;
    setIsSending(true);
    setMessages(prev => [...prev, { role: 'user', content: text }]);
    setInput('');
    try {
      await startStream(text);
    } finally {
      setIsSending(false);
    }
  };

  const newThread = async () => {
    try {
      const res = await fetch(`${API_ENDPOINTS.baseChat}/threads`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ strategy, rerank }) });
      const data = await res.json();
      setThreadId(data.threadId);
      setMessages([]);
      loadThreads();
    } catch {}
  };

  const selectThread = async (tid: string) => {
    setThreadId(tid);
    await loadMessages(tid);
  };

  return (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
      <div className="md:col-span-1 bg-white border rounded-lg p-3 h-[70vh] overflow-y-auto">
        <div className="flex items-center justify-between mb-2">
          <div className="text-sm font-semibold">Threads</div>
          <button onClick={newThread} className="text-xs px-2 py-1 bg-blue-600 text-white rounded">New</button>
        </div>
        <div className="space-y-2">
          {threads.map(t => (
            <button key={t.threadId} onClick={() => selectThread(t.threadId)}
              className={`w-full text-left px-2 py-2 rounded border ${threadId===t.threadId ? 'border-blue-500 bg-blue-50' : 'border-gray-200 hover:bg-gray-50'}`}>
              <div className="text-sm truncate">{t.title || t.threadId}</div>
              <div className="text-xs text-gray-500">{t.strategy} • {t.rerank ? 'rerank' : 'no-rerank'} • {t.messageCount} msgs</div>
            </button>
          ))}
        </div>
      </div>

      <div className="md:col-span-2">
        <div className="bg-white border rounded-lg p-4 h-[60vh] overflow-y-auto">
          {messages.map((m, i) => (
            <div key={i} className={`mb-4 ${m.role === 'user' ? 'text-right' : 'text-left'}`}>
              <div className={`inline-block px-3 py-2 rounded-md ${m.role === 'user' ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-800'}`}>
                <div className="whitespace-pre-wrap">{m.content}</div>
                {m.metadata && (
                  <div className="mt-1 text-xs opacity-80">
                    Strategy: {m.metadata.strategy || 'vector'}{', '}Rerank: {m.metadata.rerankUsed ? 'on' : 'off'}
                  </div>
                )}
                {/* Render trace details if available */}
                {Array.isArray(m.agentTrace) && m.agentTrace.length > 0 && (
                  <AgentTrace trace={m.agentTrace} />
                )}
              </div>
            </div>
          ))}
          <div ref={endRef} />
        </div>

        <div className="mt-3 flex items-center space-x-2">
          <select value={strategy} onChange={(e) => setStrategy(e.target.value as 'hybrid' | 'vector')} className="text-sm border rounded px-2 py-1">
            <option value="hybrid">Hybrid</option>
            <option value="vector">Vector</option>
          </select>
          <label className="text-sm text-gray-700 flex items-center">
            <input type="checkbox" className="mr-1" checked={rerank} onChange={(e) => setRerank(e.target.checked)} /> Rerank
          </label>
          {threadId && (
            <ThreadActions threadId={threadId} refreshThreads={loadThreads} />
          )}
        </div>

        <div className="mt-2 flex">
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') send(); }}
            className="flex-1 border rounded-l px-3 py-2"
            placeholder="Ask anything about your documents..."
          />
          <button onClick={send} disabled={isSending || isStreaming || !input.trim()} className="px-4 py-2 bg-blue-600 text-white rounded-r disabled:bg-gray-400">
            {isSending || isStreaming ? 'Sending...' : 'Send'}
          </button>
        </div>
      </div>
    </div>
  );
};

export default Chat;


