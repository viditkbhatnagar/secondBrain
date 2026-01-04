import { rest } from 'msw';

const API_URL = 'http://localhost:3001/api';

// Mock data
const mockDocuments = [
  {
    _id: '1',
    id: '1',
    name: 'research-paper.pdf',
    originalName: 'research-paper.pdf',
    fileType: 'pdf',
    mimeType: 'application/pdf',
    fileSize: 1024000,
    wordCount: 5000,
    chunkCount: 45,
    uploadedAt: '2024-01-15T10:30:00Z',
    classification: { label: 'Research', confidence: 0.92 },
    entities: [
      { type: 'ORG', text: 'OpenAI' },
      { type: 'TECH', text: 'GPT-4' }
    ]
  },
  {
    _id: '2',
    id: '2',
    name: 'notes.md',
    originalName: 'notes.md',
    fileType: 'md',
    mimeType: 'text/markdown',
    fileSize: 5000,
    wordCount: 500,
    chunkCount: 3,
    uploadedAt: '2024-01-14T08:00:00Z',
    classification: { label: 'Notes', confidence: 0.85 },
    entities: []
  }
];

const mockStats = {
  totalDocuments: 10,
  totalChunks: 150,
  totalWords: 50000,
  totalSizeMB: 5.5,
  averageWordsPerDocument: 5000,
  recentUploads: 3,
  topTopics: ['AI', 'Machine Learning', 'Research']
};

const mockSearchResult = {
  answer: 'Based on your documents, the main recommendations are:\n\n1. **Implement user-centered design** - Focus on actual user needs\n2. **Use iterative testing** - Validate early and often\n3. **Document everything** - Keep clear records',
  confidence: 87,
  relevantChunks: [
    {
      content: 'User-centered design is crucial for product success...',
      documentName: 'research-paper.pdf',
      similarity: 0.95,
      chunkId: 'chunk-1'
    },
    {
      content: 'Iterative testing helps validate assumptions early...',
      documentName: 'notes.md',
      similarity: 0.82,
      chunkId: 'chunk-2'
    }
  ],
  sources: [
    {
      documentName: 'research-paper.pdf',
      content: 'User-centered design is crucial for product success...',
      relevance: 0.95
    }
  ],
  metadata: {
    strategy: 'hybrid',
    rerankUsed: true,
    rerankModel: 'cross-encoder'
  }
};

const mockThreads = [
  {
    threadId: 'thread-1',
    title: 'Research Discussion',
    strategy: 'hybrid',
    rerank: true,
    createdAt: '2024-01-15T10:00:00Z',
    updatedAt: '2024-01-15T12:00:00Z'
  }
];

const mockMessages = [
  {
    id: 'msg-1',
    role: 'user',
    content: 'What are the main findings?',
    timestamp: '2024-01-15T10:00:00Z'
  },
  {
    id: 'msg-2',
    role: 'assistant',
    content: 'The main findings include several key insights about user behavior and system design...',
    timestamp: '2024-01-15T10:00:05Z',
    metadata: { confidence: 85 }
  }
];

export const handlers = [
  // Health
  rest.get(`${API_URL}/health`, (_req, res, ctx) => {
    return res(ctx.json({
      status: 'healthy',
      timestamp: new Date().toISOString(),
      uptime: 86400,
      version: '2.0.0'
    }));
  }),

  // Documents
  rest.get(`${API_URL}/documents`, (_req, res, ctx) => {
    return res(ctx.json(mockDocuments));
  }),

  rest.get(`${API_URL}/documents/stats`, (_req, res, ctx) => {
    return res(ctx.json(mockStats));
  }),

  rest.get(`${API_URL}/documents/:id`, (req, res, ctx) => {
    const { id } = req.params;
    const doc = mockDocuments.find(d => d._id === id || d.id === id);
    if (doc) {
      return res(ctx.json(doc));
    }
    return res(ctx.status(404), ctx.json({ error: 'Document not found' }));
  }),

  rest.delete(`${API_URL}/documents/:id`, (_req, res, ctx) => {
    return res(ctx.json({ 
      success: true,
      message: 'Document deleted successfully',
      deletedVectors: 45
    }));
  }),

  // Search
  rest.post(`${API_URL}/search`, async (req, res, ctx) => {
    const body = await req.json();
    if (!body.query || body.query.trim() === '') {
      return res(ctx.status(400), ctx.json({
        error: { code: 'VALIDATION_ERROR', message: 'Query is required' }
      }));
    }
    return res(ctx.delay(100), ctx.json(mockSearchResult));
  }),

  rest.post(`${API_URL}/search/related-questions`, (_req, res, ctx) => {
    return res(ctx.json({
      questions: [
        'How to implement user-centered design?',
        'What are the best practices for iterative testing?',
        'How to document design decisions?'
      ]
    }));
  }),

  rest.post(`${API_URL}/search/agent`, async (req, res, ctx) => {
    const body = await req.json();
    return res(ctx.delay(200), ctx.json({
      threadId: body.threadId || 'new-thread-id',
      ...mockSearchResult,
      isFollowUp: false,
      agentTrace: []
    }));
  }),

  // Chat/Threads
  rest.get(`${API_URL}/chat/threads`, (_req, res, ctx) => {
    return res(ctx.json({ threads: mockThreads }));
  }),

  rest.post(`${API_URL}/chat/threads`, async (req, res, ctx) => {
    const body = await req.json();
    return res(ctx.json({
      threadId: 'new-thread-id',
      title: 'New Chat',
      strategy: body.strategy || 'hybrid',
      rerank: body.rerank !== false,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    }));
  }),

  rest.get(`${API_URL}/chat/threads/:threadId/messages`, (_req, res, ctx) => {
    return res(ctx.json({ messages: mockMessages }));
  }),

  rest.delete(`${API_URL}/chat/threads/:threadId`, (_req, res, ctx) => {
    return res(ctx.json({ success: true }));
  }),

  rest.patch(`${API_URL}/chat/threads/:threadId`, (_req, res, ctx) => {
    return res(ctx.json({ success: true }));
  }),

  // Upload
  rest.post(`${API_URL}/upload`, async (_req, res, ctx) => {
    return res(ctx.delay(500), ctx.json({
      success: true,
      document: mockDocuments[0],
      message: 'File uploaded successfully'
    }));
  })
];
