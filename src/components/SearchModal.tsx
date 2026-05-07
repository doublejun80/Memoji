import React, { useState, useEffect, useRef } from 'react';
import { Page } from '../types';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from './ui/dialog';
import { Input } from './ui/input';
import { Button } from './ui/button';
import { Search, FileText, Calendar, Tag } from 'lucide-react';
import { TagRenderer } from './TagRenderer';
import {
  SearchFilter,
  SearchResult,
  searchPages,
  splitHighlightedText,
} from '../utils/searchIndex';

interface SearchModalProps {
  isOpen: boolean;
  onClose: () => void;
  pages: Page[];
  onPageSelect: (page: Page) => void;
}

export const SearchModal: React.FC<SearchModalProps> = ({
  isOpen,
  onClose,
  pages,
  onPageSelect
}) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<SearchResult[]>([]);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [searchFilter, setSearchFilter] = useState<SearchFilter>('all');
  const inputRef = useRef<HTMLInputElement>(null);

  // 검색 실행
  const performSearch = (query: string, filter: SearchFilter) => {
    setSearchResults(searchPages(pages, query, filter, 10));
    setSelectedIndex(0);
  };

  // 검색어 변경 시 실시간 검색
  useEffect(() => {
    const debounceTimer = setTimeout(() => {
      performSearch(searchQuery, searchFilter);
    }, 300);

    return () => clearTimeout(debounceTimer);
  }, [searchQuery, searchFilter, pages]);

  // 모달이 열릴 때 입력창에 포커스
  useEffect(() => {
    if (isOpen && inputRef.current) {
      inputRef.current.focus();
    }
  }, [isOpen]);

  // 키보드 네비게이션
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setSelectedIndex(prev => Math.min(prev + 1, searchResults.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setSelectedIndex(prev => Math.max(prev - 1, 0));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (searchResults[selectedIndex]) {
        handleSelectPage(searchResults[selectedIndex].page);
      }
    } else if (e.key === 'Escape') {
      onClose();
    }
  };

  const handleSelectPage = (page: Page) => {
    onPageSelect(page);
    onClose();
    setSearchQuery('');
  };

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

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-2xl max-h-[80vh] p-0">
        <DialogHeader className="p-6 pb-0">
          <DialogTitle className="flex items-center gap-2 text-lg">
            <Search className="w-5 h-5" />
            전체 검색
          </DialogTitle>
        </DialogHeader>
        
        <div className="p-6 pt-4">
          {/* 검색 입력창 */}
          <div className="relative mb-4">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input
              ref={inputRef}
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="페이지 제목, 내용, 태그 검색..."
              className="pl-10 text-sm"
            />
          </div>

          {/* 검색 필터 */}
          <div className="flex gap-2 mb-4">
            {[
              { key: 'all', label: '전체', icon: Search },
              { key: 'title', label: '제목', icon: FileText },
              { key: 'content', label: '내용', icon: FileText },
              { key: 'tags', label: '태그', icon: Tag }
            ].map(({ key, label, icon: Icon }) => (
              <Button
                key={key}
                variant={searchFilter === key ? 'default' : 'outline'}
                size="sm"
                onClick={() => setSearchFilter(key as SearchFilter)}
                className="flex items-center gap-1 text-xs"
              >
                <Icon className="w-3 h-3" />
                {label}
              </Button>
            ))}
          </div>

          {/* 검색 결과 */}
          <div className="max-h-96 overflow-y-auto">
            {searchQuery.trim() && searchResults.length === 0 && (
              <div className="text-center py-8 text-muted-foreground">
                검색 결과가 없습니다.
              </div>
            )}
            
            {searchResults.map((result, index) => (
              <div
                key={result.page.id}
                className={`p-3 rounded-lg cursor-pointer transition-colors ${
                  index === selectedIndex 
                    ? 'bg-accent' 
                    : 'hover:bg-accent/50'
                }`}
                onClick={() => handleSelectPage(result.page)}
              >
                <div className="flex items-start gap-3">
                  <div className="flex-shrink-0 mt-1">
                    {result.page.type === 'folder' ? '📁' : '📄'}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <h3 className="font-medium truncate">
                        {renderHighlightedText(result.page.title)}
                      </h3>
                      <span className="text-xs text-muted-foreground">
                        {result.matchType === 'title' && '제목'}
                        {result.matchType === 'content' && '내용'}
                        {result.matchType === 'tag' && '태그'}
                      </span>
                    </div>
                    <p className="text-sm text-muted-foreground line-clamp-2">
                      {renderHighlightedText(result.matchedContent)}
                    </p>
                    {result.page.tags.length > 0 && (
                      <div className="flex flex-wrap gap-1 mt-2">
                        {result.page.tags.map((tag, tagIndex) => (
                          <TagRenderer 
                            key={tagIndex} 
                            text={`#${tag}`} 
                            onTagClick={() => {}}
                          />
                        ))}
                      </div>
                    )}
                    <div className="text-xs text-muted-foreground mt-1">
                      {new Date(result.page.updatedAt).toLocaleDateString('ko-KR')}
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>

          {searchQuery.trim() && (
            <div className="mt-4 text-xs text-muted-foreground text-center">
              ↑↓ 키로 이동, Enter로 선택, Esc로 닫기
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
};
