export type SearchState = 'idle' | 'searching' | 'results' | 'error';
export type SearchStage = 'understanding' | 'searching' | 'found' | 'composing' | 'done';

export interface Source {
  documentName: string;
  content: string;
  similarity: number;
  chunkId: string;
}

export interface SearchResult {
  answer: string;
  confidence: number;
  sources: Source[];
  relatedQuestions: string[];
  metadata?: {
    strategy?: string;
    rerankUsed?: boolean;
  };
}

export interface SearchPageState {
  status: SearchState;
  stage: SearchStage;
  query: string;
  answer: string | null;
  confidence: number;
  sources: Source[];
  relatedQuestions: string[];
  documentsSearched: number;
  chunksAnalyzed: number;
  sectionsFound: number;
}
