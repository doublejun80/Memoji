import React from 'react';
import { Badge } from './ui/badge';

interface TagRendererProps {
  text: string;
  onTagClick?: (tag: string) => void;
}

export const TagRenderer: React.FC<TagRendererProps> = ({ text, onTagClick }) => {
  const tagRegex = /#[\w가-힣\u4e00-\u9fff]+/g;
  
  // 간단한 마크다운 처리 함수
  const processSimpleMarkdown = (content: string) => {
    let processedText = content;
    
    // **굵은 글씨** 처리
    processedText = processedText.replace(/\*\*([^*]+?)\*\*/g, '<strong>$1</strong>');
    
    // *기울임* 처리
    processedText = processedText.replace(/(?<!\*)\*([^*\s][^*]*?[^*\s]|\S)\*(?!\*)/g, '<em>$1</em>');
    
    // ~~취소선~~ 처리
    processedText = processedText.replace(/~~([^~]+?)~~/g, '<del>$1</del>');
    
    // ==하이라이트== 처리
    processedText = processedText.replace(/==([^=]+?)==/g, '<mark class="bg-yellow-200 px-1 rounded">$1</mark>');
    
    // `인라인 코드` 처리
    processedText = processedText.replace(/`([^`]+)`/g, '<code class="bg-muted px-1 py-0.5 rounded text-sm font-mono">$1</code>');
    
    // 아이콘 처리 (기본적인 것들만)
    const iconMap: { [key: string]: string } = {
      ':check:': '✅',
      ':x:': '❌',
      ':heart:': '❤️',
      ':star:': '⭐',
      ':fire:': '🔥',
      ':thumbsup:': '👍',
      ':smile:': '😊',
      ':bulb:': '💡',
      ':warning:': '⚠️',
      ':note:': '📝',
      ':arrow_right:': '→'
    };
    
    Object.entries(iconMap).forEach(([code, icon]) => {
      const regex = new RegExp(code.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g');
      processedText = processedText.replace(regex, icon);
    });
    
    return processedText;
  };
  
  const renderTextWithTags = (content: string) => {
    const parts = [];
    let lastIndex = 0;
    let match;

    while ((match = tagRegex.exec(content)) !== null) {
      // Add text before the tag (with markdown processing)
      if (match.index > lastIndex) {
        const textPart = content.slice(lastIndex, match.index);
        const processedText = processSimpleMarkdown(textPart);
        parts.push(
          <span 
            key={`text-${lastIndex}`}
            dangerouslySetInnerHTML={{ __html: processedText }}
          />
        );
      }

      // Add the tag as a clickable badge
      const tag = match[0];
      parts.push(
        <Badge
          key={`${match.index}-${tag}`}
          variant="secondary"
          className="inline-flex items-center gap-1 px-2 py-0.5 mx-0.5 cursor-pointer hover:bg-primary hover:text-primary-foreground transition-colors"
          onClick={() => onTagClick?.(tag)}
        >
          🏷️ {tag.slice(1)}
        </Badge>
      );

      lastIndex = match.index + match[0].length;
    }

    // Add remaining text (with markdown processing)
    if (lastIndex < content.length) {
      const textPart = content.slice(lastIndex);
      const processedText = processSimpleMarkdown(textPart);
      parts.push(
        <span 
          key={`text-${lastIndex}`}
          dangerouslySetInnerHTML={{ __html: processedText }}
        />
      );
    }

    return parts.length > 0 ? parts : [
      <span key="default" dangerouslySetInnerHTML={{ __html: processSimpleMarkdown(content) }} />
    ];
  };

  return (
    <div className="inline">
      {renderTextWithTags(text)}
    </div>
  );
};