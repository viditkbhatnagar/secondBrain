import React, { useEffect, useState } from 'react';
import { API_ENDPOINTS } from '../config/api';

interface EntityAgg { type: string; text: string; count: number }

export const EntitiesPanel: React.FC<{ onSelect: (e: EntityAgg) => void }>
  = ({ onSelect }) => {
  const [type, setType] = useState('PERSON');
  const [list, setList] = useState<EntityAgg[]>([]);

  useEffect(() => { load(); }, [type]);

  const load = async () => {
    try {
      const url = new URL(`${API_ENDPOINTS.documents}/entities`, window.location.origin);
      if (type) url.searchParams.set('type', type);
      const res = await fetch(url.toString());
      const data = await res.json();
      setList(data.entities || []);
    } catch {}
  };

  return (
    <div className="bg-white border rounded p-3">
      <div className="flex items-center justify-between mb-2">
        <div className="text-sm font-semibold">Entities</div>
        <select value={type} onChange={(e) => setType(e.target.value)} className="text-xs border rounded px-2 py-1">
          <option value="">All</option>
          <option value="PERSON">PERSON</option>
          <option value="ORG">ORG</option>
          <option value="DATE">DATE</option>
          <option value="MONEY">MONEY</option>
          <option value="EMAIL">EMAIL</option>
          <option value="PHONE">PHONE</option>
          <option value="ADDRESS">ADDRESS</option>
          <option value="ID_NUMBER">ID_NUMBER</option>
        </select>
      </div>
      <div className="max-h-64 overflow-auto text-xs space-y-1">
        {list.map((e, idx) => (
          <button key={`${e.type}-${e.text}-${idx}`} onClick={() => onSelect(e)} className="w-full text-left border rounded px-2 py-1 hover:bg-gray-50">
            <div className="font-medium">{e.text}</div>
            <div className="text-gray-500">{e.type} • {e.count}</div>
          </button>
        ))}
      </div>
    </div>
  );
};

export default EntitiesPanel;


