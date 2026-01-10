import { VectorService } from './VectorService';
import { DatabaseService } from './DatabaseService';
import { GptService, RelevantChunk, SearchResult } from './GptService';
import { GraphService } from './GraphService';
import { DocumentModel } from '../models/index';
import { OpenAIService } from './OpenAIService';
import { QueryClassifierService, QueryClassification } from './QueryClassifierService';

type RetrievalStrategy = 'hybrid' | 'vector';

// Query type classification for adaptive retrieval
export type QueryType = 'FACTUAL' | 'EXPLANATORY' | 'SUMMARIZATION' | 'SPECIFIC' | 'GENERAL' | 'COMPARATIVE';

// Query analysis result interface
export interface QueryAnalysis {
  type: QueryType;
  documentReference?: { documentId: string; documentName: string };
  keyTerms: string[];
  isFollowUp: boolean;
}

export interface AgentAnswer {
  answer: string;
  relevantChunks: RelevantChunk[];
  sources: string[];
  confidence: number;
  agentTrace: Array<{ step: string; detail?: any }>;
  metadata: { strategy: RetrievalStrategy; rerankUsed: boolean; rerankModel: string; askedClarifying?: string; queryExpanded?: boolean; isGeneralKnowledge?: boolean };
}

// Retrieval configuration based on query type - IMPROVED with adaptive thresholds
interface RetrievalConfig {
  topK: number;
  threshold: number;
  strategy: RetrievalStrategy;
  useQueryExpansion: boolean;
}

// Adaptive threshold map per query type (Requirements 2.2)
const ADAPTIVE_THRESHOLDS: Record<QueryType, number> = {
  FACTUAL: 0.50,
  EXPLANATORY: 0.40,
  SUMMARIZATION: 0.35,
  SPECIFIC: 0.55,
  GENERAL: 0.45,
  COMPARATIVE: 0.45
};

// Document reference threshold (Requirements 2.3)
const DOCUMENT_REFERENCE_THRESHOLD = 0.30;

// Low confidence threshold for query expansion (Requirements 2.5)
const LOW_CONFIDENCE_THRESHOLD = 0.4;

export class AgentService {
  /**
   * NEW: Detect if query references a document by name
   */
  private static async detectDocumentReference(query: string): Promise<{ documentId: string; documentName: string } | null> {
    try {
      // Get all documents
      const documents = await DocumentModel.find({}).lean();
      if (!documents || documents.length === 0) return null;

      const queryLower = query.toLowerCase();
      
      // Patterns that indicate document name reference
      const docRefPatterns = [
        /(?:about|from|in|regarding|the)\s+(?:the\s+)?["']?([^"'?]+?)["']?\s*(?:document|file|pdf|doc)?/i,
        /(?:document|file)\s+(?:called|named|titled)\s+["']?([^"'?]+?)["']?/i,
        /["']([^"']+)["']/i,
        /tell me (?:more )?about\s+(.+?)(?:\?|$)/i,
        /what (?:is|does|are)\s+(?:in\s+)?(?:the\s+)?(.+?)(?:\?|$)/i,
      ];

      // Try to extract potential document name from query
      let potentialNames: string[] = [];
      for (const pattern of docRefPatterns) {
        const match = query.match(pattern);
        if (match && match[1]) {
          potentialNames.push(match[1].trim());
        }
      }

      // Also add the full query as a potential match (for simple queries like "markdown document")
      potentialNames.push(query.replace(/\?/g, '').trim());

      // Check each document for a match
      for (const doc of documents as any[]) {
        const docName = (doc.originalName || doc.filename || '').toLowerCase();
        const docNameWithoutExt = docName.replace(/\.[^.]+$/, '');
        
        for (const potentialName of potentialNames) {
          const nameLower = potentialName.toLowerCase();
          
          // Check for various match types
          const isExactMatch = docName === nameLower || docNameWithoutExt === nameLower;
          const isPartialMatch = docName.includes(nameLower) || nameLower.includes(docNameWithoutExt);
          const isWordMatch = nameLower.split(/\s+/).some(word => 
            word.length > 3 && (docName.includes(word) || docNameWithoutExt.includes(word))
          );
          
          // Calculate similarity score
          const similarity = this.calculateNameSimilarity(nameLower, docNameWithoutExt);
          
          if (isExactMatch || (isPartialMatch && similarity > 0.5) || (isWordMatch && similarity > 0.4)) {
            console.log(`📄 Detected document reference: "${doc.originalName}" (similarity: ${similarity.toFixed(2)})`);
            return {
              documentId: doc.id,
              documentName: doc.originalName || doc.filename
            };
          }
        }
      }

      return null;
    } catch (error) {
      console.error('Error detecting document reference:', error);
      return null;
    }
  }

  /**
   * Calculate similarity between two strings (Jaccard + character overlap)
   */
  private static calculateNameSimilarity(str1: string, str2: string): number {
    const words1 = new Set(str1.split(/\s+/).filter(w => w.length > 2));
    const words2 = new Set(str2.split(/\s+/).filter(w => w.length > 2));
    
    // Jaccard similarity on words
    const intersection = new Set([...words1].filter(w => words2.has(w)));
    const union = new Set([...words1, ...words2]);
    const jaccardSim = union.size > 0 ? intersection.size / union.size : 0;
    
    // Character-level containment
    const containment = str1.includes(str2) || str2.includes(str1) ? 0.5 : 0;
    
    // Levenshtein-like similarity (simplified)
    const maxLen = Math.max(str1.length, str2.length);
    let matches = 0;
    for (let i = 0; i < Math.min(str1.length, str2.length); i++) {
      if (str1[i] === str2[i]) matches++;
    }
    const charSim = maxLen > 0 ? matches / maxLen : 0;
    
    return Math.max(jaccardSim, containment, charSim);
  }

  /**
   * IMPROVED: Classify query type for optimized retrieval (Requirements 2.2)
   * Returns a QueryType enum value for adaptive threshold selection
   */
  static classifyQuery(query: string): QueryType {
    const patterns: Record<QueryType, RegExp> = {
      FACTUAL: /^(what|who|when|where|which|how many|how much|is there|are there|does|do|did|was|were|has|have|had)/i,
      EXPLANATORY: /^(why|how|explain|describe|elaborate|tell me about|what causes|what makes)/i,
      COMPARATIVE: /(compare|comparison|difference|differences|versus|vs\.?|better|worse|similar|unlike|between)/i,
      SUMMARIZATION: /(summarize|summary|overview|main points|key points|brief|outline|recap|highlights)/i,
      SPECIFIC: /["']|specific|exactly|precise|particular|exact|detailed|in detail/i,
      GENERAL: /.*/ // Default fallback
    };

    // Check patterns in order of specificity
    const orderedTypes: QueryType[] = ['SPECIFIC', 'COMPARATIVE', 'SUMMARIZATION', 'FACTUAL', 'EXPLANATORY', 'GENERAL'];
    
    for (const type of orderedTypes) {
      if (type === 'GENERAL') continue; // Skip general, it's the fallback
      if (patterns[type].test(query)) return type;
    }
    return 'GENERAL';
  }

  /**
   * NEW: Get adaptive threshold based on query type (Requirements 2.2)
   */
  static getAdaptiveThreshold(queryType: QueryType, hasDocumentReference: boolean): number {
    if (hasDocumentReference) {
      return DOCUMENT_REFERENCE_THRESHOLD; // 0.30 for document-referenced queries
    }
    return ADAPTIVE_THRESHOLDS[queryType];
  }

  /**
   * NEW: Analyze query comprehensively (Requirements 2.2, 2.3)
   * Returns query type, document reference, key terms, and follow-up status
   */
  static async analyzeQuery(
    query: string,
    conversationHistory?: Array<{ role: 'user' | 'assistant'; content: string }>
  ): Promise<QueryAnalysis> {
    // Classify query type
    const type = this.classifyQuery(query);
    
    // Detect document reference
    const documentReference = await this.detectDocumentReference(query);
    
    // Extract key terms (words > 3 chars, excluding common words)
    const stopWords = new Set(['what', 'when', 'where', 'which', 'that', 'this', 'these', 'those', 'about', 'from', 'with', 'have', 'been', 'were', 'will', 'would', 'could', 'should', 'their', 'there', 'they', 'your', 'more', 'some', 'than', 'into', 'only', 'other', 'such', 'also', 'most', 'very']);
    const keyTerms = query
      .toLowerCase()
      .replace(/[^\w\s]/g, '')
      .split(/\s+/)
      .filter(word => word.length > 3 && !stopWords.has(word));
    
    // Check if this is a follow-up question
    const followUpPatterns = /\b(it|this|that|these|those|the same|above|previous|mentioned|convert it|what about|how about|and|also|too|the amount|the fee|the payment|the total)\b/i;
    const isFollowUp = conversationHistory && conversationHistory.length > 0 && followUpPatterns.test(query);

    return {
      type,
      documentReference: documentReference || undefined,
      keyTerms,
      isFollowUp: isFollowUp || false
    };
  }

  /**
   * IMPROVED: Get retrieval configuration based on query type (Requirements 2.2)
   * Uses adaptive thresholds from the design spec
   */
  private static getRetrievalConfig(queryType: QueryType, hasDocumentReference: boolean = false): RetrievalConfig {
    const threshold = this.getAdaptiveThreshold(queryType, hasDocumentReference);
    
    switch (queryType) {
      case 'FACTUAL':
        return { topK: 6, threshold, strategy: 'hybrid', useQueryExpansion: false };
      case 'EXPLANATORY':
        return { topK: 8, threshold, strategy: 'hybrid', useQueryExpansion: true };
      case 'SUMMARIZATION':
        return { topK: 10, threshold, strategy: 'hybrid', useQueryExpansion: true };
      case 'SPECIFIC':
        return { topK: 5, threshold, strategy: 'hybrid', useQueryExpansion: false };
      case 'COMPARATIVE':
        return { topK: 8, threshold, strategy: 'hybrid', useQueryExpansion: true };
      default: // GENERAL
        return { topK: 6, threshold, strategy: 'hybrid', useQueryExpansion: false };
    }
  }

  /**
   * Planner Agent: decides whether to ask a clarifying question.
   */
  static async maybeClarify(question: string): Promise<string | null> {
    // Only clarify for very short or very broad questions
    if (question.trim().length < 10 || /^(explain|tell me about|info on|overview of)\s/i.test(question)) {
      try {
        const cq = await GptService.generateClarifyingQuestion(question);
        if (cq && cq.length > 0 && cq.length < 200) return cq;
      } catch {}
    }
    return null;
  }

  /**
   * IMPROVED: Retriever Agent with query analysis, adaptive thresholds, and query expansion (Requirements 2.1-2.5)
   */
  static async retrieve(
    question: string, 
    strategy: RetrievalStrategy = 'hybrid', 
    rerank: boolean = true,
    conversationHistory?: Array<{ role: 'user' | 'assistant'; content: string }>
  ): Promise<{ chunks: RelevantChunk[]; trace: any[]; queryExpanded: boolean; queryAnalysis: QueryAnalysis }> {
    const trace: any[] = [];
    let chunks: RelevantChunk[];
    let queryExpanded = false;

    // NEW: Comprehensive query analysis (Requirements 2.2, 2.3)
    const queryAnalysis = await this.analyzeQuery(question, conversationHistory);
    trace.push({ 
      step: 'query-analysis', 
      detail: { 
        queryType: queryAnalysis.type,
        hasDocumentReference: !!queryAnalysis.documentReference,
        keyTerms: queryAnalysis.keyTerms.slice(0, 5),
        isFollowUp: queryAnalysis.isFollowUp
      } 
    });

    // Get adaptive config based on query analysis
    const config = this.getRetrievalConfig(queryAnalysis.type, !!queryAnalysis.documentReference);
    trace.push({ step: 'retrieval-config', detail: config });

    // Handle document-referenced queries with lower threshold (Requirements 2.3)
    if (queryAnalysis.documentReference) {
      trace.push({ 
        step: 'document-reference-detected', 
        detail: { 
          documentId: queryAnalysis.documentReference.documentId, 
          documentName: queryAnalysis.documentReference.documentName,
          threshold: DOCUMENT_REFERENCE_THRESHOLD
        } 
      });
      
      // Search within the specific document with lower threshold
      chunks = await VectorService.searchSimilarWithin(
        question, 
        [queryAnalysis.documentReference.documentId], 
        10, // Increased initial candidates (Requirements 2.1)
        DOCUMENT_REFERENCE_THRESHOLD
      );
      
      // If we found chunks from the referenced document, return them
      if (chunks.length > 0) {
        trace.push({ 
          step: 'document-specific-retrieval', 
          detail: { count: chunks.length, documentName: queryAnalysis.documentReference.documentName } 
        });
        
        // Log chunk quality
        const avgSim = chunks.reduce((s, c) => s + c.similarity, 0) / chunks.length;
        const topSim = chunks[0].similarity;
        trace.push({ 
          step: 'retrieval-quality', 
          detail: { 
            count: chunks.length, 
            topSimilarity: Math.round(topSim * 100), 
            avgSimilarity: Math.round(avgSim * 100),
            uniqueDocs: 1,
            method: 'document-name-match'
          } 
        });
        
        return { chunks, trace, queryExpanded: false, queryAnalysis };
      }
    }

    // Optionally expand query for better recall
    let effectiveQuery = question;
    if (config.useQueryExpansion) {
      try {
        const expanded = await GptService.expandQuery(question);
        if (expanded !== question) {
          effectiveQuery = expanded;
          queryExpanded = true;
          trace.push({ step: 'query-expansion', detail: { original: question, expanded } });
        }
      } catch {}
    }

    // Use configured strategy or override
    const effectiveStrategy = strategy || config.strategy;
    const effectiveLimit = config.topK;
    const effectiveThreshold = config.threshold;

    if (effectiveStrategy === 'hybrid') {
      chunks = await VectorService.searchSimilarHybrid(effectiveQuery, { 
        limit: effectiveLimit, 
        minSimilarity: effectiveThreshold, 
        alpha: 0.55, 
        rerank 
      });
      trace.push({ 
        step: 'retrieval', 
        detail: { 
          strategy: 'hybrid', 
          rerank, 
          rerankUsed: VectorService.getLastRerankUsed(),
          threshold: effectiveThreshold,
          limit: effectiveLimit
        } 
      });
    } else {
      chunks = await VectorService.searchSimilar(effectiveQuery, effectiveLimit, effectiveThreshold);
      trace.push({ step: 'retrieval', detail: { strategy: 'vector', threshold: effectiveThreshold } });
    }

    // NEW: Query expansion on low confidence (Requirements 2.5)
    if (chunks.length > 0 && chunks[0].similarity < LOW_CONFIDENCE_THRESHOLD && !queryExpanded) {
      trace.push({ 
        step: 'low-confidence-detected', 
        detail: { topSimilarity: chunks[0].similarity, threshold: LOW_CONFIDENCE_THRESHOLD } 
      });
      
      try {
        const expandedQuery = await GptService.expandQuery(question);
        if (expandedQuery !== question) {
          const expandedChunks = await VectorService.searchSimilarHybrid(expandedQuery, { 
            limit: effectiveLimit, 
            minSimilarity: effectiveThreshold * 0.8, // Slightly lower threshold for expanded query
            alpha: 0.55, 
            rerank 
          });
          
          if (expandedChunks.length > 0 && expandedChunks[0].similarity > chunks[0].similarity) {
            chunks = expandedChunks;
            queryExpanded = true;
            trace.push({ 
              step: 'query-expansion-retry', 
              detail: { 
                original: question, 
                expanded: expandedQuery,
                newTopSimilarity: expandedChunks[0].similarity
              } 
            });
          }
        }
      } catch (err) {
        trace.push({ step: 'query-expansion-failed', detail: { error: (err as Error).message } });
      }
    }

    // Graph RAG: if we can ground entities, narrow to docIds within 2-hop neighborhood
    try {
      const entityRegex = /(PERSON|ORG|ID_NUMBER|EMAIL|PHONE):([^\s]+)/ig;
      const matches = Array.from(question.matchAll(entityRegex));
      if (matches.length > 0) {
        const firstLabel = `${matches[0][1]}:${matches[0][2]}`;
        const nodeId = firstLabel.toUpperCase();
        const graph = await GraphService.neighborhood(nodeId, 2);
        const docNodeIds = new Set<string>();
        for (const edge of graph.edges as any[]) {
          if (edge.type === 'MENTIONS') {
            const fromIsDoc = (graph.nodes as any[]).find(n => n.id === edge.from)?.type === 'DOCUMENT';
            const toIsDoc = (graph.nodes as any[]).find(n => n.id === edge.to)?.type === 'DOCUMENT';
            if (fromIsDoc) docNodeIds.add(edge.from);
            if (toIsDoc) docNodeIds.add(edge.to);
          }
        }
        const docIds = Array.from(docNodeIds).map(id => id.replace(/^document:/, ''));
        if (docIds.length > 0) {
          const narrowed = await VectorService.searchSimilarWithin(question, docIds, effectiveLimit, effectiveThreshold);
          if (narrowed.length > 0) {
            chunks = narrowed;
            trace.push({ step: 'graph-rag', detail: { groundedEntity: firstLabel, docIds: docIds.slice(0, 20), count: narrowed.length } });
          }
        }
      }
    } catch {}

    // Log chunk quality
    if (chunks.length > 0) {
      const avgSim = chunks.reduce((s, c) => s + c.similarity, 0) / chunks.length;
      const topSim = chunks[0].similarity;
      trace.push({ 
        step: 'retrieval-quality', 
        detail: { 
          count: chunks.length, 
          topSimilarity: Math.round(topSim * 100), 
          avgSimilarity: Math.round(avgSim * 100),
          uniqueDocs: new Set(chunks.map(c => c.documentId)).size
        } 
      });
    }

    return { chunks, trace, queryExpanded, queryAnalysis };
  }

  /**
   * SMART RETRIEVE: Category-aware retrieval that only searches relevant categories
   * This is a faster alternative to retrieve() for large knowledge bases
   */
  static async retrieveSmart(
    question: string,
    options?: {
      strategy?: RetrievalStrategy;
      rerank?: boolean;
      forceAllDocuments?: boolean;
    }
  ): Promise<{
    chunks: RelevantChunk[];
    trace: any[];
    classification: QueryClassification;
    searchedDocuments: number;
  }> {
    const trace: any[] = [];
    const strategy = options?.strategy || 'hybrid';
    const rerank = options?.rerank !== false;
    const forceAll = options?.forceAllDocuments || false;

    // Use smart search with category filtering
    const smartResult = await VectorService.searchSimilarSmart(question, {
      limit: 6,
      minSimilarity: 0.45,
      enableFallback: true,
      forceAllDocuments: forceAll
    });

    trace.push({
      step: 'smart-retrieval',
      detail: {
        categories: smartResult.classification.categories,
        shouldSearchAll: smartResult.classification.shouldSearchAll,
        confidence: smartResult.classification.confidence,
        searchedDocuments: smartResult.searchedDocuments,
        foundChunks: smartResult.chunks.length,
        reasoning: smartResult.classification.reasoning
      }
    });

    // If using hybrid strategy and we got chunks, apply hybrid scoring
    let finalChunks = smartResult.chunks;
    if (strategy === 'hybrid' && finalChunks.length > 0 && rerank) {
      try {
        // Get document IDs from smart search results
        const docIds = [...new Set(finalChunks.map(c => c.documentId))];

        // Run hybrid search within those documents only
        const hybridChunks = await VectorService.searchSimilarHybrid(question, {
          limit: 6,
          minSimilarity: 0.40,
          rerank: true
        });

        // Filter to only include chunks from our category-matched documents
        const filteredHybrid = hybridChunks.filter(c => docIds.includes(c.documentId));

        if (filteredHybrid.length > 0) {
          finalChunks = filteredHybrid;
          trace.push({
            step: 'hybrid-refinement',
            detail: {
              originalCount: smartResult.chunks.length,
              refinedCount: finalChunks.length
            }
          });
        }
      } catch (err) {
        // Fall back to smart search results
        trace.push({ step: 'hybrid-refinement-skipped', detail: { error: (err as Error).message } });
      }
    }

    // Log quality metrics
    if (finalChunks.length > 0) {
      const avgSim = finalChunks.reduce((s, c) => s + c.similarity, 0) / finalChunks.length;
      const topSim = finalChunks[0].similarity;
      trace.push({
        step: 'retrieval-quality',
        detail: {
          count: finalChunks.length,
          topSimilarity: Math.round(topSim * 100),
          avgSimilarity: Math.round(avgSim * 100),
          uniqueDocs: new Set(finalChunks.map(c => c.documentId)).size
        }
      });
    }

    return {
      chunks: finalChunks,
      trace,
      classification: smartResult.classification,
      searchedDocuments: smartResult.searchedDocuments
    };
  }

  /**
   * Answer Agent: synthesizes answer from chunks with GPT-5.
   * Now supports conversation history for follow-up questions
   * Falls back to OpenAI for general knowledge when no documents found
   */
  static async answer(
    question: string, 
    chunks: RelevantChunk[],
    conversationHistory?: Array<{ role: 'user' | 'assistant'; content: string }>,
    mode: 'fast' | 'detail' = 'fast'
  ): Promise<SearchResult & { isGeneralKnowledge?: boolean }> {
    if (chunks.length === 0) {
      // Try OpenAI for general knowledge answer (always use fast mode for external queries)
      if (OpenAIService.isConfigured()) {
        try {
          console.log('📚 No documents found, falling back to OpenAI for general knowledge...');
          const openAIResult = await OpenAIService.generateGeneralAnswer(question, conversationHistory, mode === 'fast');
          return {
            answer: openAIResult.answer,
            relevantChunks: [],
            confidence: 70, // General knowledge confidence
            sources: [],
            isGeneralKnowledge: true
          };
        } catch (error) {
          console.error('OpenAI fallback failed:', error);
        }
      }
      
      // Final fallback if OpenAI also fails
      return {
        answer: "I couldn't find any relevant information in your documents to answer this question. This could mean:\n\n• The information isn't in your uploaded documents\n• Try rephrasing your question with different keywords\n• Consider uploading more relevant documents",
        relevantChunks: [],
        confidence: 0,
        sources: []
      };
    }
    return await GptService.answerQuestion(question, chunks, conversationHistory, mode);
  }

  /**
   * Orchestrator: decides clarify → retrieve → answer, logs analytics.
   * Now supports conversation history for hyper-personalized follow-up handling
   */
  static async processQuestion(
    question: string, 
    strategy: RetrievalStrategy = 'hybrid', 
    rerank: boolean = true,
    conversationHistory?: Array<{ role: 'user' | 'assistant'; content: string }>
  ): Promise<AgentAnswer> {
    const agentTrace: Array<{ step: string; detail?: any }> = [];

    // 0) Resolve follow-up references (pronouns like "it", "that", etc.)
    let effectiveQuestion = question;
    let queryResolved = false;
    
    if (conversationHistory && conversationHistory.length > 0) {
      const { resolvedQuery, isFollowUp } = await GptService.resolveFollowUpQuery(question, conversationHistory);
      if (isFollowUp && resolvedQuery !== question) {
        effectiveQuestion = resolvedQuery;
        queryResolved = true;
        agentTrace.push({ 
          step: 'query-resolution', 
          detail: { 
            original: question, 
            resolved: resolvedQuery,
            reason: 'Follow-up question with pronoun/reference resolution'
          } 
        });
      }
    }

    // 1) Clarify (optional) - skip if we already resolved the query
    let clarifying: string | null = null;
    if (!queryResolved) {
      clarifying = await this.maybeClarify(effectiveQuestion);
      if (clarifying) {
        agentTrace.push({ step: 'clarify', detail: { question: clarifying } });
      }
    }

    const searchQuery = clarifying ? `${effectiveQuestion}\nClarification: ${clarifying}` : effectiveQuestion;

    // 2) Retrieve with improved logic and conversation history
    const { chunks, trace, queryExpanded, queryAnalysis } = await this.retrieve(searchQuery, strategy, rerank, conversationHistory);
    agentTrace.push(...trace);
    
    // Log chunks summary (not full content to keep trace manageable)
    agentTrace.push({ 
      step: 'chunks-summary', 
      detail: { 
        count: chunks.length, 
        sources: chunks.map(c => ({ doc: c.documentName, sim: Math.round(c.similarity * 100) }))
      } 
    });

    // 3) If retrieval weak, try fallback strategies
    if (chunks.length === 0) {
      // Try vector-only with lower threshold
      const fallback = await VectorService.searchSimilar(effectiveQuestion, 5, 0.35);
      agentTrace.push({ step: 'fallback', detail: { tried: 'vector-lower-threshold', found: fallback.length } });
      
      if (fallback.length > 0) {
        const ans = await this.answer(effectiveQuestion, fallback, conversationHistory);
        return {
          ...ans,
          agentTrace,
          metadata: {
            strategy: 'vector',
            rerankUsed: false,
            rerankModel: VectorService.getRerankModelName(),
            askedClarifying: clarifying || undefined,
            queryExpanded
          }
        };
      }
    }

    // 4) Answer with conversation history for context
    const result = await this.answer(effectiveQuestion, chunks, conversationHistory);
    return {
      ...result,
      agentTrace,
      metadata: {
        strategy,
        rerankUsed: VectorService.getLastRerankUsed(),
        rerankModel: VectorService.getRerankModelName(),
        askedClarifying: clarifying || undefined,
        queryExpanded,
        isGeneralKnowledge: (result as any).isGeneralKnowledge || false
      }
    };
  }
}
