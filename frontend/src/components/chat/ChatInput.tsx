import React, { useRef, useEffect } from 'react';
import { Sparkles, Loader2 } from 'lucide-react';
import { Button, Checkbox } from '../ui';

interface ChatInputProps {
  value: string;
  onChange: (value: string) => void;
  onSend: () => void;
  isLoading: boolean;
  strategy: 'hybrid' | 'vector';
  onStrategyChange: (strategy: 'hybrid' | 'vector') => void;
  rerank: boolean;
  onRerankChange: (rerank: boolean) => void;
  disabled?: boolean;
}

export const ChatInput: React.FC<ChatInputProps> = ({
  value,
  onChange,
  onSend,
  isLoading,
  strategy,
  onStrategyChange,
  rerank,
  onRerankChange,
  disabled,
}) => {
  const textareaRef = useRef<HTMLTextAreaElement>(null);

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
        onSend();
      }
    }
  };

  return (
    <div className="border-t border-secondary-200 dark:border-secondary-800 bg-white dark:bg-secondary-900 p-4">
      <div className="max-w-3xl mx-auto">
        {/* Options row */}
        <div className="flex items-center gap-4 mb-3">
          <select
            value={strategy}
            onChange={(e) => onStrategyChange(e.target.value as 'hybrid' | 'vector')}
            className="text-sm border border-secondary-300 dark:border-secondary-600 rounded-lg px-3 py-1.5 bg-white dark:bg-secondary-800 text-secondary-700 dark:text-secondary-300 focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent shadow-sm"
          >
            <option value="hybrid">Hybrid Search</option>
            <option value="vector">Vector Search</option>
          </select>

          <Checkbox
            checked={rerank}
            onCheckedChange={(checked) => onRerankChange(checked as boolean)}
            label="Rerank results"
          />
        </div>

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

          <Button
            variant="primary"
            onClick={onSend}
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
          Press Enter to send, Shift+Enter for new line
        </p>
      </div>
    </div>
  );
};

export default ChatInput;
