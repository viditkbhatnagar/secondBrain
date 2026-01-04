import React from 'react';
import { X } from 'lucide-react';
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
    <>
      {/* Backdrop */}
      <div 
        className="fixed inset-0 bg-black/50 dark:bg-black/70 z-40 transition-opacity"
        onClick={onClose}
      />
      
      {/* Sidebar */}
      <div className="fixed inset-y-0 right-0 w-full sm:w-[28rem] bg-white dark:bg-secondary-900 shadow-xl border-l border-secondary-200 dark:border-secondary-700 z-50 flex flex-col">
        <div className="flex items-center justify-between p-4 border-b border-secondary-200 dark:border-secondary-700">
          <div className="text-sm font-semibold text-secondary-900 dark:text-secondary-100">Knowledge Base Guide</div>
          <button 
            onClick={onClose} 
            className="p-1 rounded-lg text-secondary-500 dark:text-secondary-400 hover:text-secondary-800 dark:hover:text-secondary-200 hover:bg-secondary-100 dark:hover:bg-secondary-800 transition-colors"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="flex border-b border-secondary-200 dark:border-secondary-700 text-sm">
          <button
            onClick={() => setPage('rag-quality')}
            className={`px-4 py-3 transition-colors ${
              page === 'rag-quality' 
                ? 'text-primary-600 dark:text-primary-400 border-b-2 border-primary-600 dark:border-primary-400' 
                : 'text-secondary-600 dark:text-secondary-400 hover:text-secondary-900 dark:hover:text-secondary-200'
            }`}
          >
            RAG Quality
          </button>
        </div>

        <div className="flex-1 p-4 overflow-y-auto">
          {page === 'rag-quality' && <RagQualityPage />}
        </div>
      </div>
    </>
  );
};

export default RightSidebar;


