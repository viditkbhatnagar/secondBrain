import React, { useState, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  PenSquare,
  MessageSquare,
  MoreHorizontal,
  Edit3,
  Trash2,
  Check,
  X,
} from 'lucide-react';
import { ChatThread } from './types';
import { groupThreadsByDate, getThreadDisplayTitle } from './utils';
import { Button, ConfirmModal } from '../ui';

interface ThreadSidebarProps {
  threads: ChatThread[];
  activeThreadId: string | null;
  onNewChat: () => void;
  onSelectThread: (threadId: string) => void;
  onRenameThread: (threadId: string, newTitle: string) => void;
  onDeleteThread: (threadId: string) => void;
}

interface ThreadItemProps {
  thread: ChatThread;
  isActive: boolean;
  onSelect: () => void;
  onRename: (newTitle: string) => void;
  onDelete: () => void;
}

const ThreadItem: React.FC<ThreadItemProps> = ({
  thread,
  isActive,
  onSelect,
  onRename,
  onDelete,
}) => {
  const [isEditing, setIsEditing] = useState(false);
  const [editTitle, setEditTitle] = useState('');
  const [showMenu, setShowMenu] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setShowMenu(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  useEffect(() => {
    if (isEditing && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [isEditing]);

  const startEditing = () => {
    setEditTitle(thread.title || '');
    setIsEditing(true);
    setShowMenu(false);
  };

  const saveEdit = () => {
    if (editTitle.trim()) {
      onRename(editTitle.trim());
    }
    setIsEditing(false);
  };

  const cancelEdit = () => {
    setIsEditing(false);
    setEditTitle('');
  };

  const handleDelete = () => {
    setShowMenu(false);
    setShowDeleteConfirm(true);
  };

  if (isEditing) {
    return (
      <div className="flex items-center gap-1 px-2 py-2">
        <input
          ref={inputRef}
          value={editTitle}
          onChange={(e) => setEditTitle(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') saveEdit();
            if (e.key === 'Escape') cancelEdit();
          }}
          className="flex-1 text-sm border border-primary-300 dark:border-primary-600 rounded-lg px-2 py-1.5 bg-white dark:bg-secondary-800 text-secondary-900 dark:text-secondary-100 focus:outline-none focus:ring-2 focus:ring-primary-500"
          placeholder="Thread name..."
        />
        <button
          onClick={saveEdit}
          className="p-1.5 text-success-600 hover:bg-success-50 dark:hover:bg-success-900/20 rounded-lg transition-colors"
        >
          <Check className="w-4 h-4" />
        </button>
        <button
          onClick={cancelEdit}
          className="p-1.5 text-secondary-500 hover:bg-secondary-100 dark:hover:bg-secondary-700 rounded-lg transition-colors"
        >
          <X className="w-4 h-4" />
        </button>
      </div>
    );
  }

  return (
    <>
      <div className="relative group">
        <div
          onClick={onSelect}
          role="button"
          tabIndex={0}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault();
              onSelect();
            }
          }}
          className={`w-full text-left px-3 py-2.5 rounded-lg flex items-center justify-between transition-all cursor-pointer ${
            isActive
              ? 'bg-primary-100 dark:bg-primary-900/30 text-primary-700 dark:text-primary-300'
              : 'hover:bg-secondary-100 dark:hover:bg-secondary-800 text-secondary-700 dark:text-secondary-300'
          }`}
        >
          <div className="flex items-center gap-2.5 min-w-0 flex-1">
            <MessageSquare
              className={`w-4 h-4 flex-shrink-0 ${
                isActive ? 'text-primary-600 dark:text-primary-400' : 'opacity-60'
              }`}
            />
            <span className="text-sm truncate font-medium">
              {getThreadDisplayTitle(thread)}
            </span>
          </div>

          {/* Menu button */}
          <div ref={menuRef} className="relative">
            <button
              onClick={(e) => {
                e.stopPropagation();
                setShowMenu(!showMenu);
              }}
              className={`p-1 rounded-md transition-all ${
                showMenu
                  ? 'opacity-100 bg-secondary-200 dark:bg-secondary-700'
                  : 'opacity-0 group-hover:opacity-100 hover:bg-secondary-200 dark:hover:bg-secondary-700'
              }`}
            >
              <MoreHorizontal className="w-4 h-4" />
            </button>

            {/* Dropdown menu */}
            <AnimatePresence>
              {showMenu && (
                <motion.div
                  initial={{ opacity: 0, scale: 0.95, y: -5 }}
                  animate={{ opacity: 1, scale: 1, y: 0 }}
                  exit={{ opacity: 0, scale: 0.95, y: -5 }}
                  transition={{ duration: 0.15 }}
                  className="absolute right-0 top-full mt-1 bg-white dark:bg-secondary-800 border border-secondary-200 dark:border-secondary-700 rounded-lg shadow-lg py-1 z-20 min-w-[120px]"
                >
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      startEditing();
                    }}
                    className="w-full text-left px-3 py-2 text-sm hover:bg-secondary-100 dark:hover:bg-secondary-700 flex items-center gap-2 text-secondary-700 dark:text-secondary-300"
                  >
                    <Edit3 className="w-4 h-4" />
                    Rename
                  </button>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      handleDelete();
                    }}
                    className="w-full text-left px-3 py-2 text-sm hover:bg-danger-50 dark:hover:bg-danger-900/20 flex items-center gap-2 text-danger-600 dark:text-danger-400"
                  >
                    <Trash2 className="w-4 h-4" />
                    Delete
                  </button>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </div>
      </div>

      {/* Delete confirmation modal */}
      <ConfirmModal
        open={showDeleteConfirm}
        onOpenChange={setShowDeleteConfirm}
        title="Delete conversation?"
        description="This will permanently delete this conversation and all its messages. This action cannot be undone."
        confirmText="Delete"
        onConfirm={() => {
          onDelete();
          setShowDeleteConfirm(false);
        }}
        variant="danger"
      />
    </>
  );
};

interface ThreadGroupProps {
  label: string;
  threads: ChatThread[];
  activeThreadId: string | null;
  onSelectThread: (threadId: string) => void;
  onRenameThread: (threadId: string, newTitle: string) => void;
  onDeleteThread: (threadId: string) => void;
}

const ThreadGroup: React.FC<ThreadGroupProps> = ({
  label,
  threads,
  activeThreadId,
  onSelectThread,
  onRenameThread,
  onDeleteThread,
}) => {
  if (threads.length === 0) return null;

  return (
    <div className="mb-4">
      <div className="text-xs font-semibold text-secondary-500 dark:text-secondary-400 uppercase tracking-wider px-3 mb-2">
        {label}
      </div>
      <div className="space-y-0.5">
        {threads.map((thread) => (
          <ThreadItem
            key={thread.threadId}
            thread={thread}
            isActive={activeThreadId === thread.threadId}
            onSelect={() => onSelectThread(thread.threadId)}
            onRename={(newTitle) => onRenameThread(thread.threadId, newTitle)}
            onDelete={() => onDeleteThread(thread.threadId)}
          />
        ))}
      </div>
    </div>
  );
};

export const ThreadSidebar: React.FC<ThreadSidebarProps> = ({
  threads,
  activeThreadId,
  onNewChat,
  onSelectThread,
  onRenameThread,
  onDeleteThread,
}) => {
  const groupedThreads = groupThreadsByDate(threads);

  return (
    <div className="w-64 bg-white dark:bg-secondary-900 border-r border-secondary-200 dark:border-secondary-800 flex flex-col h-full">
      {/* New Chat Button */}
      <div className="p-3 border-b border-secondary-200 dark:border-secondary-800">
        <Button
          variant="primary"
          fullWidth
          onClick={onNewChat}
          leftIcon={<PenSquare className="w-4 h-4" />}
          className="shadow-sm"
        >
          New Chat
        </Button>
      </div>

      {/* Thread List */}
      <div className="flex-1 overflow-y-auto p-2 scrollbar-thin">
        {threads.length === 0 ? (
          <div className="text-center text-secondary-500 dark:text-secondary-400 text-sm py-8 px-4">
            <MessageSquare className="w-8 h-8 mx-auto mb-2 opacity-50" />
            <p>No conversations yet</p>
            <p className="text-xs mt-1">Start a new chat to begin</p>
          </div>
        ) : (
          <>
            <ThreadGroup
              label="Today"
              threads={groupedThreads.today}
              activeThreadId={activeThreadId}
              onSelectThread={onSelectThread}
              onRenameThread={onRenameThread}
              onDeleteThread={onDeleteThread}
            />
            <ThreadGroup
              label="Yesterday"
              threads={groupedThreads.yesterday}
              activeThreadId={activeThreadId}
              onSelectThread={onSelectThread}
              onRenameThread={onRenameThread}
              onDeleteThread={onDeleteThread}
            />
            <ThreadGroup
              label="Previous 7 Days"
              threads={groupedThreads.previous7Days}
              activeThreadId={activeThreadId}
              onSelectThread={onSelectThread}
              onRenameThread={onRenameThread}
              onDeleteThread={onDeleteThread}
            />
            <ThreadGroup
              label="Previous 30 Days"
              threads={groupedThreads.previous30Days}
              activeThreadId={activeThreadId}
              onSelectThread={onSelectThread}
              onRenameThread={onRenameThread}
              onDeleteThread={onDeleteThread}
            />
            <ThreadGroup
              label="Older"
              threads={groupedThreads.older}
              activeThreadId={activeThreadId}
              onSelectThread={onSelectThread}
              onRenameThread={onRenameThread}
              onDeleteThread={onDeleteThread}
            />
          </>
        )}
      </div>
    </div>
  );
};

export default ThreadSidebar;
