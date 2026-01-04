import React, { useEffect, useState } from 'react';
import { Layers } from 'lucide-react';
import { API_ENDPOINTS } from '../config/api';
import { Card, Button, Badge, EmptyState, Spinner } from './ui';

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
        <h2 className="text-2xl font-bold text-secondary-900 dark:text-secondary-100">Clusters</h2>
        <Button 
          variant="primary" 
          size="sm" 
          onClick={run} 
          disabled={isRunning}
          leftIcon={isRunning ? <Spinner size="sm" /> : undefined}
        >
          {isRunning ? 'Clustering...' : 'Run Clustering'}
        </Button>
      </div>
      
      <div className="grid md:grid-cols-3 gap-4">
        <Card variant="outlined" padding="md" className="md:col-span-1">
          <div className="text-sm font-semibold text-secondary-900 dark:text-secondary-100 mb-3">Cluster List</div>
          {clusters.length === 0 ? (
            <div className="text-sm text-secondary-500 dark:text-secondary-400 text-center py-4">
              No clusters yet. Run clustering to group documents.
            </div>
          ) : (
            <div className="space-y-2 max-h-72 overflow-auto">
              {clusters.map(c => (
                <button 
                  key={c.clusterId} 
                  onClick={() => openCluster(c.clusterId)} 
                  className={`w-full text-left border rounded-lg px-3 py-2 transition-colors ${
                    selected === c.clusterId 
                      ? 'border-primary-500 bg-primary-50 dark:bg-primary-900/20 dark:border-primary-400' 
                      : 'border-secondary-200 dark:border-secondary-700 hover:bg-secondary-50 dark:hover:bg-secondary-800'
                  }`}
                >
                  <div className="font-medium text-secondary-900 dark:text-secondary-100">{c.clusterId}</div>
                  <div className="text-xs text-secondary-600 dark:text-secondary-400">{c.size} documents</div>
                </button>
              ))}
            </div>
          )}
        </Card>
        
        <Card variant="outlined" padding="md" className="md:col-span-2">
          {selected ? (
            <div>
              <div className="flex items-center justify-between mb-3">
                <div className="text-sm font-semibold text-secondary-900 dark:text-secondary-100">Summary</div>
                <Badge variant="primary" size="sm">{selected}</Badge>
              </div>
              <div className="prose dark:prose-invert max-w-none text-sm whitespace-pre-wrap mb-4 text-secondary-700 dark:text-secondary-300">
                {summary || '—'}
              </div>
              <div className="text-sm font-semibold text-secondary-900 dark:text-secondary-100 mb-2">Documents</div>
              <div className="space-y-2 max-h-72 overflow-auto">
                {docs.map((d) => (
                  <div key={d.id} className="border border-secondary-200 dark:border-secondary-700 rounded-lg px-3 py-2 text-sm bg-secondary-50 dark:bg-secondary-800/50">
                    <div className="font-medium text-secondary-900 dark:text-secondary-100 truncate">{d.originalName}</div>
                    <div className="text-xs text-secondary-600 dark:text-secondary-400">{new Date(d.uploadedAt).toLocaleString()} • {d.wordCount} words • {d.chunkCount} chunks</div>
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <EmptyState
              icon={<Layers className="h-10 w-10" />}
              title="Select a cluster"
              description="Choose a cluster from the list to view its summary and documents"
            />
          )}
        </Card>
      </div>
    </div>
  );
};

export default ClustersView;
