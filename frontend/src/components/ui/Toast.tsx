import React, { createContext, useContext, useCallback, useState } from 'react';
import * as ToastPrimitive from '@radix-ui/react-toast';
import { motion, AnimatePresence } from 'framer-motion';
import { clsx } from 'clsx';
import { X, CheckCircle, AlertCircle, AlertTriangle, Info } from 'lucide-react';

type ToastType = 'success' | 'error' | 'warning' | 'info';

interface Toast {
  id: string;
  type: ToastType;
  title: string;
  description?: string;
  duration?: number;
}

interface ToastContextValue {
  toasts: Toast[];
  addToast: (toast: Omit<Toast, 'id'>) => void;
  removeToast: (id: string) => void;
  success: (title: string, description?: string) => void;
  error: (title: string, description?: string) => void;
  warning: (title: string, description?: string) => void;
  info: (title: string, description?: string) => void;
}

const ToastContext = createContext<ToastContextValue | null>(null);

export const useToast = () => {
  const context = useContext(ToastContext);
  if (!context) {
    throw new Error('useToast must be used within a ToastProvider');
  }
  return context;
};

const toastIcons: Record<ToastType, React.ReactNode> = {
  success: <CheckCircle className="h-5 w-5 text-success-500" />,
  error: <AlertCircle className="h-5 w-5 text-danger-500" />,
  warning: <AlertTriangle className="h-5 w-5 text-warning-500" />,
  info: <Info className="h-5 w-5 text-info-500" />,
};

const toastStyles: Record<ToastType, string> = {
  success: 'border-l-4 border-l-success-500',
  error: 'border-l-4 border-l-danger-500',
  warning: 'border-l-4 border-l-warning-500',
  info: 'border-l-4 border-l-info-500',
};

interface ToastItemProps {
  toast: Toast;
  onRemove: (id: string) => void;
}

const ToastItem: React.FC<ToastItemProps> = ({ toast, onRemove }) => {
  return (
    <ToastPrimitive.Root
      duration={toast.duration || 5000}
      onOpenChange={(open) => {
        if (!open) onRemove(toast.id);
      }}
      asChild
    >
      <motion.li
        initial={{ opacity: 0, x: 100, scale: 0.95 }}
        animate={{ opacity: 1, x: 0, scale: 1 }}
        exit={{ opacity: 0, x: 100, scale: 0.95 }}
        transition={{ duration: 0.2, ease: [0.4, 0, 0.2, 1] }}
        className={clsx(
          'relative flex items-start gap-3 p-4 pr-8',
          'bg-white dark:bg-secondary-800',
          'rounded-lg shadow-lg',
          'border border-secondary-200 dark:border-secondary-700',
          toastStyles[toast.type]
        )}
      >
        <div className="shrink-0 mt-0.5">{toastIcons[toast.type]}</div>
        <div className="flex-1 min-w-0">
          <ToastPrimitive.Title className="text-sm font-semibold text-secondary-900 dark:text-secondary-100">
            {toast.title}
          </ToastPrimitive.Title>
          {toast.description && (
            <ToastPrimitive.Description className="mt-1 text-sm text-secondary-500 dark:text-secondary-400">
              {toast.description}
            </ToastPrimitive.Description>
          )}
        </div>
        <ToastPrimitive.Close
          className="absolute top-3 right-3 p-1 text-secondary-400 hover:text-secondary-600 dark:hover:text-secondary-300 transition-colors rounded"
          aria-label="Close"
        >
          <X className="h-4 w-4" />
        </ToastPrimitive.Close>
      </motion.li>
    </ToastPrimitive.Root>
  );
};

export const ToastProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [toasts, setToasts] = useState<Toast[]>([]);

  const addToast = useCallback((toast: Omit<Toast, 'id'>) => {
    const id = Math.random().toString(36).substring(2, 9);
    setToasts((prev) => [...prev, { ...toast, id }]);
  }, []);

  const removeToast = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const success = useCallback(
    (title: string, description?: string) => addToast({ type: 'success', title, description }),
    [addToast]
  );

  const error = useCallback(
    (title: string, description?: string) => addToast({ type: 'error', title, description }),
    [addToast]
  );

  const warning = useCallback(
    (title: string, description?: string) => addToast({ type: 'warning', title, description }),
    [addToast]
  );

  const info = useCallback(
    (title: string, description?: string) => addToast({ type: 'info', title, description }),
    [addToast]
  );

  return (
    <ToastContext.Provider value={{ toasts, addToast, removeToast, success, error, warning, info }}>
      <ToastPrimitive.Provider swipeDirection="right">
        {children}
        <ToastPrimitive.Viewport asChild>
          <ul className="fixed bottom-4 right-4 z-[1080] flex flex-col gap-2 w-full max-w-sm outline-none">
            <AnimatePresence mode="popLayout">
              {toasts.map((toast) => (
                <ToastItem key={toast.id} toast={toast} onRemove={removeToast} />
              ))}
            </AnimatePresence>
          </ul>
        </ToastPrimitive.Viewport>
      </ToastPrimitive.Provider>
    </ToastContext.Provider>
  );
};
