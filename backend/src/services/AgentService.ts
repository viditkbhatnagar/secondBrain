import { VectorService } from './VectorService';
import { DatabaseService } from './DatabaseService';
import { ClaudeService, RelevantChunk, SearchResult } from './ClaudeService';
import { GraphService } from './GraphService';
import { DocumentModel } from '../models/index';
import { OpenAIService } from './OpenAIService';

type RetrievalStrategy = 'hybrid' | 'vector';

export interface AgentAnswer {
  answer: string;
  relevantChunks: RelevantChunk[];
  sources: string[];
  confidence: number;
  agentTrace: Array<{ step: string; detail?: any }>;
  metadata: { strategy: RetrievalStrategy; rerankUsed: boolean; rerankModel: string; askedClarifying?: string; queryExpanded?: boolean; isGeneralKnowledge?: boolean };
}

// Retrieval configuration based on query type
interface RetrievalConfig {
  topK: number;
  threshold: number;
  strategy: RetrievalStrategy;
  useQueryExpansion: boolean;
}

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
   * Classify query type for optimized retrieval
   */
  private static classifyQuery(query: string): string {
    const patterns: Record<string, RegExp> = {
      FACTUAL: /^(what|who|when|where|which|how many|how much)/i,
      EXPLANATORY: /^(why|how|explain|describe)/i,
      COMPARATIVE: /(compare|difference|versus|vs|better)/i,
      SUMMARIZATION: /(summarize|summary|overview|main points)/i,
      SPECIFIC: /["']|specific|exactly|precise/i
    };

    for (const [type, pattern] of Object.entries(patterns)) {
      if (pattern.test(query)) return type;
    }
    return 'GENERAL';
  }

  /**
   * Get retrieval configuration based on query type
   */
  private static getRetrievalConfig(queryType: string): RetrievalConfig {
    switch (queryType) {
      case 'FACTUAL':
        return { topK: 4, threshold: 0.5, strategy: 'hybrid', useQueryExpansion: false };
      case 'EXPLANATORY':
        return { topK: 6, threshold: 0.45, strategy: 'hybrid', useQueryExpansion: true };
      case 'SUMMARIZATION':
        return { topK: 8, threshold: 0.4, strategy: 'hybrid', useQueryExpansion: true };
      case 'SPECIFIC':
        return { topK: 3, threshold: 0.55, strategy: 'hybrid', useQueryExpansion: false };
      case 'COMPARATIVE':
        return { topK: 6, threshold: 0.45, strategy: 'hybrid', useQueryExpansion: true };
      default:
        return { topK: 5, threshold: 0.45, strategy: 'hybrid', useQueryExpansion: false };
    }
  }

  /**
   * Planner Agent: decides whether to ask a clarifying question.
   */
  static async maybeClarify(question: string): Promise<string | null> {
    // Only clarify for very short or very broad questions
    if (question.trim().length < 10 || /^(explain|tell me about|info on|overview of)\s/i.test(question)) {
      try {
        const cq = await ClaudeService.generateClarifyingQuestion(question);
        if (cq && cq.length > 0 && cq.length < 200) return cq;
      } catch {}
    }
    return null;
  }

  /**
   * IMPROVED: Retriever Agent with query expansion, document name detection, and better filtering
   */
  static async retrieve(
    question: string, 
    strategy: RetrievalStrategy = 'hybrid', 
    rerank: boolean = true
  ): Promise<{ chunks: RelevantChunk[]; trace: any[]; queryExpanded: boolean }> {
    const trace: any[] = [];
    let chunks: RelevantChunk[];
    let queryExpanded = false;

    // NEW: Check if query references a specific document by name
    const docRef = await this.detectDocumentReference(question);
    if (docRef) {
      trace.push({ 
        step: 'document-reference-detected', 
        detail: { documentId: docRef.documentId, documentName: docRef.documentName } 
      });
      
      // Search within the specific document with lower threshold
      chunks = await VectorService.searchSimilarWithin(question, [docRef.documentId], 6, 0.3);
      
      // If we found chunks from the referenced document, return them
      if (chunks.length > 0) {
        trace.push({ 
          step: 'document-specific-retrieval', 
          detail: { count: chunks.length, documentName: docRef.documentName } 
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
        
        return { chunks, trace, queryExpanded: false };
      }
    }

    // Classify query and get optimal config
    const queryType = this.classifyQuery(question);
    const config = this.getRetrievalConfig(queryType);
    trace.push({ step: 'query-analysis', detail: { queryType, config } });

    // Optionally expand query for better recall
    let effectiveQuery = question;
    if (config.useQueryExpansion) {
      try {
        const expanded = await ClaudeService.expandQuery(question);
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

    return { chunks, trace, queryExpanded };
  }

  /**
   * Answer Agent: synthesizes answer from chunks with Claude.
   * Now supports conversation history for follow-up questions
   * Falls back to OpenAI for general knowledge when no documents found
   */
  static async answer(
    question: string, 
    chunks: RelevantChunk[],
    conversationHistory?: Array<{ role: 'user' | 'assistant'; content: string }>
  ): Promise<SearchResult & { isGeneralKnowledge?: boolean }> {
    if (chunks.length === 0) {
      // Try OpenAI for general knowledge answer
      if (OpenAIService.isConfigured()) {
        try {
          console.log('📚 No documents found, falling back to OpenAI for general knowledge...');
          const openAIResult = await OpenAIService.generateGeneralAnswer(question, conversationHistory);
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
    return await ClaudeService.answerQuestion(question, chunks, conversationHistory);
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
      const { resolvedQuery, isFollowUp } = await ClaudeService.resolveFollowUpQuery(question, conversationHistory);
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

    // 2) Retrieve with improved logic
    const { chunks, trace, queryExpanded } = await this.retrieve(searchQuery, strategy, rerank);
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
