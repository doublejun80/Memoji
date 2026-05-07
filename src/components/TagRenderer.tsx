import React from 'react';
import { Badge } from './ui/badge';

interface TagRendererProps {
  text: string;
  onTagClick?: (tag: string) => void;
}

export const TagRenderer: React.FC<TagRendererProps> = ({ text, onTagClick }) => {
  const tagRegex = /#[\w가-힣\u4e00-\u9fff]+/g;
  const iconMap: Record<string, string> = {
    ':check:': '✓',
    ':x:': '×',
    ':star:': '★',
    ':arrow_right:': '→',
  };

  const renderText = (content: string, keyPrefix: string) => {
    const pattern = new RegExp(`(${Object.keys(iconMap).map(code => code.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|')})`, 'g');
    const parts = content.split(pattern).filter(part => part.length > 0);

    return parts.map((part, index) => (
      <React.Fragment key={`${keyPrefix}-${index}`}>
        {iconMap[part] || part}
      </React.Fragment>
    ));
  };
  
  const renderTextWithTags = (content: string) => {
    const parts: React.ReactNode[] = [];
    let lastIndex = 0;
    let match;

    while ((match = tagRegex.exec(content)) !== null) {
      if (match.index > lastIndex) {
        const textPart = content.slice(lastIndex, match.index);
        parts.push(<span key={`text-${lastIndex}`}>{renderText(textPart, `text-${lastIndex}`)}</span>);
      }

      const tag = match[0];
      parts.push(
        <Badge
          key={`${match.index}-${tag}`}
          variant="secondary"
          className="inline-flex items-center gap-1 px-2 py-0.5 mx-0.5 cursor-pointer hover:bg-primary hover:text-primary-foreground transition-colors"
          onClick={() => onTagClick?.(tag)}
        >
          #{tag.slice(1)}
        </Badge>
      );

      lastIndex = match.index + match[0].length;
    }

    if (lastIndex < content.length) {
      const textPart = content.slice(lastIndex);
      parts.push(<span key={`text-${lastIndex}`}>{renderText(textPart, `text-${lastIndex}`)}</span>);
    }

    return parts.length > 0 ? parts : [
      <span key="default">{renderText(content, 'default')}</span>
    ];
  };

  return (
    <div className="inline">
      {renderTextWithTags(text)}
    </div>
  );
};
