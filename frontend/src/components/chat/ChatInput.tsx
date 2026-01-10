import React, { useRef, useEffect, useState } from 'react';
import { Sparkles, Loader2, Zap, FileText } from 'lucide-react';
import { Button } from '../ui';

export type ResponseMode = 'fast' | 'detail';

interface ChatInputProps {
  value: string;
  onChange: (value: string) => void;
  onSend: (mode: ResponseMode) => void;
  isLoading: boolean;
  strategy?: 'hybrid' | 'vector';
  onStrategyChange?: (strategy: 'hybrid' | 'vector') => void;
  rerank?: boolean;
  onRerankChange?: (rerank: boolean) => void;
  disabled?: boolean;
}

export const ChatInput: React.FC<ChatInputProps> = ({
  value,
  onChange,
  onSend,
  isLoading,
  disabled,
}) => {
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const [mode, setMode] = useState<ResponseMode>('fast');

  // Auto-resize textarea
  useEffect(() => {
    const textarea = textareaRef.current;
    if (textarea) {
      textarea.style.height = 'auto';
      textarea.style.height = `${Math.min(textarea.scrollHeight, 150)}px`;
    }
  }, [value]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      if (!isLoading && value.trim()) {
        onSend(mode);
      }
    }
  };

  const handleSendClick = () => {
    if (!isLoading && value.trim()) {
      onSend(mode);
    }
  };

  return (
    <div className="border-t border-secondary-200 dark:border-secondary-800 bg-white dark:bg-secondary-900 p-4">
      <div className="max-w-3xl mx-auto">
        {/* Input row */}
        <div className="flex gap-3">
          <div className="flex-1 relative">
            <textarea
              ref={textareaRef}
              value={value}
              onChange={(e) => onChange(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Ask anything about your documents..."
              disabled={disabled || isLoading}
              rows={1}
              className="w-full border border-secondary-300 dark:border-secondary-600 rounded-xl px-4 py-3 pr-12 bg-white dark:bg-secondary-800 text-secondary-900 dark:text-secondary-100 placeholder-secondary-400 dark:placeholder-secondary-500 focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent shadow-sm resize-none transition-all disabled:opacity-50 disabled:cursor-not-allowed"
              style={{ minHeight: '48px', maxHeight: '150px' }}
            />
            {isLoading && (
              <div className="absolute right-4 top-1/2 -translate-y-1/2">
                <Loader2 className="w-5 h-5 text-primary-500 animate-spin" />
              </div>
            )}
          </div>

          {/* Mode Toggle */}
          <div className="flex items-end">
            <div className="flex bg-secondary-100 dark:bg-secondary-800 rounded-lg p-1 shadow-sm border border-secondary-200 dark:border-secondary-700">
              <button
                type="button"
                onClick={() => setMode('fast')}
                disabled={disabled || isLoading}
                className={`flex items-center gap-1.5 px-3 py-2 rounded-md text-xs font-medium transition-all ${
                  mode === 'fast'
                    ? 'bg-white dark:bg-secondary-700 text-primary-600 dark:text-primary-400 shadow-sm'
                    : 'text-secondary-600 dark:text-secondary-400 hover:text-secondary-900 dark:hover:text-secondary-200'
                } disabled:opacity-50 disabled:cursor-not-allowed`}
                title="Fast mode - Quick, concise answers"
              >
                <Zap className="w-3.5 h-3.5" />
                <span>Fast</span>
              </button>
              <button
                type="button"
                onClick={() => setMode('detail')}
                disabled={disabled || isLoading}
                className={`flex items-center gap-1.5 px-3 py-2 rounded-md text-xs font-medium transition-all ${
                  mode === 'detail'
                    ? 'bg-white dark:bg-secondary-700 text-primary-600 dark:text-primary-400 shadow-sm'
                    : 'text-secondary-600 dark:text-secondary-400 hover:text-secondary-900 dark:hover:text-secondary-200'
                } disabled:opacity-50 disabled:cursor-not-allowed`}
                title="Detail mode - Comprehensive, structured answers"
              >
                <FileText className="w-3.5 h-3.5" />
                <span>Detail</span>
              </button>
            </div>
          </div>

          <Button
            variant="primary"
            onClick={handleSendClick}
            disabled={disabled || isLoading || !value.trim()}
            isLoading={isLoading}
            className="px-5 shadow-sm self-end"
            leftIcon={!isLoading && <Sparkles className="w-4 h-4" />}
          >
            {isLoading ? 'Thinking...' : 'Send'}
          </Button>
        </div>

        {/* Helper text */}
        <p className="text-xs text-secondary-400 dark:text-secondary-500 mt-2 text-center">
          Press Enter to send • Shift+Enter for new line • Toggle Fast/Detail mode per message
        </p>
      </div>
    </div>
  );
};

export default ChatInput;
