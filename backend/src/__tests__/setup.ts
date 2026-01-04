import { MongoMemoryServer } from 'mongodb-memory-server';
import mongoose from 'mongoose';

let mongoServer: MongoMemoryServer;

beforeAll(async () => {
  mongoServer = await MongoMemoryServer.create();
  const mongoUri = mongoServer.getUri();
  await mongoose.connect(mongoUri);
});

afterAll(async () => {
  await mongoose.disconnect();
  await mongoServer.stop();
});

afterEach(async () => {
  const collections = mongoose.connection.collections;
  for (const key in collections) {
    await collections[key].deleteMany({});
  }
});

// Mock external services
jest.mock('../services/ClaudeService', () => ({
  ClaudeService: {
    initialize: jest.fn(),
    generateEmbedding: jest.fn().mockResolvedValue(new Array(1536).fill(0.1)),
    generateEmbeddings: jest.fn().mockResolvedValue([new Array(1536).fill(0.1)]),
    answerQuestion: jest.fn().mockResolvedValue({
      answer: 'Test answer based on the documents.',
      confidence: 85,
      sources: []
    }),
    generateRelatedQuestions: jest.fn().mockResolvedValue([
      'What are the key findings?',
      'How does this compare to alternatives?',
      'What are the next steps?'
    ]),
    resolveFollowUpQuery: jest.fn().mockResolvedValue({
      resolvedQuery: 'test query',
      searchQueries: ['test query'],
      isFollowUp: false
    }),
    generateThreadTitle: jest.fn().mockResolvedValue('Test Thread Title')
  }
}));

// Mock Redis service
jest.mock('../services/RedisService', () => ({
  redisService: {
    initialize: jest.fn().mockResolvedValue(undefined),
    isAvailable: jest.fn().mockReturnValue(false),
    get: jest.fn().mockResolvedValue(null),
    set: jest.fn().mockResolvedValue(true),
    del: jest.fn().mockResolvedValue(true),
    getStats: jest.fn().mockResolvedValue({ connected: false })
  },
  CACHE_TTL: {
    EMBEDDING: 2592000,
    SEARCH: 300,
    STATS: 900,
    AI_RESPONSE: 3600,
    DOCUMENT: 600,
    ROUTE: 300
  },
  CACHE_PREFIX: {
    EMBEDDING: 'emb:',
    SEARCH: 'search:',
    STATS: 'stats:',
    AI_RESPONSE: 'ai:',
    DOCUMENT: 'doc:',
    ROUTE: 'route:'
  }
}));

// Mock logger to reduce noise in tests
jest.mock('../utils/logger', () => ({
  logger: {
    info: jest.fn(),
    error: jest.fn(),
    warn: jest.fn(),
    debug: jest.fn()
  }
}));

// Set test environment variables
process.env.NODE_ENV = 'test';
process.env.ANTHROPIC_API_KEY = 'test-anthropic-key';
process.env.OPENAI_API_KEY = 'test-openai-key';
