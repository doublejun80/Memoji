import React from 'react';

interface TagHighlightOverlayProps {
  content: string;
  className?: string;
}

export const TagHighlightOverlay: React.FC<TagHighlightOverlayProps> = ({ 
  content, 
  className = "" 
}) => {
  const tagRegex = /#[\w가-힣\u4e00-\u9fff]+/g;
  
  const renderHighlightedText = (text: string) => {
    const parts = [];
    let lastIndex = 0;
    let match;

    while ((match = tagRegex.exec(text)) !== null) {
      // Add text before the tag
      if (match.index > lastIndex) {
        parts.push(
          <span key={`text-${lastIndex}`}>
            {text.slice(lastIndex, match.index)}
          </span>
        );
      }

      // Add the highlighted tag
      const tag = match[0];
      parts.push(
        <span
          key={`tag-${match.index}`}
          className="inline-flex items-center bg-blue-100 dark:bg-blue-900/30 text-blue-800 dark:text-blue-200 px-1 rounded text-sm"
        >
          🏷️{tag.slice(1)}
        </span>
      );

      lastIndex = match.index + match[0].length;
    }

    // Add remaining text
    if (lastIndex < text.length) {
      parts.push(
        <span key={`text-${lastIndex}`}>
          {text.slice(lastIndex)}
        </span>
      );
    }

    return parts.length > 0 ? parts : [text];
  };

  return (
    <div 
      className={`absolute pointer-events-none whitespace-pre-wrap break-words ${className}`}
      style={{ 
        top: '0', 
        left: '0', 
        right: '0', 
        bottom: '0',
        overflow: 'hidden'
      }}
    >
      {content.split('\n').map((line, index) => (
        <div key={index} className="leading-6" style={{ minHeight: '1.5rem' }}>
          {renderHighlightedText(line)}
        </div>
      ))}
    </div>
  );
};