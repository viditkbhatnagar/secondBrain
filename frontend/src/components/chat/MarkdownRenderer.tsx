import React from 'react';

interface MarkdownRendererProps {
  content: string;
  className?: string;
}

/**
 * Lightweight markdown renderer that supports:
 * - Bold text: **text** or __text__
 * - Bullet points: - item or * item
 * - Preserves line breaks and spacing
 */
export const MarkdownRenderer: React.FC<MarkdownRendererProps> = ({ content, className = '' }) => {
  const renderContent = () => {
    const lines = content.split('\n');
    const elements: JSX.Element[] = [];
    
    lines.forEach((line, lineIndex) => {
      // Check if line is a bullet point
      const bulletMatch = line.match(/^[\s]*[-*]\s+(.+)$/);
      
      if (bulletMatch) {
        // Render as bullet point
        const bulletContent = bulletMatch[1];
        elements.push(
          <div key={lineIndex} className="flex gap-2 my-1">
            <span className="text-secondary-400 dark:text-secondary-500">•</span>
            <span>{renderBoldText(bulletContent)}</span>
          </div>
        );
      } else if (line.trim() === '') {
        // Empty line - add spacing
        elements.push(<div key={lineIndex} className="h-2" />);
      } else {
        // Regular line with potential bold text
        elements.push(
          <div key={lineIndex} className="my-0.5">
            {renderBoldText(line)}
          </div>
        );
      }
    });
    
    return elements;
  };

  const renderBoldText = (text: string) => {
    // Handle **text** and __text__ for bold
    const boldRegex = /(\*\*|__)(.*?)\1/g;
    const parts: (string | JSX.Element)[] = [];
    let lastIndex = 0;
    let match;
    let keyCounter = 0;

    while ((match = boldRegex.exec(text)) !== null) {
      // Add text before the match
      if (match.index > lastIndex) {
        parts.push(text.substring(lastIndex, match.index));
      }
      
      // Add bold text (increased size for headings/subheadings)
      parts.push(
        <strong key={`bold-${keyCounter++}`} className="font-semibold text-secondary-900 dark:text-secondary-100 text-[15px]">
          {match[2]}
        </strong>
      );
      
      lastIndex = match.index + match[0].length;
    }
    
    // Add remaining text
    if (lastIndex < text.length) {
      parts.push(text.substring(lastIndex));
    }
    
    return parts.length > 0 ? parts : text;
  };

  return (
    <div className={`whitespace-pre-wrap text-sm leading-relaxed ${className}`}>
      {renderContent()}
    </div>
  );
};

export default MarkdownRenderer;
