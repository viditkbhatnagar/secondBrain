import React, { useEffect, useState, useCallback } from 'react';
import { Users } from 'lucide-react';
import { API_ENDPOINTS } from '../config/api';
import { Card, Badge } from './ui';

interface EntityAgg { type: string; text: string; count: number }

export const EntitiesPanel: React.FC<{ onSelect: (e: EntityAgg) => void }> = ({ onSelect }) => {
  const [type, setType] = useState('PERSON');
  const [list, setList] = useState<EntityAgg[]>([]);

  const load = useCallback(async () => {
    try {
      const url = new URL(`${API_ENDPOINTS.documents}/entities`, window.location.origin);
      if (type) url.searchParams.set('type', type);
      const res = await fetch(url.toString());
      const data = await res.json();
      setList(data.entities || []);
    } catch {}
  }, [type]);

  useEffect(() => { load(); }, [load]);

  const typeOptions = [
    { value: '', label: 'All' },
    { value: 'PERSON', label: 'Person' },
    { value: 'ORG', label: 'Organization' },
    { value: 'DATE', label: 'Date' },
    { value: 'MONEY', label: 'Money' },
    { value: 'EMAIL', label: 'Email' },
    { value: 'PHONE', label: 'Phone' },
    { value: 'ADDRESS', label: 'Address' },
    { value: 'ID_NUMBER', label: 'ID Number' },
  ];

  return (
    <Card variant="outlined" padding="md">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <Users className="h-4 w-4 text-primary-500" />
          <span className="text-sm font-semibold text-secondary-900 dark:text-secondary-100">Entities</span>
        </div>
        <select 
          value={type} 
          onChange={(e) => setType(e.target.value)} 
          className="text-xs border border-secondary-300 dark:border-secondary-600 rounded-md px-2 py-1 bg-white dark:bg-secondary-800 text-secondary-700 dark:text-secondary-300 focus:outline-none focus:ring-2 focus:ring-primary-500"
        >
          {typeOptions.map(opt => (
            <option key={opt.value} value={opt.value}>{opt.label}</option>
          ))}
        </select>
      </div>
      
      {list.length === 0 ? (
        <div className="text-sm text-secondary-500 dark:text-secondary-400 text-center py-4">
          No entities found
        </div>
      ) : (
        <div className="max-h-64 overflow-auto text-xs space-y-1">
          {list.map((e, idx) => (
            <button 
              key={`${e.type}-${e.text}-${idx}`} 
              onClick={() => onSelect(e)} 
              className="w-full text-left border border-secondary-200 dark:border-secondary-700 rounded-lg px-3 py-2 hover:bg-secondary-50 dark:hover:bg-secondary-800 transition-colors"
            >
              <div className="font-medium text-secondary-900 dark:text-secondary-100">{e.text}</div>
              <div className="flex items-center gap-2 mt-1">
                <Badge variant="secondary" size="sm">{e.type}</Badge>
                <span className="text-secondary-500 dark:text-secondary-400">{e.count} occurrences</span>
              </div>
            </button>
          ))}
        </div>
      )}
    </Card>
  );
};

export default EntitiesPanel;
