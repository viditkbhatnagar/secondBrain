import React from 'react';

export const RagQualityPage: React.FC = () => {
  const diagram1 = `graph TD
  A[User Query] --> B[Retriever]
  B -->|Vector Search| C[Top-k Chunks]
  B -->|Keyword Search| D[Top-k Chunks]
  C --> E[Blend & Rerank]
  D --> E[Blend & Rerank]
  E --> F[Context]
  F --> G[Claude Answer]
`;

  const diagram2 = `sequenceDiagram
  participant U as User
  participant API as Backend API
  participant VS as VectorService
  participant DB as MongoDB
  participant LLM as Claude

  U->>API: POST /api/search {query, strategy}
  API->>VS: searchSimilarHybrid(query)
  VS->>DB: text index query (topK)
  VS->>VS: OpenAI embedding for query
  VS->>DB: fetch candidate chunks
  VS->>VS: cosine similarity + blend
  VS-->>API: blended top-k chunks
  API->>LLM: question + context
  LLM-->>API: answer + confidence
  API-->>U: SearchResult
`;

  return (
    <div className="prose dark:prose-invert prose-secondary max-w-none">
      <h2 className="text-secondary-900 dark:text-secondary-100">RAG Quality</h2>
      <p className="text-secondary-700 dark:text-secondary-300">
        Retrieval-Augmented Generation (RAG) combines information retrieval with language models. In this app,
        we implement hybrid retrieval (keyword + semantic) and reranking to improve answer quality and grounding.
      </p>

      <h3 className="text-secondary-900 dark:text-secondary-100">Architecture</h3>
      <pre className="mermaid bg-secondary-50 dark:bg-secondary-800 p-4 rounded-lg text-sm overflow-x-auto">
{diagram1}
      </pre>

      <h3 className="text-secondary-900 dark:text-secondary-100">End-to-end Flow</h3>
      <pre className="mermaid bg-secondary-50 dark:bg-secondary-800 p-4 rounded-lg text-sm overflow-x-auto">
{diagram2}
      </pre>

      <h3 className="text-secondary-900 dark:text-secondary-100">How it works here</h3>
      <ul className="text-secondary-700 dark:text-secondary-300 space-y-2">
        <li><span className="font-semibold text-secondary-900 dark:text-secondary-100">Semantic (Vector) Search</span>: We embed the query and compare via cosine similarity against stored chunk embeddings.</li>
        <li><span className="font-semibold text-secondary-900 dark:text-secondary-100">Keyword Search</span>: MongoDB text index returns BM25-like results with a textScore.</li>
        <li><span className="font-semibold text-secondary-900 dark:text-secondary-100">Hybrid Blending</span>: Scores are normalized and blended with a configurable weight, then reranked.</li>
        <li><span className="font-semibold text-secondary-900 dark:text-secondary-100">Context Construction</span>: Top chunks are formatted with sources and passed to Claude to generate the grounded answer.</li>
      </ul>

      <p className="text-secondary-700 dark:text-secondary-300 mt-4">
        You can switch between <span className="font-semibold text-primary-600 dark:text-primary-400">Hybrid</span> and <span className="font-semibold text-primary-600 dark:text-primary-400">Vector</span> strategies in the search box to compare behavior.
      </p>
    </div>
  );
};

export default RagQualityPage;


