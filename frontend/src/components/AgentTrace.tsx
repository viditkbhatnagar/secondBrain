import React, { useState } from 'react';

export const AgentTrace: React.FC<{ trace: any[] }> = ({ trace }) => {
  const [expanded, setExpanded] = useState<Record<number, boolean>>({});
  const toggle = (i: number) => setExpanded(prev => ({ ...prev, [i]: !prev[i] }));

  return (
    <div className="mt-2 text-xs text-gray-700 bg-white/70 rounded p-2">
      <div className="font-medium mb-1">Agent Steps</div>
      <ol className="list-decimal ml-4 space-y-2">
        {trace.map((t, idx) => (
          <li key={idx}>
            <div className="flex items-center justify-between">
              <div>
                <span className="font-medium">{t.step}</span>
                {t.detail?.strategy && <span>: strategy={t.detail.strategy}</span>}
                {typeof t.detail?.rerank !== 'undefined' && <span>, rerank={t.detail.rerank ? 'on' : 'off'}</span>}
                {typeof t.detail?.count !== 'undefined' && <span>, count={t.detail.count}</span>}
              </div>
              <button onClick={() => toggle(idx)} className="text-blue-600">{expanded[idx] ? 'Hide' : 'Show'} details</button>
            </div>

            {expanded[idx] && (
              <div className="mt-1">
                {/* Raw JSON */}
                <pre className="bg-gray-50 rounded p-2 overflow-auto max-h-48">{JSON.stringify(t.detail, null, 2)}</pre>

                {/* Chunk previews and deep-link buttons */}
                {t.step === 'chunks' && Array.isArray(t.detail?.items) && (
                  <div className="mt-1 space-y-1">
                    {t.detail.items.slice(0, 5).map((c: any) => (
                      <div key={c.chunkId} className="p-2 border rounded">
                        <div className="flex items-center justify-between mb-1">
                          <div className="text-[10px] text-gray-500">{c.documentName} • {Math.round((c.similarity || 0) * 100)}%</div>
                          <a
                            href={`#open-document:${encodeURIComponent(c.documentId)}:${encodeURIComponent(c.chunkId)}`}
                            className="text-[10px] text-blue-600"
                            title="Open in Library"
                          >Open</a>
                        </div>
                        <div className="text-[11px] line-clamp-3">{c.content}</div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </li>
        ))}
      </ol>
    </div>
  );
};

export default AgentTrace;


