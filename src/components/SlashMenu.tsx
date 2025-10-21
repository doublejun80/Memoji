import React, { useState, useEffect } from 'react';
import { BlockCommand, BlockType } from '../types';

interface SlashMenuProps {
  isOpen: boolean;
  position: { x: number; y: number };
  onSelect: (type: BlockType) => void;
  onClose: () => void;
}

const BLOCK_COMMANDS: BlockCommand[] = [
  {
    id: 'paragraph',
    label: '텍스트',
    type: 'paragraph',
    icon: '📝',
    description: '일반 텍스트로 작성을 시작하세요.'
  },
  {
    id: 'h1',
    label: '제목 1',
    type: 'h1',
    icon: 'H1',
    description: '큰 섹션 제목입니다.'
  },
  {
    id: 'h2',
    label: '제목 2',
    type: 'h2',
    icon: 'H2',
    description: '중간 섹션 제목입니다.'
  },
  {
    id: 'h3',
    label: '제목 3',
    type: 'h3',
    icon: 'H3',
    description: '작은 섹션 제목입니다.'
  },
  {
    id: 'todo',
    label: '할 일 목록',
    type: 'todo',
    icon: '☐',
    description: '할 일 목록으로 작업을 관리하세요.'
  },
  {
    id: 'bulleted-list',
    label: '글머리 기호 목록',
    type: 'bulleted-list',
    icon: '•',
    description: '간단한 글머리 기호 목록을 만드세요.'
  },
  {
    id: 'numbered-list',
    label: '번호 목록',
    type: 'numbered-list',
    icon: '1.',
    description: '번호가 매겨진 목록을 만드세요.'
  },
  {
    id: 'quote',
    label: '인용문',
    type: 'quote',
    icon: '"',
    description: '인용문을 기록하세요.'
  },
  {
    id: 'callout',
    label: '콜아웃',
    type: 'callout',
    icon: '💡',
    description: '중요한 내용을 강조하세요.'
  },
  {
    id: 'date',
    label: '날짜',
    type: 'date',
    icon: '📅',
    description: '날짜를 선택하여 기록하세요.'
  }
];

export const SlashMenu: React.FC<SlashMenuProps> = ({
  isOpen,
  position,
  onSelect,
  onClose
}) => {
  const [selectedIndex, setSelectedIndex] = useState(0);

  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      switch (e.key) {
        case 'ArrowDown':
          e.preventDefault();
          setSelectedIndex(prev => 
            prev < BLOCK_COMMANDS.length - 1 ? prev + 1 : 0
          );
          break;
        case 'ArrowUp':
          e.preventDefault();
          setSelectedIndex(prev => 
            prev > 0 ? prev - 1 : BLOCK_COMMANDS.length - 1
          );
          break;
        case 'Enter':
          e.preventDefault();
          onSelect(BLOCK_COMMANDS[selectedIndex].type);
          onClose();
          break;
        case 'Escape':
          onClose();
          break;
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, selectedIndex, onSelect, onClose]);

  useEffect(() => {
    if (isOpen) {
      setSelectedIndex(0);
    }
  }, [isOpen]);

  if (!isOpen) return null;

  return (
    <>
      <div 
        className="fixed inset-0 z-40" 
        onClick={onClose}
      />
      <div
        className="fixed z-50 bg-card border border-border rounded-lg shadow-lg py-2 w-80 max-h-80 overflow-y-auto custom-scrollbar"
        style={{
          left: Math.min(position.x, window.innerWidth - 320),
          top: position.y + 8,
        }}
      >
        <div className="px-3 py-2 text-xs text-muted-foreground uppercase tracking-wide">
          기본 블록
        </div>
        {BLOCK_COMMANDS.map((command, index) => (
          <button
            key={command.id}
            className={`w-full px-3 py-2 text-left transition-colors duration-150 flex items-center gap-3 ${
              index === selectedIndex ? 'bg-accent' : 'hover:bg-accent'
            }`}
            onClick={() => {
              onSelect(command.type);
              onClose();
            }}
          >
            <span className="w-5 h-5 flex items-center justify-center text-sm flex-shrink-0">
              {command.icon}
            </span>
            <div className="flex-1 min-w-0">
              <div className="font-medium text-sm">{command.label}</div>
              <div className="text-xs text-muted-foreground">{command.description}</div>
            </div>
          </button>
        ))}
      </div>
    </>
  );
};