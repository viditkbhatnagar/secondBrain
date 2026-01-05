import { z } from 'zod';

/**
 * Search request validation schema
 */
export const searchSchema = z.object({
  query: z
    .string()
    .min(1, 'Query is required')
    .max(1000, 'Query must be less than 1000 characters')
    .trim(),
  strategy: z.enum(['hybrid', 'vector', 'text']).default('hybrid'),
  rerank: z.boolean().default(true),
  topK: z.number().int().min(1).max(20).default(5)
});

export type SearchInput = z.infer<typeof searchSchema>;

/**
 * Agent/Chat search request validation
 */
export const agentSearchSchema = z.object({
  query: z
    .string()
    .min(1, 'Query is required')
    .max(2000, 'Query must be less than 2000 characters')
    .trim(),
  strategy: z.enum(['hybrid', 'vector']).default('hybrid'),
  rerank: z.boolean().default(true),
  threadId: z.string().optional()
});

export type AgentSearchInput = z.infer<typeof agentSearchSchema>;

/**
 * Chat message validation schema
 */
export const chatMessageSchema = z.object({
  message: z
    .string()
    .min(1, 'Message is required')
    .max(5000, 'Message must be less than 5000 characters')
    .trim(),
  threadId: z.string().optional()
});

export type ChatMessageInput = z.infer<typeof chatMessageSchema>;

/**
 * Thread creation schema
 */
export const createThreadSchema = z.object({
  strategy: z.enum(['hybrid', 'vector']).default('hybrid'),
  rerank: z.boolean().default(true)
});

export type CreateThreadInput = z.infer<typeof createThreadSchema>;

/**
 * Document ID parameter validation
 */
export const documentIdSchema = z.object({
  id: z.string().min(1, 'Document ID is required')
});

export type DocumentIdInput = z.infer<typeof documentIdSchema>;

/**
 * Pagination schema
 */
export const paginationSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20)
});

export type PaginationInput = z.infer<typeof paginationSchema>;

/**
 * Related questions request schema
 */
export const relatedQuestionsSchema = z.object({
  query: z.string().min(1).max(1000).trim(),
  answer: z.string().min(1).max(5000).trim()
});

export type RelatedQuestionsInput = z.infer<typeof relatedQuestionsSchema>;

/**
 * Thread ID parameter validation
 */
export const threadIdSchema = z.object({
  threadId: z.string().min(1, 'Thread ID is required')
});

export type ThreadIdInput = z.infer<typeof threadIdSchema>;

/**
 * Update thread title schema
 */
export const updateThreadTitleSchema = z.object({
  title: z.string().min(1).max(200).trim()
});

export type UpdateThreadTitleInput = z.infer<typeof updateThreadTitleSchema>;

/**
 * Saved search schema
 */
export const savedSearchSchema = z.object({
  query: z.string().min(1).max(500).trim(),
  alertFrequency: z.enum(['daily', 'weekly', 'monthly']).optional()
});

export type SavedSearchInput = z.infer<typeof savedSearchSchema>;

/**
 * Optimized search request validation schema
 */
export const optimizedSearchSchema = z.object({
  query: z
    .string()
    .min(1, 'Query is required')
    .max(1000, 'Query must be less than 1000 characters')
    .trim(),
  streaming: z.boolean().default(false),
  maxSources: z.number().int().min(1).max(20).default(5),
  minConfidence: z.number().min(0).max(1).default(0.5),
  model: z.enum(['gpt-5']).default('gpt-5'),
  useCache: z.boolean().default(true),
  validateResponse: z.boolean().default(true)
});

export type OptimizedSearchInput = z.infer<typeof optimizedSearchSchema>;
