import swaggerJsdoc from 'swagger-jsdoc';

const options: swaggerJsdoc.Options = {
  definition: {
    openapi: '3.0.0',
    info: {
      title: 'Knowledge Base API',
      version: '2.0.0',
      description: 'AI-powered Personal Knowledge Base with RAG capabilities. Features semantic search, document management, and conversational AI.',
      contact: {
        name: 'API Support',
        email: 'support@example.com'
      },
      license: {
        name: 'MIT',
        url: 'https://opensource.org/licenses/MIT'
      }
    },
    servers: [
      {
        url: 'http://localhost:3001/api',
        description: 'Development server'
      },
      {
        url: 'https://api.yourdomain.com/api',
        description: 'Production server'
      }
    ],
    components: {
      schemas: {
        Error: {
          type: 'object',
          properties: {
            success: { type: 'boolean', example: false },
            error: {
              type: 'object',
              properties: {
                code: { type: 'string', example: 'VALIDATION_ERROR' },
                message: { type: 'string', example: 'Invalid input data' },
                requestId: { type: 'string', format: 'uuid' }
              }
            }
          }
        },
        Document: {
          type: 'object',
          properties: {
            id: { type: 'string' },
            originalName: { type: 'string', example: 'research-paper.pdf' },
            filename: { type: 'string' },
            mimeType: { type: 'string', example: 'application/pdf' },
            wordCount: { type: 'number', example: 5000 },
            chunkCount: { type: 'number', example: 45 },
            uploadedAt: { type: 'string', format: 'date-time' },
            classification: {
              type: 'object',
              properties: {
                label: { type: 'string' },
                confidence: { type: 'number' }
              }
            },
            entities: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  type: { type: 'string' },
                  text: { type: 'string' }
                }
              }
            }
          }
        },
        DocumentStats: {
          type: 'object',
          properties: {
            totalDocuments: { type: 'number', example: 25 },
            totalChunks: { type: 'number', example: 450 },
            totalWords: { type: 'number', example: 125000 },
            totalSizeMB: { type: 'number', example: 15.5 },
            averageWordsPerDocument: { type: 'number', example: 5000 },
            recentUploads: { type: 'number', example: 5 },
            topTopics: {
              type: 'array',
              items: { type: 'string' }
            }
          }
        },
        SearchRequest: {
          type: 'object',
          required: ['query'],
          properties: {
            query: {
              type: 'string',
              minLength: 1,
              maxLength: 1000,
              example: 'What are the main recommendations?'
            },
            strategy: {
              type: 'string',
              enum: ['hybrid', 'vector'],
              default: 'hybrid'
            },
            rerank: {
              type: 'boolean',
              default: true
            },
            topK: {
              type: 'integer',
              minimum: 1,
              maximum: 20,
              default: 5
            }
          }
        },
        SearchResult: {
          type: 'object',
          properties: {
            answer: { type: 'string' },
            confidence: { type: 'number', minimum: 0, maximum: 100 },
            relevantChunks: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  content: { type: 'string' },
                  documentName: { type: 'string' },
                  similarity: { type: 'number' }
                }
              }
            },
            sources: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  documentName: { type: 'string' },
                  content: { type: 'string' },
                  relevance: { type: 'number' }
                }
              }
            },
            metadata: {
              type: 'object',
              properties: {
                strategy: { type: 'string' },
                rerankUsed: { type: 'boolean' },
                rerankModel: { type: 'string' }
              }
            }
          }
        },
        Thread: {
          type: 'object',
          properties: {
            threadId: { type: 'string' },
            title: { type: 'string' },
            strategy: { type: 'string' },
            rerank: { type: 'boolean' },
            createdAt: { type: 'string', format: 'date-time' },
            updatedAt: { type: 'string', format: 'date-time' }
          }
        },
        Message: {
          type: 'object',
          properties: {
            id: { type: 'string' },
            role: { type: 'string', enum: ['user', 'assistant'] },
            content: { type: 'string' },
            timestamp: { type: 'string', format: 'date-time' },
            metadata: { type: 'object' }
          }
        },
        HealthCheck: {
          type: 'object',
          properties: {
            status: { type: 'string', enum: ['healthy', 'degraded', 'unhealthy'] },
            timestamp: { type: 'string', format: 'date-time' },
            uptime: { type: 'number' },
            version: { type: 'string' }
          }
        },
        DetailedHealth: {
          type: 'object',
          properties: {
            status: { type: 'string' },
            timestamp: { type: 'string', format: 'date-time' },
            uptime: { type: 'number' },
            version: { type: 'string' },
            services: {
              type: 'object',
              properties: {
                database: {
                  type: 'object',
                  properties: {
                    status: { type: 'string' },
                    latency: { type: 'string' }
                  }
                },
                redis: {
                  type: 'object',
                  properties: {
                    status: { type: 'string' },
                    connected: { type: 'boolean' }
                  }
                }
              }
            },
            memory: {
              type: 'object',
              properties: {
                heapUsed: { type: 'string' },
                heapTotal: { type: 'string' },
                rss: { type: 'string' }
              }
            }
          }
        }
      }
    },
    tags: [
      { name: 'Health', description: 'Health check and monitoring endpoints' },
      { name: 'Documents', description: 'Document management operations' },
      { name: 'Search', description: 'AI-powered semantic search' },
      { name: 'Chat', description: 'Conversational AI with threads' },
      { name: 'Upload', description: 'File upload operations' }
    ]
  },
  apis: ['./src/routes/*.ts']
};

export const swaggerSpec = swaggerJsdoc(options);
