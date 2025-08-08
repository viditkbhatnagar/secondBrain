import React, { useState } from 'react';
import { API_ENDPOINTS } from '../config/api';

export const ThreadActions: React.FC<{ threadId: string; refreshThreads: () => void } > = ({ threadId, refreshThreads }) => {
  const [title, setTitle] = useState('');
  const [isOpen, setIsOpen] = useState(false);

  const rename = async () => {
    try {
      await fetch(`${API_ENDPOINTS.baseChat}/threads/${threadId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title })
      });
      setIsOpen(false);
      setTitle('');
      refreshThreads();
    } catch {}
  };

  const del = async () => {
    if (!window.confirm('Delete this thread?')) return;
    try {
      await fetch(`${API_ENDPOINTS.baseChat}/threads/${threadId}`, { method: 'DELETE' });
      refreshThreads();
      window.location.reload();
    } catch {}
  };

  return (
    <div className="flex items-center space-x-2">
      <button onClick={() => setIsOpen(!isOpen)} className="text-xs px-2 py-1 border rounded">Rename</button>
      {isOpen && (
        <div className="flex items-center space-x-1">
          <input value={title} onChange={(e) => setTitle(e.target.value)} className="text-xs border rounded px-2 py-1" placeholder="New title" />
          <button onClick={rename} className="text-xs px-2 py-1 bg-blue-600 text-white rounded">Save</button>
        </div>
      )}
      <button onClick={del} className="text-xs px-2 py-1 border rounded text-red-600">Delete</button>
    </div>
  );
};

export default ThreadActions;


