import { VectorService } from './VectorService';
import { DatabaseService } from './DatabaseService';
import { ClaudeService, RelevantChunk, SearchResult } from './ClaudeService';
import { GraphService } from './GraphService';

type RetrievalStrategy = 'hybrid' | 'vector';

export interface AgentAnswer {
  answer: string;
  relevantChunks: RelevantChunk[];
  sources: string[];
  confidence: number;
  agentTrace: Array<{ step: string; detail?: any }>;
  metadata: { strategy: RetrievalStrategy; rerankUsed: boolean; rerankModel: string; askedClarifying?: string };
}

export class AgentService {
  /**
   * Planner Agent: decides whether to ask a clarifying question.
   */
  static async maybeClarify(question: string): Promise<string | null> {
    // Simple heuristic: short or very broad questions trigger clarification
    if (question.trim().length < 15 || /(explain|tell me|about|overview|info)/i.test(question)) {
      try {
        const cq = await ClaudeService.generateClarifyingQuestion(question);
        if (cq && cq.length > 0) return cq;
      } catch {}
    }
    return null;
  }

  /**
   * Retriever Agent: runs hybrid/vector retrieval, optionally with reranking, and returns chunks.
   */
  static async retrieve(question: string, strategy: RetrievalStrategy = 'hybrid', rerank: boolean = true): Promise<{ chunks: RelevantChunk[]; trace: any[] }> {
    const trace: any[] = [];
    let chunks: RelevantChunk[];

    if (strategy === 'hybrid') {
      chunks = await VectorService.searchSimilarHybrid(question, { limit: 5, minSimilarity: 0.2, alpha: 0.6, rerank });
      trace.push({ step: 'retrieval', detail: { strategy: 'hybrid', rerank, rerankUsed: VectorService.getLastRerankUsed() } });
    } else {
      chunks = await VectorService.searchSimilar(question, 5, 0.3);
      trace.push({ step: 'retrieval', detail: { strategy: 'vector' } });
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
          const narrowed = await VectorService.searchSimilarWithin(question, docIds, 5, 0.2);
          if (narrowed.length > 0) {
            chunks = narrowed;
            trace.push({ step: 'graph-rag', detail: { groundedEntity: firstLabel, docIds: docIds.slice(0, 20), count: narrowed.length } });
          }
        }
      }
    } catch {}

    return { chunks, trace };
  }

  /**
   * Answer Agent: synthesizes answer from chunks with Claude.
   */
  static async answer(question: string, chunks: RelevantChunk[]): Promise<SearchResult> {
    return await ClaudeService.answerQuestion(question, chunks);
  }

  /**
   * Orchestrator: decides clarify → retrieve → answer, logs analytics.
   */
  static async processQuestion(question: string, strategy: RetrievalStrategy = 'hybrid', rerank: boolean = true): Promise<AgentAnswer> {
    const agentTrace: Array<{ step: string; detail?: any }> = [];

    // 1) Clarify (optional)
    const clarifying = await this.maybeClarify(question);
    if (clarifying) {
      agentTrace.push({ step: 'clarify', detail: { question: clarifying } });
    }

    const effectiveQuery = clarifying ? `${question}\nClarification: ${clarifying}` : question;

    // 2) Retrieve
    const { chunks, trace } = await this.retrieve(effectiveQuery, strategy, rerank);
    agentTrace.push(...trace);
    agentTrace.push({ step: 'chunks', detail: { count: chunks.length, items: chunks.slice(0, 10) } });

    // 3) If retrieval weak, try fallback: broaden to vector-only or increase k
    if (chunks.length === 0 && strategy === 'hybrid') {
      const alt = await this.retrieve(question, 'vector', rerank);
      agentTrace.push({ step: 'fallback', detail: { tried: 'vector' } });
      if (alt.chunks.length > 0) {
        const ans = await this.answer(question, alt.chunks);
        return {
          ...ans,
          agentTrace,
          metadata: {
            strategy: 'vector',
            rerankUsed: VectorService.getLastRerankUsed(),
            rerankModel: VectorService.getRerankModelName(),
            askedClarifying: clarifying || undefined
          }
        };
      }
    }

    // 4) Answer
    const result = await this.answer(question, chunks);
    return {
      ...result,
      agentTrace,
      metadata: {
        strategy,
        rerankUsed: VectorService.getLastRerankUsed(),
        rerankModel: VectorService.getRerankModelName(),
        askedClarifying: clarifying || undefined
      }
    };
  }
}


