import React, { useState, useRef, useEffect } from 'react';
import { Page } from '../../types';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { ChevronRight, ChevronDown, MoreHorizontal, Edit2, Trash2, ChevronUp, ChevronDown as ChevronDownMove } from 'lucide-react';
import { PageMenu } from './PageMenu';
import { TagRenderer } from '../TagRenderer';

interface PageItemProps {
  page: Page;
  level: number;
  isSelected: boolean;
  isExpanded: boolean;
  isEditing: boolean;
  editTitle: string;
  openMenu: string | null;
  children?: React.ReactNode;
  onSelect: (page: Page) => void;
  onToggleExpand: (pageId: string) => void;
  onStartEdit: (page: Page) => void;
  onSaveEdit: (pageId: string, newTitle: string) => void;
  onCancelEdit: () => void;
  onDelete: (pageId: string) => void;
  onMove: (pageId: string, direction: 'up' | 'down') => void;
  onCreateChild: (title: string, parentId: string) => void;
  onCreateChildFolder: (title: string, parentId: string) => void;
  onSetEditTitle: (title: string) => void;
  onSetOpenMenu: (menu: string | null) => void;
  hasChildren: boolean;
  canMoveUp: boolean;
  canMoveDown: boolean;
  onTagClick?: (tag: string) => void;
}

export const PageItem: React.FC<PageItemProps> = ({
  page,
  level,
  isSelected,
  isExpanded,
  isEditing,
  editTitle,
  openMenu,
  children,
  onSelect,
  onToggleExpand,
  onStartEdit,
  onSaveEdit,
  onCancelEdit,
  onDelete,
  onMove,
  onCreateChild,
  onCreateChildFolder,
  onSetEditTitle,
  onSetOpenMenu,
  hasChildren,
  canMoveUp,
  canMoveDown,
  onTagClick
}) => {
  const menuRef = useRef<HTMLDivElement>(null);

  const handleKeyPress = (e: React.KeyboardEvent, pageId: string) => {
    if (e.key === 'Enter') {
      onSaveEdit(pageId, editTitle);
    } else if (e.key === 'Escape') {
      onCancelEdit();
    }
  };

  return (
    <div>
      <div
        className={`flex items-center gap-1 px-2 py-1 rounded text-sm cursor-pointer group hover:bg-sidebar-accent ${
          isSelected ? 'bg-sidebar-accent text-sidebar-accent-foreground' : 'text-sidebar-foreground'
        }`}
        style={{ paddingLeft: `${8 + level * 16}px` }}
        onClick={(e) => {
          // 편집 모드가 아닐 때만 페이지 선택
          if (!isEditing) {
            onSelect(page);
          }
        }}
      >
        {/* Expand/Collapse Button */}
        <Button
          variant="ghost"
          size="sm"
          className="h-4 w-4 p-0 hover:bg-transparent"
          onClick={(e) => {
            e.stopPropagation(); // 페이지 선택 방지
            onToggleExpand(page.id);
          }}
        >
          {hasChildren ? (
            isExpanded ? (
              <ChevronDown className="h-3 w-3" />
            ) : (
              <ChevronRight className="h-3 w-3" />
            )
          ) : (
            <div className="h-3 w-3" />
          )}
        </Button>

        {/* Page Icon */}
        <span className="text-xs">{page.icon}</span>

        {/* Page Title */}
        {isEditing ? (
          <Input
            value={editTitle}
            onChange={(e) => onSetEditTitle(e.target.value)}
            onKeyDown={(e) => handleKeyPress(e, page.id)}
            onBlur={() => onSaveEdit(page.id, editTitle)}
            className="h-5 text-xs bg-transparent border-none p-0 focus:ring-0"
            autoFocus
            onClick={(e) => e.stopPropagation()} // 편집 중 클릭 이벤트 전파 방지
          />
        ) : (
          <span className="flex-1 truncate hover:text-sidebar-primary">
            <TagRenderer text={page.title} onTagClick={onTagClick} />
          </span>
        )}

        {/* Menu Button */}
        <div className="relative" ref={menuRef}>
          <Button
            variant="ghost"
            size="sm"
            className="h-4 w-4 p-0 opacity-0 group-hover:opacity-100 hover:bg-sidebar-accent-foreground/10"
            onClick={(e) => {
              e.stopPropagation();
              onSetOpenMenu(openMenu === page.id ? null : page.id);
            }}
          >
            <MoreHorizontal className="h-3 w-3" />
          </Button>

          {openMenu === page.id && (
            <PageMenu
              page={page}
              onStartEdit={onStartEdit}
              onDelete={onDelete}
              onMove={onMove}
              onCreateChild={onCreateChild}
              onCreateChildFolder={onCreateChildFolder}
              onClose={() => onSetOpenMenu(null)}
              canMoveUp={canMoveUp}
              canMoveDown={canMoveDown}
            />
          )}
        </div>
      </div>

      {/* Children */}
      {isExpanded && children}
    </div>
  );
};