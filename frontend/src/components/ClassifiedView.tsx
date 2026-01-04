import React, { useEffect, useState } from 'react';
import { FolderOpen } from 'lucide-react';
import { API_ENDPOINTS } from '../config/api';
import { Card, Input, Badge, EmptyState } from './ui';

interface GroupDoc { id: string; originalName: string; uploadedAt: string; wordCount: number; chunkCount: number; confidence?: number }
interface Group { label: string; docs: GroupDoc[] }

export const ClassifiedView: React.FC = () => {
  const [groups, setGroups] = useState<Group[]>([]);
  const [filter, setFilter] = useState('');

  useEffect(() => { load(); }, []);

  const load = async () => {
    try {
      const res = await fetch(`${API_ENDPOINTS.documents}/classified`);
      const data = await res.json();
      setGroups(data.groups || []);
    } catch (e) {
      // noop
    }
  };

  const filtered = groups.filter(g => g.label.toLowerCase().includes(filter.toLowerCase()));

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-bold text-secondary-900 dark:text-secondary-100">Classified</h2>
        <Input 
          value={filter} 
          onChange={(e) => setFilter(e.target.value)} 
          placeholder="Filter folders" 
          className="w-48"
        />
      </div>

      {filtered.length === 0 ? (
        <EmptyState
          icon={<FolderOpen className="h-12 w-12" />}
          title="No classified folders yet"
          description="Documents will be automatically classified as they are uploaded"
        />
      ) : (
        <div className="grid md:grid-cols-2 gap-6">
          {filtered.map((g) => (
            <Card key={g.label} variant="outlined" padding="md">
              <div className="flex items-center justify-between">
                <h3 className="text-lg font-semibold text-secondary-900 dark:text-secondary-100">{g.label}</h3>
                <Badge variant="secondary" size="sm">{g.docs.length} items</Badge>
              </div>
              <div className="mt-3 space-y-2 max-h-64 overflow-auto">
                {g.docs.map((d) => (
                  <div key={d.id} className="flex items-center justify-between text-sm border border-secondary-200 dark:border-secondary-700 rounded-lg px-3 py-2 bg-secondary-50 dark:bg-secondary-800/50">
                    <div className="truncate">
                      <div className="font-medium text-secondary-900 dark:text-secondary-100 truncate max-w-[20rem]">{d.originalName}</div>
                      <div className="text-xs text-secondary-500 dark:text-secondary-400">{new Date(d.uploadedAt).toLocaleString()} • {d.wordCount} words • {d.chunkCount} chunks</div>
                    </div>
                    {typeof d.confidence !== 'undefined' && (
                      <Badge variant="success" size="sm">{Math.round((d.confidence || 0) * 100)}%</Badge>
                    )}
                  </div>
                ))}
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
};

export default ClassifiedView;


