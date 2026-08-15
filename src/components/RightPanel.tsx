import React, { useState, useEffect, useRef } from 'react';
import { Page } from '../types';
import { Input } from './ui/input';
import { Button } from './ui/button';
import { Search, FileText, AlignLeft, Tag, X } from 'lucide-react';
import AIChatAssistant from './AIChatAssistant';
import {
  SearchFilter,
  SearchResult,
  searchPages,
  splitHighlightedText,
} from '../utils/searchIndex';

interface RightPanelProps {
  pages: Page[];
  onPageSelect: (page: Page) => void;
  isOpen: boolean;
  onClose: () => void;
  onDateSelect: (date: Date) => void;
  selectedDate: Date;
  datesWithPages: string[];
  currentPage?: Page | null;
  onInsertText?: (text: string) => void;
  onReplaceText?: (targetText: string, replacementText: string) => boolean;
}

export const RightPanel: React.FC<RightPanelProps> = ({
  pages,
  onPageSelect,
  isOpen,
  onClose,
  onDateSelect,
  selectedDate,
  datesWithPages,
  currentPage,
  onInsertText,
  onReplaceText
}) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<SearchResult[]>([]);
  const [searchFilter, setSearchFilter] = useState<SearchFilter>('all');
  const inputRef = useRef<HTMLInputElement>(null);

  // 검색 실행
  const performSearch = (query: string, filter: SearchFilter) => {
    setSearchResults(searchPages(pages, query, filter, 20));
  };

  // 검색어 변경 시 실시간 검색
  useEffect(() => {
    const debounceTimer = setTimeout(() => {
      performSearch(searchQuery, searchFilter);
    }, 300);

    return () => clearTimeout(debounceTimer);
  }, [searchQuery, searchFilter, pages]);

  // 패널이 열릴 때 입력창에 포커스
  useEffect(() => {
    if (isOpen && inputRef.current) {
      inputRef.current.focus();
    }
  }, [isOpen]);

  const renderHighlightedText = (text: string) =>
    splitHighlightedText(text, searchQuery).map((part, index) =>
      part.match ? (
        <mark key={index} className="bg-yellow-200 dark:bg-yellow-800">
          {part.text}
        </mark>
      ) : (
        <React.Fragment key={index}>{part.text}</React.Fragment>
      )
    );

  const handleSelectPage = (page: Page) => {
    onPageSelect(page);
  };

  if (!isOpen) return null;

  const filterButtons = [
    { key: 'all' as SearchFilter, label: '전체', icon: Search },
    { key: 'title' as SearchFilter, label: '제목', icon: FileText },
    { key: 'content' as SearchFilter, label: '내용', icon: AlignLeft },
    { key: 'tags' as SearchFilter, label: '태그', icon: Tag }
  ];

  return (
    <div className="w-64 border-l border-sidebar-border bg-sidebar flex flex-col h-full flex-shrink-0">
      {/* 상단 검색 영역 */}
      <div className="px-4 py-2 pb-3 border-b border-sidebar-border space-y-2">
        {/* 검색 입력창 */}
        <div className="relative">
          <Input
            id="memoji-context-search"
            name="context-search"
            aria-label="컨텍스트 검색"
            ref={inputRef}
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="검색..."
            className="h-6 pl-2.5 pr-5 bg-sidebar-accent border-sidebar-border text-sidebar-foreground placeholder:text-sidebar-foreground/50"
            style={{ fontSize: '10px' }}
          />
          {searchQuery && (
            <button
              type="button"
              aria-label="검색어 지우기"
              onClick={() => setSearchQuery('')}
              className="absolute right-1 top-1/2 transform -translate-y-1/2 text-sidebar-foreground/50 hover:text-sidebar-foreground"
            >
              <X style={{ width: '8px', height: '8px' }} />
            </button>
          )}
        </div>

        {/* 필터 버튼 - 아이콘만 표시 */}
        <div className="flex gap-1">
          {filterButtons.map(({ key, label, icon: Icon }) => (
            <Button
              key={key}
              variant={searchFilter === key ? 'default' : 'outline'}
              size="sm"
              onClick={() => setSearchFilter(key)}
              className="flex-1 h-5 w-5 p-0"
              title={label}
            >
              <Icon className="w-2.5 h-2.5" />
            </Button>
          ))}
        </div>
      </div>

      {/* 검색 결과 영역 - 고정 높이 (2개 분량), 스크롤 가능 */}
      <div className="flex-shrink-0 border-b border-sidebar-border overflow-hidden flex flex-col" style={{ maxHeight: '180px' }}>
        <div className="flex-1 overflow-y-auto px-2 py-1">
          {searchQuery.trim() && searchResults.length === 0 && (
            <div className="text-center py-12 text-sidebar-foreground/50 text-[10px]">
            <p>검색 결과가 없습니다</p>
        </div>
          )}

          {searchResults.map((result) => (
            <div
              key={result.page.id}
              className="p-2 rounded cursor-pointer transition-colors hover:bg-accent hover:text-accent-foreground dark:hover:bg-accent/40 mb-1"
              onClick={() => handleSelectPage(result.page)}
            >
              <div className="flex items-start gap-2">
                <div className="flex-shrink-0 mt-0.5 text-sm">
                  {result.page.type === 'folder' ? '📁' : '📄'}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1 mb-0.5">
                    <h3 className="font-medium text-[10px] truncate text-sidebar-foreground leading-[1.3]">
                      {renderHighlightedText(result.page.title)}
                    </h3>
                  </div>
                  <p className="text-[10px] text-sidebar-foreground/60 line-clamp-1 mb-0.5 leading-[1.3]">
                    {renderHighlightedText(result.matchedContent)}
                  </p>
                  {result.page.tags.length > 0 && (
                    <div className="flex flex-wrap gap-0.5 mt-0.5">
                      {result.page.tags.slice(0, 2).map((tag, tagIndex) => (
                        <span
                          key={tagIndex}
                          className="text-[10px] px-1.5 py-0.5 rounded bg-yellow-100 dark:bg-yellow-900/30 text-yellow-800 dark:text-yellow-400 leading-[1.3]"
                        >
                          #{tag}
                        </span>
                      ))}
                      {result.page.tags.length > 2 && (
                        <span className="text-[10px] text-sidebar-foreground/50 leading-[1.3]">
                          +{result.page.tags.length - 2}
                        </span>
                      )}
                    </div>
                  )}
                  <div className="text-[10px] text-sidebar-foreground/50 mt-0.5 leading-[1.3]">
                    {(() => {
                      // 로컬 시간대로 직접 변환
                      const date = new Date(result.page.updatedAt);
                      const year = date.getFullYear();
                      const month = date.getMonth() + 1;
                      const day = date.getDate();
                      const localDate = new Date(year, month - 1, day);
                      return localDate.toLocaleDateString('ko-KR', {
                        month: 'short',
                        day: 'numeric'
                      });
                    })()}
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* AI 도우미 - 나머지 공간 전부 차지 */}
      <div className="flex-1 border-t border-sidebar-border overflow-hidden">
        <AIChatAssistant
          onInsertText={onInsertText}
          onReplaceText={onReplaceText}
          currentPageContent={currentPage?.content}
        />
      </div>
    </div>
  );
};
