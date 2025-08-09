import React, { useEffect, useState } from 'react';
import { API_ENDPOINTS } from '../config/api';

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
        <h2 className="text-2xl font-bold text-gray-900">Classified</h2>
        <input value={filter} onChange={(e) => setFilter(e.target.value)} placeholder="Filter folders" className="border rounded px-3 py-2 text-sm" />
      </div>

      {filtered.length === 0 ? (
        <div className="text-center py-12 bg-gray-50 rounded-lg">No classified folders yet.</div>
      ) : (
        <div className="grid md:grid-cols-2 gap-6">
          {filtered.map((g) => (
            <div key={g.label} className="bg-white border rounded-lg p-4">
              <div className="flex items-center justify-between">
                <h3 className="text-lg font-semibold">{g.label}</h3>
                <span className="text-xs text-gray-500">{g.docs.length} items</span>
              </div>
              <div className="mt-3 space-y-2 max-h-64 overflow-auto">
                {g.docs.map((d) => (
                  <div key={d.id} className="flex items-center justify-between text-sm border rounded px-2 py-1">
                    <div className="truncate">
                      <div className="font-medium truncate max-w-[20rem]">{d.originalName}</div>
                      <div className="text-xs text-gray-500">{new Date(d.uploadedAt).toLocaleString()} • {d.wordCount} words • {d.chunkCount} chunks</div>
                    </div>
                    {typeof d.confidence !== 'undefined' && (
                      <span className="text-xs text-gray-600">{Math.round((d.confidence || 0) * 100)}%</span>
                    )}
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default ClassifiedView;


