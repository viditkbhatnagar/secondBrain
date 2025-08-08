import React from 'react';
import RagQualityPage from './RagQualityPage';

type PageKey = 'rag-quality';

interface RightSidebarProps {
  isOpen: boolean;
  onClose: () => void;
}

export const RightSidebar: React.FC<RightSidebarProps> = ({ isOpen, onClose }) => {
  const [page, setPage] = React.useState<PageKey>('rag-quality');

  if (!isOpen) return null;

  return (
    <div className="fixed inset-y-0 right-0 w-full sm:w-[28rem] bg-white shadow-xl border-l border-gray-200 z-50 flex flex-col">
      <div className="flex items-center justify-between p-3 border-b">
        <div className="text-sm font-semibold text-gray-800">Knowledge Base Guide</div>
        <button onClick={onClose} className="text-gray-500 hover:text-gray-800">✕</button>
      </div>

      <div className="flex border-b text-sm">
        <button
          onClick={() => setPage('rag-quality')}
          className={`px-3 py-2 ${page==='rag-quality' ? 'text-blue-600 border-b-2 border-blue-600' : 'text-gray-600'}`}
        >
          RAG Quality
        </button>
      </div>

      <div className="p-4 overflow-y-auto">
        {page === 'rag-quality' && <RagQualityPage />}
      </div>
    </div>
  );
};

export default RightSidebar;


