import React, { useState, useEffect, useRef } from 'react';
import { motion } from 'framer-motion';
import { Bot, User, Copy, Check, RefreshCw, ThumbsUp, ThumbsDown } from 'lucide-react';
import { ChatMessage } from './types';
import { SourcesAccordion } from './SourcesAccordion';
import { formatTime } from './utils';
import { IconButton, Tooltip } from '../ui';

interface MessageBubbleProps {
  message: ChatMessage;
  onCopy?: (text: string) => void;
  onRegenerate?: () => void;
}

// Typewriter effect for streaming
const StreamingText: React.FC<{ text: string; isStreaming: boolean }> = ({
  text,
  isStreaming,
}) => {
  const [displayedText, setDisplayedText] = useState('');
  const indexRef = useRef(0);

  useEffect(() => {
    if (!isStreaming) {
      setDisplayedText(text);
      return;
    }

    // Reset on new text
    if (text.length < displayedText.length) {
      setDisplayedText('');
      indexRef.current = 0;
    }

    // Animate text appearance
    if (indexRef.current < text.length) {
      const charsToAdd = Math.min(3, text.length - indexRef.current);
      const timeout = setTimeout(() => {
        setDisplayedText(text.slice(0, indexRef.current + charsToAdd));
        indexRef.current += charsToAdd;
      }, 15);
      return () => clearTimeout(timeout);
    }
  }, [text, isStreaming, displayedText.length]);

  return (
    <div className="whitespace-pre-wrap text-sm leading-relaxed">
      {displayedText}
      {isStreaming && indexRef.current < text.length && (
        <span className="inline-block w-0.5 h-4 bg-primary-500 ml-0.5 animate-pulse" />
      )}
    </div>
  );
};

export const MessageBubble: React.FC<MessageBubbleProps> = ({
  message,
  onCopy,
  onRegenerate,
}) => {
  const [copied, setCopied] = useState(false);
  const isUser = message.role === 'user';

  const handleCopy = () => {
    onCopy?.(message.content);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className={`flex gap-3 ${isUser ? 'flex-row-reverse' : ''}`}
    >
      {/* Avatar */}
      <div
        className={`w-9 h-9 rounded-full flex items-center justify-center flex-shrink-0 shadow-sm ${
          isUser
            ? 'bg-secondary-200 dark:bg-secondary-700'
            : 'bg-gradient-to-br from-primary-500 to-accent-600'
        }`}
      >
        {isUser ? (
          <User className="w-5 h-5 text-secondary-600 dark:text-secondary-300" />
        ) : (
          <Bot className="w-5 h-5 text-white" />
        )}
      </div>

      {/* Content */}
      <div className={`flex-1 max-w-[80%] ${isUser ? 'flex flex-col items-end' : ''}`}>
        {/* Message bubble */}
        <div
          className={`px-4 py-3 rounded-2xl shadow-sm ${
            isUser
              ? 'bg-primary-600 text-white rounded-br-md'
              : 'bg-white dark:bg-secondary-800 text-secondary-800 dark:text-secondary-200 rounded-tl-md border border-secondary-200 dark:border-secondary-700'
          }`}
        >
          {message.isStreaming ? (
            <StreamingText text={message.content} isStreaming={true} />
          ) : (
            <div className="whitespace-pre-wrap text-sm leading-relaxed">
              {message.content}
            </div>
          )}
        </div>

        {/* Sources accordion (assistant only) */}
        {!isUser && !message.isStreaming && message.sources && message.sources.length > 0 && (
          <SourcesAccordion
            sources={message.sources}
            confidence={message.confidence || 75}
          />
        )}

        {/* Actions (assistant only) */}
        {!isUser && !message.isStreaming && (
          <div className="flex items-center gap-1 mt-2 opacity-0 group-hover:opacity-100 hover:opacity-100 transition-opacity">
            <Tooltip content={copied ? 'Copied!' : 'Copy'}>
              <IconButton
                icon={copied ? <Check className="w-4 h-4 text-success-500" /> : <Copy className="w-4 h-4" />}
                aria-label="Copy response"
                onClick={handleCopy}
                size="icon-sm"
              />
            </Tooltip>
            {onRegenerate && (
              <Tooltip content="Regenerate">
                <IconButton
                  icon={<RefreshCw className="w-4 h-4" />}
                  aria-label="Regenerate response"
                  onClick={onRegenerate}
                  size="icon-sm"
                />
              </Tooltip>
            )}
            <Tooltip content="Good response">
              <IconButton
                icon={<ThumbsUp className="w-4 h-4" />}
                aria-label="Good response"
                size="icon-sm"
                className="hover:text-success-600"
              />
            </Tooltip>
            <Tooltip content="Poor response">
              <IconButton
                icon={<ThumbsDown className="w-4 h-4" />}
                aria-label="Poor response"
                size="icon-sm"
                className="hover:text-danger-600"
              />
            </Tooltip>
          </div>
        )}

        {/* Timestamp */}
        {message.createdAt && (
          <div
            className={`text-xs text-secondary-400 dark:text-secondary-500 mt-1 ${
              isUser ? 'text-right' : ''
            }`}
          >
            {formatTime(message.createdAt)}
          </div>
        )}
      </div>
    </motion.div>
  );
};

export default MessageBubble;
