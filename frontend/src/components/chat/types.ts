export interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
  metadata?: Record<string, unknown>;
  sources?: SourceInfo[];
  confidence?: number;
  isStreaming?: boolean;
  createdAt?: string;
}

export interface SourceInfo {
  documentName: string;
  relevance: number;
  snippet?: string;
}

export interface ChatThread {
  threadId: string;
  title?: string;
  strategy: 'hybrid' | 'vector';
  rerank: boolean;
  messageCount: number;
  createdAt: string;
  updatedAt: string;
}

export interface GroupedThreads {
  today: ChatThread[];
  yesterday: ChatThread[];
  previous7Days: ChatThread[];
  previous30Days: ChatThread[];
  older: ChatThread[];
}

export type ThinkingStage = 'understanding' | 'searching' | 'found' | 'composing' | null;

export const SUGGESTION_PROMPTS = [
  "What are the main findings in my documents?",
  "Summarize the key recommendations",
  "Explain the methodology used",
  "What are the most important topics?",
];
