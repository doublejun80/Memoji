import React, { useState, useRef, useEffect } from 'react';
import { Block as BlockType, BlockType as BType } from '../types';
import { Checkbox } from './ui/checkbox';

interface BlockProps {
  block: BlockType;
  onUpdate: (block: BlockType) => void;
  onDelete: () => void;
  onNewBlock: (type: BType) => void;
  onSlashCommand: (position: { x: number; y: number }) => void;
}

export const Block: React.FC<BlockProps> = ({
  block,
  onUpdate,
  onDelete,
  onNewBlock,
  onSlashCommand
}) => {
  const [content, setContent] = useState(block.content?.text || '');
  const [isChecked, setIsChecked] = useState(block.content?.checked || false);
  const [selectedDate, setSelectedDate] = useState(block.content?.date || '');
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    setContent(block.content?.text || '');
    setIsChecked(block.content?.checked || false);
    setSelectedDate(block.content?.date || '');
  }, [block]);

  const handleContentChange = (value: string) => {
    setContent(value);
    
    const updatedBlock = {
      ...block,
      content: {
        ...block.content,
        text: value
      }
    };
    onUpdate(updatedBlock);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      // Create new block of the same type for list items and todos
      const nextBlockType = ['todo', 'bulleted-list', 'numbered-list'].includes(block.type) 
        ? block.type 
        : 'paragraph';
      onNewBlock(nextBlockType);
    }

    if (e.key === 'Backspace' && content === '') {
      e.preventDefault();
      onDelete();
    }

    if (content === '/' && e.key === ' ') {
      e.preventDefault();
      const rect = textareaRef.current?.getBoundingClientRect();
      if (rect) {
        onSlashCommand({
          x: rect.left,
          y: rect.bottom + 4
        });
      }
    }
  };

  const handleCheckChange = (checked: boolean) => {
    setIsChecked(checked);
    const updatedBlock = {
      ...block,
      content: {
        ...block.content,
        checked
      }
    };
    onUpdate(updatedBlock);
  };

  const handleDateChange = (date: string) => {
    setSelectedDate(date);
    const updatedBlock = {
      ...block,
      content: {
        ...block.content,
        date
      }
    };
    onUpdate(updatedBlock);
  };

  const getPlaceholder = () => {
    switch (block.type) {
      case 'h1': return "제목 1";
      case 'h2': return "제목 2";
      case 'h3': return "제목 3";
      case 'todo': return "할 일";
      case 'bulleted-list': return "목록";
      case 'numbered-list': return "번호 목록";
      case 'quote': return "인용문";
      case 'callout': return "콜아웃";
      case 'date': return "날짜를 선택하세요";
      default: return "'/' 명령어 입력";
    }
  };

  const getTextareaClass = () => {
    const baseClass = "w-full bg-transparent border-none outline-none resize-none overflow-hidden";
    
    switch (block.type) {
      case 'h1': return `${baseClass} text-3xl font-semibold`;
      case 'h2': return `${baseClass} text-2xl font-semibold`;
      case 'h3': return `${baseClass} text-xl font-semibold`;
      case 'quote': return `${baseClass} italic border-l-4 border-border pl-4 text-muted-foreground`;
      case 'callout': return `${baseClass} bg-accent/50 rounded-md p-3`;
      default: return baseClass;
    }
  };

  const renderPrefix = () => {
    switch (block.type) {
      case 'todo':
        return (
          <div className="flex items-center mr-2">
            <Checkbox
              checked={isChecked}
              onCheckedChange={handleCheckChange}
              className="h-4 w-4"
            />
          </div>
        );
      case 'bulleted-list':
        return <span className="mr-2 text-muted-foreground">•</span>;
      case 'numbered-list':
        return <span className="mr-2 text-muted-foreground">1.</span>;
      case 'callout':
        return <span className="mr-2">💡</span>;
      case 'date':
        return <span className="mr-2">📅</span>;
      default:
        return null;
    }
  };

  return (
    <div className="group flex items-start gap-1 py-1 relative">
      <div className="flex items-center">
        {renderPrefix()}
      </div>
      <div className="flex-1">
        {block.type === 'date' ? (
          <input
            type="date"
            value={selectedDate}
            onChange={(e) => handleDateChange(e.target.value)}
            className="w-full bg-transparent border-none outline-none"
            placeholder={getPlaceholder()}
          />
        ) : (
          <textarea
            ref={textareaRef}
            value={content}
            onChange={(e) => handleContentChange(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={getPlaceholder()}
            className={getTextareaClass()}
            rows={1}
            style={{
              height: 'auto',
              minHeight: '1.5rem'
            }}
            onInput={(e) => {
              const target = e.target as HTMLTextAreaElement;
              target.style.height = 'auto';
              target.style.height = target.scrollHeight + 'px';
            }}
          />
        )}
      </div>
    </div>
  );
};