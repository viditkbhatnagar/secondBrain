import React, { useEffect, useState } from 'react';
import { API_ENDPOINTS } from '../config/api';

interface Cluster { clusterId: string; size: number }

export const ClustersView: React.FC = () => {
  const [clusters, setClusters] = useState<Cluster[]>([]);
  const [isRunning, setIsRunning] = useState(false);
  const [selected, setSelected] = useState<string | null>(null);
  const [docs, setDocs] = useState<any[]>([]);
  const [summary, setSummary] = useState<string>('');

  const run = async () => {
    setIsRunning(true);
    try {
      const res = await fetch(`${API_ENDPOINTS.baseAdmin}/cluster`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ k: 5, maxIter: 10 }) });
      const data = await res.json();
      setClusters(data.clusters || []);
    } catch {}
    setIsRunning(false);
  };

  const loadClusters = async () => {
    try {
      const res = await fetch(`${API_ENDPOINTS.baseAdmin}/clusters`);
      const data = await res.json();
      setClusters(data.clusters || []);
    } catch {}
  };

  const openCluster = async (id: string) => {
    setSelected(id);
    setSummary('');
    try {
      const r1 = await fetch(`${API_ENDPOINTS.baseAdmin}/cluster/${id}/docs`);
      const d1 = await r1.json();
      setDocs(d1.documents || []);
      const r2 = await fetch(`${API_ENDPOINTS.baseAdmin}/cluster/${id}/summary`, { method: 'POST' });
      const d2 = await r2.json();
      setSummary(d2.summary || '');
    } catch {}
  };

  useEffect(() => { loadClusters(); }, []);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-bold">Clusters</h2>
        <button onClick={run} disabled={isRunning} className="px-3 py-2 text-sm bg-blue-600 text-white rounded">{isRunning ? 'Clustering...' : 'Run Clustering'}</button>
      </div>
      <div className="grid md:grid-cols-3 gap-4">
        <div className="md:col-span-1 bg-white border rounded p-3">
          <div className="text-sm font-semibold mb-2">Cluster List</div>
          <div className="space-y-2 max-h-72 overflow-auto">
            {clusters.map(c => (
              <button key={c.clusterId} onClick={() => openCluster(c.clusterId)} className={`w-full text-left border rounded px-2 py-2 ${selected===c.clusterId ? 'border-blue-500 bg-blue-50' : 'hover:bg-gray-50'}`}>
                <div className="font-medium">{c.clusterId}</div>
                <div className="text-xs text-gray-600">{c.size} documents</div>
              </button>
            ))}
          </div>
        </div>
        <div className="md:col-span-2 bg-white border rounded p-3">
          {selected ? (
            <div>
              <div className="text-sm font-semibold mb-2">Summary</div>
              <div className="prose max-w-none text-sm whitespace-pre-wrap mb-4">{summary || '—'}</div>
              <div className="text-sm font-semibold mb-2">Documents</div>
              <div className="space-y-2 max-h-72 overflow-auto">
                {docs.map((d) => (
                  <div key={d.id} className="border rounded px-2 py-1 text-sm">
                    <div className="font-medium truncate">{d.originalName}</div>
                    <div className="text-xs text-gray-600">{new Date(d.uploadedAt).toLocaleString()} • {d.wordCount} words • {d.chunkCount} chunks</div>
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <div className="text-sm text-gray-600">Select a cluster to view details</div>
          )}
        </div>
      </div>
    </div>
  );
};

export default ClustersView;


