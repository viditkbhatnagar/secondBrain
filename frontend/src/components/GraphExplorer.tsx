import React, { useEffect, useState, useCallback } from 'react';
import { API_ENDPOINTS } from '../config/api';

export const GraphExplorer: React.FC<{ entityId?: string }>= ({ entityId = 'DOCUMENT:' }) => {
  const [nodes, setNodes] = useState<any[]>([]);
  const [edges, setEdges] = useState<any[]>([]);
  const [id, setId] = useState(entityId);

  const load = useCallback(async () => {
    try {
      if (!id) return;
      const res = await fetch(`${API_ENDPOINTS.baseGraph}/entity/${encodeURIComponent(id)}`);
      const data = await res.json();
      setNodes(data.nodes || []);
      setEdges(data.edges || []);
    } catch {}
  }, [id]);

  useEffect(() => { load(); }, [load]);

  return (
    <div className="space-y-3">
      <div className="flex items-center space-x-2">
        <input value={id} onChange={(e) => setId(e.target.value)} placeholder="ENTITY_ID e.g. PERSON:John Doe" className="border rounded px-2 py-1 text-sm flex-1" />
        <button onClick={load} className="text-sm px-3 py-1 bg-blue-600 text-white rounded">Load</button>
      </div>
      <div className="grid md:grid-cols-3 gap-4">
        <div className="bg-white border rounded p-3">
          <div className="text-sm font-semibold mb-2">Nodes ({nodes.length})</div>
          <div className="text-xs max-h-64 overflow-auto space-y-1">
            {nodes.map((n) => (
              <div key={n.id} className="border rounded px-2 py-1">
                <div className="font-medium">{n.label}</div>
                <div className="text-gray-600">{n.type} • {n.id}</div>
              </div>
            ))}
          </div>
        </div>
        <div className="md:col-span-2 bg-white border rounded p-3">
          <div className="text-sm font-semibold mb-2">Edges ({edges.length})</div>
          <div className="text-xs max-h-64 overflow-auto space-y-1">
            {edges.map((e) => (
              <div key={e.id} className="border rounded px-2 py-1">
                <div><span className="font-medium">{e.type}</span> {e.from} → {e.to}</div>
                {typeof e.confidence !== 'undefined' && (<div className="text-gray-600">confidence: {Math.round((e.confidence||0)*100)}%</div>)}
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};

export default GraphExplorer;


