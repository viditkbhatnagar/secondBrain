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
    <div className="prose prose-gray max-w-none">
      <h2>RAG Quality</h2>
      <p>
        Retrieval-Augmented Generation (RAG) combines information retrieval with language models. In this app,
        we implement hybrid retrieval (keyword + semantic) and reranking to improve answer quality and grounding.
      </p>

      <h3>Architecture</h3>
      <pre className="mermaid">
{diagram1}
      </pre>

      <h3>End-to-end Flow</h3>
      <pre className="mermaid">
{diagram2}
      </pre>

      <h3>How it works here</h3>
      <ul>
        <li><b>Semantic (Vector) Search</b>: We embed the query and compare via cosine similarity against stored chunk embeddings.</li>
        <li><b>Keyword Search</b>: MongoDB text index returns BM25-like results with a textScore.</li>
        <li><b>Hybrid Blending</b>: Scores are normalized and blended with a configurable weight, then reranked.</li>
        <li><b>Context Construction</b>: Top chunks are formatted with sources and passed to Claude to generate the grounded answer.</li>
      </ul>

      <p>
        You can switch between <b>Hybrid</b> and <b>Vector</b> strategies in the search box to compare behavior.
      </p>
    </div>
  );
};

export default RagQualityPage;


