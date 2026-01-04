import React from 'react';
import { motion } from 'framer-motion';
import { clsx } from 'clsx';
import { FileQuestion, Search, Inbox, FolderOpen, AlertCircle, WifiOff } from 'lucide-react';
import { Button } from './Button';

type EmptyStateType = 'no-data' | 'no-results' | 'empty-inbox' | 'empty-folder' | 'error' | 'offline';

interface EmptyStateProps {
  type?: EmptyStateType;
  title: string;
  description?: string;
  icon?: React.ReactNode;
  action?: {
    label: string;
    onClick: () => void;
  };
  secondaryAction?: {
    label: string;
    onClick: () => void;
  };
  className?: string;
}

const defaultIcons: Record<EmptyStateType, React.ReactNode> = {
  'no-data': <FileQuestion className="h-12 w-12" />,
  'no-results': <Search className="h-12 w-12" />,
  'empty-inbox': <Inbox className="h-12 w-12" />,
  'empty-folder': <FolderOpen className="h-12 w-12" />,
  'error': <AlertCircle className="h-12 w-12" />,
  'offline': <WifiOff className="h-12 w-12" />,
};

const iconColors: Record<EmptyStateType, string> = {
  'no-data': 'text-secondary-400',
  'no-results': 'text-secondary-400',
  'empty-inbox': 'text-secondary-400',
  'empty-folder': 'text-secondary-400',
  'error': 'text-danger-400',
  'offline': 'text-warning-400',
};

export const EmptyState: React.FC<EmptyStateProps> = ({
  type = 'no-data',
  title,
  description,
  icon,
  action,
  secondaryAction,
  className,
}) => {
  const displayIcon = icon || defaultIcons[type];

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
      className={clsx(
        'flex flex-col items-center justify-center text-center py-12 px-4',
        className
      )}
    >
      <motion.div
        initial={{ scale: 0.8 }}
        animate={{ scale: 1 }}
        transition={{ duration: 0.3, delay: 0.1 }}
        className={clsx(
          'mb-4 p-4 rounded-full bg-secondary-100 dark:bg-secondary-800',
          iconColors[type]
        )}
      >
        {displayIcon}
      </motion.div>
      
      <h3 className="text-lg font-semibold text-secondary-900 dark:text-secondary-100 mb-2">
        {title}
      </h3>
      
      {description && (
        <p className="text-sm text-secondary-500 dark:text-secondary-400 max-w-sm mb-6">
          {description}
        </p>
      )}
      
      {(action || secondaryAction) && (
        <div className="flex items-center gap-3">
          {action && (
            <Button variant="primary" onClick={action.onClick}>
              {action.label}
            </Button>
          )}
          {secondaryAction && (
            <Button variant="ghost" onClick={secondaryAction.onClick}>
              {secondaryAction.label}
            </Button>
          )}
        </div>
      )}
    </motion.div>
  );
};

// Preset empty states
export const NoSearchResults: React.FC<{ query?: string; onClear?: () => void }> = ({
  query,
  onClear,
}) => (
  <EmptyState
    type="no-results"
    title="No results found"
    description={
      query
        ? `We couldn't find anything matching "${query}". Try adjusting your search.`
        : 'Try adjusting your search or filters to find what you\'re looking for.'
    }
    action={onClear ? { label: 'Clear search', onClick: onClear } : undefined}
  />
);

export const NoDocuments: React.FC<{ onUpload?: () => void }> = ({ onUpload }) => (
  <EmptyState
    type="empty-folder"
    title="No documents yet"
    description="Upload your first document to get started with your knowledge base."
    action={onUpload ? { label: 'Upload document', onClick: onUpload } : undefined}
  />
);

export const ErrorState: React.FC<{ message?: string; onRetry?: () => void }> = ({
  message,
  onRetry,
}) => (
  <EmptyState
    type="error"
    title="Something went wrong"
    description={message || 'An unexpected error occurred. Please try again.'}
    action={onRetry ? { label: 'Try again', onClick: onRetry } : undefined}
  />
);

export const OfflineState: React.FC<{ onRetry?: () => void }> = ({ onRetry }) => (
  <EmptyState
    type="offline"
    title="You're offline"
    description="Check your internet connection and try again."
    action={onRetry ? { label: 'Retry', onClick: onRetry } : undefined}
  />
);
