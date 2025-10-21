import React, { useState, useEffect, useRef } from 'react';
import { Page } from '../types';
import { Input } from './ui/input';
import { Button } from './ui/button';
import { Search, FileText, AlignLeft, Tag, X } from 'lucide-react';
import { TagRenderer } from './TagRenderer';
import { formatDateKey } from '../utils/dateUtils';
import AIChatAssistant from './AIChatAssistant';

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
}

interface SearchResult {
  page: Page;
  relevance: number;
  matchedContent: string;
  matchType: 'title' | 'content' | 'tag';
}

type SearchFilter = 'all' | 'title' | 'content' | 'tags';

export const RightPanel: React.FC<RightPanelProps> = ({
  pages,
  onPageSelect,
  isOpen,
  onClose,
  onDateSelect,
  selectedDate,
  datesWithPages,
  currentPage,
  onInsertText
}) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<SearchResult[]>([]);
  const [searchFilter, setSearchFilter] = useState<SearchFilter>('all');
  const inputRef = useRef<HTMLInputElement>(null);

  // 검색 실행
  const performSearch = (query: string, filter: SearchFilter) => {
    console.log('🔍 performSearch 호출');
    console.log('  - query:', query);
    console.log('  - filter:', filter);
    console.log('  - pages 개수:', pages.length);

    if (!query.trim()) {
      setSearchResults([]);
      return;
    }

    const searchTerms = query.toLowerCase().split(' ').filter(term => term.length > 0);
    console.log('  - searchTerms:', searchTerms);

    const results: SearchResult[] = [];

    pages.forEach(page => {
      console.log(`\n📄 페이지 검사: "${page.title}"`);
      console.log('  - tags:', page.tags);

      let relevance = 0;
      let matchedContent = '';
      let matchType: 'title' | 'content' | 'tag' = 'content';

      console.log(`  🔍 필터 확인: filter="${filter}"`);
      console.log(`    - 제목 검색 조건: ${filter === 'all' || filter === 'title'}`);
      console.log(`    - 내용 검색 조건: ${filter === 'all' || filter === 'content'}`);
      console.log(`    - 태그 검색 조건: ${filter === 'all' || filter === 'tags'}`);

      // 제목 검색 (태그 필터일 때는 제외)
      if (filter === 'all' || filter === 'title') {
        console.log('  📝 제목 검색 실행');
        const titleLower = page.title.toLowerCase();
        const titleMatches = searchTerms.filter(term => titleLower.includes(term)).length;
        if (titleMatches > 0) {
          relevance += titleMatches * 3;
          matchedContent = page.title;
          matchType = 'title';
          console.log('    ✅ 제목 매칭');
        }
      }

      // 내용 검색 (태그 필터일 때는 제외)
      if (filter === 'all' || filter === 'content') {
        console.log('  📄 내용 검색 실행');

        // 콘텐츠에서 #태그 패턴 제거 후 검색
        const contentWithoutTags = page.content.replace(/#[\w가-힣\u4e00-\u9fff]+/g, '');
        const contentLower = contentWithoutTags.toLowerCase();

        console.log('    - 원본 콘텐츠:', page.content.substring(0, 50));
        console.log('    - 태그 제거 후:', contentWithoutTags.substring(0, 50));

        const contentMatches = searchTerms.filter(term => contentLower.includes(term)).length;
        if (contentMatches > 0) {
          relevance += contentMatches;
          if (!matchedContent) {
            // 첫 검색어 위치에서 10글자만 표시
            const firstMatch = searchTerms.find(term => contentLower.includes(term));
            if (firstMatch) {
              const index = contentLower.indexOf(firstMatch);
              const start = index;
              const end = Math.min(contentWithoutTags.length, index + 10);
              matchedContent = contentWithoutTags.slice(start, end) + '...';
              matchType = 'content';
              console.log('    ✅ 내용 매칭 (태그 제외)');
            }
          }
        } else {
          console.log('    ❌ 내용 매칭 실패 (태그 제외 후)');
        }
      }

      // 태그 검색 (# 기호 무시)
      if (filter === 'all' || filter === 'tags') {
        console.log('  🏷️ 태그 검색 시작');
        console.log('    - page.tags:', page.tags);
        console.log('    - page.tags 타입:', typeof page.tags);
        console.log('    - page.tags.length:', page.tags?.length);

        const tagMatches = page.tags.filter(tag => {
          const matched = searchTerms.some(term => {
            // # 기호를 제거하고 비교
            const cleanTag = tag.replace(/^#/, '').toLowerCase();
            const cleanTerm = term.replace(/^#/, '').toLowerCase();
            const result = cleanTag.includes(cleanTerm);

            console.log(`    - 비교: "${tag}" (clean: "${cleanTag}") vs "${term}" (clean: "${cleanTerm}") → ${result}`);
            return result;
          });
          return matched;
        }).length;

        console.log('    - tagMatches:', tagMatches);

        if (tagMatches > 0) {
          relevance += tagMatches * 2;
          if (!matchedContent) {
            matchedContent = page.tags.map(t => t.startsWith('#') ? t : '#' + t).join(', ');
            matchType = 'tag';
          }
          console.log('    ✅ 태그 매칭 성공! relevance:', relevance);
        } else {
          console.log('    ❌ 태그 매칭 실패');
        }
      }

      if (relevance > 0) {
        console.log(`  ✅ 페이지 "${page.title}" 매칭됨! relevance: ${relevance}, matchType: ${matchType}`);
        results.push({
          page,
          relevance,
          matchedContent: matchedContent || page.content.slice(0, 100) + '...',
          matchType
        });
      } else {
        console.log(`  ❌ 페이지 "${page.title}" 매칭 안 됨`);
      }
    });

    console.log('\n📊 검색 결과 요약:');
    console.log('  - 총 매칭된 페이지:', results.length);
    console.log('  - 결과:', results.map(r => r.page.title));

    results.sort((a, b) => b.relevance - a.relevance);
    setSearchResults(results.slice(0, 20));
  };

  // 페이지 로드 시 태그 정보 출력
  useEffect(() => {
    console.log('📚 RightPanel - 전체 페이지 태그 정보:');
    pages.forEach(page => {
      if (page.tags && page.tags.length > 0) {
        console.log(`  - "${page.title}": tags =`, page.tags);
      }
    });
  }, [pages]);

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

  // 검색어 하이라이트
  const highlightText = (text: string, query: string) => {
    if (!query.trim()) return text;
    
    const searchTerms = query.toLowerCase().split(' ').filter(term => term.length > 0);
    let highlightedText = text;
    
    searchTerms.forEach(term => {
      const regex = new RegExp(`(${term})`, 'gi');
      highlightedText = highlightedText.replace(regex, '<mark class="bg-yellow-200 dark:bg-yellow-800">$1</mark>');
    });
    
    return highlightedText;
  };

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
            ref={inputRef}
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="검색..."
            className="h-6 pl-2.5 pr-5 bg-sidebar-accent border-sidebar-border text-sidebar-foreground placeholder:text-sidebar-foreground/50"
            style={{ fontSize: '10px' }}
          />
          {searchQuery && (
            <button
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
                    <h3
                      className="font-medium text-[10px] truncate text-sidebar-foreground leading-[1.3]"
                      dangerouslySetInnerHTML={{
                        __html: highlightText(result.page.title, searchQuery)
                      }}
                    />
                  </div>
                  <p
                    className="text-[10px] text-sidebar-foreground/60 line-clamp-1 mb-0.5 leading-[1.3]"
                    dangerouslySetInnerHTML={{
                      __html: highlightText(result.matchedContent, searchQuery)
                    }}
                  />
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
          currentPageContent={currentPage?.content}
        />
      </div>
    </div>
  );
};

