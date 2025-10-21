import React, { useState, useRef, useEffect } from 'react';
import { Page } from '../types';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from './ui/alert-dialog';
import { Plus, ChevronRight, ChevronDown, MoreHorizontal, Trash2, Edit2, ArrowUp, ArrowDown, FolderPlus } from 'lucide-react';
import { CalendarWidget } from './CalendarWidget';
import { toLocalISOString } from '../utils/dateUtils';

interface SidebarProps {
  pages: Page[];
  currentPage: Page | null;
  onPageSelect: (page: Page) => void;
  onPageCreate: (title: string, parentId?: string) => void;
  onFolderCreate: (title: string, parentId?: string) => void;
  onPageUpdate: (page: Page) => void;
  onPageDelete: (pageId: string) => void;
  onPageMove: (pageId: string, direction: 'up' | 'down') => void;
  onDateSelect: (date: Date) => void;
  selectedDate: Date;
  datesWithPages: string[];
  onClose: () => void;
  onInsertText?: (text: string) => void;
}

export const Sidebar: React.FC<SidebarProps> = ({
  pages,
  currentPage,
  onPageSelect,
  onPageCreate,
  onFolderCreate,
  onPageUpdate,
  onPageDelete,
  onPageMove,
  onDateSelect,
  selectedDate,
  datesWithPages,
  onClose,
  onInsertText
}) => {
  const [expandedPages, setExpandedPages] = useState<Set<string>>(new Set());
  const [editingPage, setEditingPage] = useState<string | null>(null);
  const [editTitle, setEditTitle] = useState('');
  const [openMenu, setOpenMenu] = useState<string | null>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  const toggleExpanded = (pageId: string) => {
    const newExpanded = new Set(expandedPages);
    if (newExpanded.has(pageId)) {
      newExpanded.delete(pageId);
    } else {
      newExpanded.add(pageId);
    }
    setExpandedPages(newExpanded);
  };

  const startEditing = (page: Page) => {
    setEditingPage(page.id);
    setEditTitle(page.title);
    setOpenMenu(null);
  };

  const finishEditing = () => {
    if (editingPage && editTitle.trim()) {
      const page = pages.find(p => p.id === editingPage);
      if (page) {
        onPageUpdate({
          ...page,
          title: editTitle.trim(),
          updatedAt: toLocalISOString(new Date())
        });
      }
    }
    setEditingPage(null);
    setEditTitle('');
  };

  const formatDate = () => {
    const month = selectedDate.getMonth() + 1;
    const date = selectedDate.getDate();
    const dayNames = ['일', '월', '화', '수', '목', '금', '토'];
    const dayName = dayNames[selectedDate.getDay()];
    return `${month}월 ${date}일(${dayName})`;
  };

  const handleMenuClick = (pageId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setOpenMenu(openMenu === pageId ? null : pageId);
  };

  const handleMenuAction = (action: () => void) => {
    action();
    setOpenMenu(null);
  };

  // Close menu when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setOpenMenu(null);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, []);

  const renderPageTree = (parentId: string | null = null, level: number = 0) => {
    const childPages = pages.filter(page => page.parentId === parentId);
    
    return childPages.map((page, index) => {
      const hasChildren = pages.some(p => p.parentId === page.id);
      const isExpanded = expandedPages.has(page.id);
      const isSelected = currentPage?.id === page.id;
      const isEditing = editingPage === page.id;
      const canMoveUp = index > 0;
      const canMoveDown = index < childPages.length - 1;
      const isMenuOpen = openMenu === page.id;

      return (
        <div key={page.id} className="relative">
          <div
            className={`group flex items-center gap-1 py-0.5 px-1 rounded hover:bg-accent cursor-pointer ${
              isSelected ? 'bg-accent' : ''
            }`}
            style={{ paddingLeft: `${6 + level * 12}px` }}
          >
            {hasChildren && (
              <Button
                variant="ghost"
                size="sm"
                className="h-4 w-4 p-0 hover:bg-transparent"
                onClick={(e) => {
                  e.stopPropagation();
                  toggleExpanded(page.id);
                }}
              >
                {isExpanded ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
              </Button>
            )}
            
            {!hasChildren && <div className="w-4" />}
            
            <div
              className="flex items-center gap-2 flex-1 min-w-0"
              onClick={() => {
                if (page.type === 'folder') {
                  toggleExpanded(page.id);
                } else {
                  onPageSelect(page);
                }
              }}
            >
              <span className="text-xs">{page.icon}</span>
              {isEditing ? (
                <Input
                  value={editTitle}
                  onChange={(e) => setEditTitle(e.target.value)}
                  onBlur={finishEditing}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') finishEditing();
                    if (e.key === 'Escape') {
                      setEditingPage(null);
                      setEditTitle('');
                    }
                  }}
                  className="h-5 text-xs py-0 px-1"
                  autoFocus
                  onClick={(e) => e.stopPropagation()}
                />
              ) : (
                <div className="flex-1 min-w-0">
                  <div className="text-xs truncate">
                    {page.title}
                  </div>
                </div>
              )}
            </div>

            <div className={`transition-opacity relative ${isMenuOpen ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'}`} ref={menuRef}>
              <Button
                variant="ghost"
                size="sm"
                className="h-6 w-6 p-1 hover:bg-accent flex items-center justify-center"
                onClick={(e) => handleMenuClick(page.id, e)}
              >
                <MoreHorizontal className="h-3 w-3" />
              </Button>

              {isMenuOpen && (
                <div
                  ref={menuRef}
                  className="absolute right-0 top-7 bg-popover border border-border rounded-md shadow-lg py-2.5 px-2.5 z-50 flex items-center gap-0.7"
                  onMouseDown={(e: React.MouseEvent) => {
                    e.stopPropagation();
                  }}
                >
                  {/* 수정 버튼 */}
                  <button
                    className="h-7 w-7 p-0 hover:bg-accent hover:text-accent-foreground transition-colors rounded-sm flex-shrink-0 flex items-center justify-center"
                    onMouseDown={(e: React.MouseEvent) => {
                      e.preventDefault();
                      e.stopPropagation();
                      startEditing(page);
                      setOpenMenu(null);
                    }}
                    title="수정"
                  >
                    <Edit2 className="h-5 w-5" strokeWidth={1.2} />
                  </button>

                  {/* 페이지 추가 버튼 */}
                  <button
                    className="h-7 w-7 p-0 hover:bg-accent hover:text-accent-foreground transition-colors rounded-sm flex-shrink-0 flex items-center justify-center"
                    onMouseDown={(e: React.MouseEvent) => {
                      e.preventDefault();
                      e.stopPropagation();
                      onPageCreate('하위 페이지', page.id);
                      setOpenMenu(null);
                    }}
                    title="하위 페이지 추가"
                  >
                    <Plus className="h-5 w-5" strokeWidth={1.2} />
                  </button>

                  {/* 폴더 추가 버튼 */}
                  <button
                    className="h-7 w-7 p-0 hover:bg-accent hover:text-accent-foreground transition-colors rounded-sm flex-shrink-0 flex items-center justify-center"
                    onMouseDown={(e: React.MouseEvent) => {
                      e.preventDefault();
                      e.stopPropagation();
                      onFolderCreate('하위 폴더', page.id);
                      setOpenMenu(null);
                    }}
                    title="하위 폴더 추가"
                  >
                    <FolderPlus className="h-5 w-5" strokeWidth={1.2} />
                  </button>

                  {/* 구분선 */}
                  <div className="h-5 w-px bg-border mx-0.5 flex-shrink-0" />

                  {/* 위로 이동 버튼 */}
                  <button
                    className={`h-7 w-7 p-0 transition-colors rounded-sm flex-shrink-0 flex items-center justify-center ${
                      canMoveUp
                        ? 'hover:bg-accent hover:text-accent-foreground'
                        : 'opacity-30 cursor-not-allowed'
                    }`}
                    onMouseDown={(e: React.MouseEvent) => {
                      e.preventDefault();
                      e.stopPropagation();
                      if (canMoveUp) {
                        onPageMove(page.id, 'up');
                        setOpenMenu(null);
                      }
                    }}
                    disabled={!canMoveUp}
                    title="위로 이동"
                  >
                    <ArrowUp className="h-5 w-5" strokeWidth={1.5} />
                  </button>

                  {/* 아래로 이동 버튼 */}
                  <button
                    className={`h-7 w-7 p-0 transition-colors rounded-sm flex-shrink-0 flex items-center justify-center ${
                      canMoveDown
                        ? 'hover:bg-accent hover:text-accent-foreground'
                        : 'opacity-30 cursor-not-allowed'
                    }`}
                    onMouseDown={(e: React.MouseEvent) => {
                      e.preventDefault();
                      e.stopPropagation();
                      if (canMoveDown) {
                        onPageMove(page.id, 'down');
                        setOpenMenu(null);
                      }
                    }}
                    disabled={!canMoveDown}
                    title="아래로 이동"
                  >
                    <ArrowDown className="h-5 w-5" strokeWidth={1.5} />
                  </button>

                  {/* 구분선 */}
                  <div className="h-5 w-px bg-border mx-0.5 flex-shrink-0" />

                  {/* 삭제 버튼 */}
                  <AlertDialog>
                    <AlertDialogTrigger asChild>
                      <button
                         className="h-7 w-7 p-0 hover:bg-accent hover:text-destructive transition-colors rounded-sm flex-shrink-0 flex items-center justify-center"
                        onMouseDown={(e: React.MouseEvent) => {
                          e.stopPropagation();
                        }}
                        title="삭제"
                      >
                        <Trash2 className="h-5 w-5" strokeWidth={1.2} />
                      </button>
                    </AlertDialogTrigger>
                    <AlertDialogContent>
                      <AlertDialogHeader>
                        <AlertDialogTitle>페이지 삭제</AlertDialogTitle>
                        <AlertDialogDescription>
                          '{page.title}' 페이지를 정말 삭제하시겠습니까?<br/>
                          이 작업은 되돌릴 수 없습니다.
                        </AlertDialogDescription>
                      </AlertDialogHeader>
                      <AlertDialogFooter>
                        <AlertDialogCancel onClick={() => {
                          setOpenMenu(null);
                        }}>취소</AlertDialogCancel>
                        <AlertDialogAction
                          onClick={() => {
                            onPageDelete(page.id);
                            setOpenMenu(null);
                          }}
                          className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                        >
                          삭제
                        </AlertDialogAction>
                      </AlertDialogFooter>
                    </AlertDialogContent>
                  </AlertDialog>
                </div>
              )}
            </div>
          </div>

          {hasChildren && isExpanded && renderPageTree(page.id, level + 1)}
        </div>
      );
    });
  };

  return (
    <div className="w-full border-r border-border bg-sidebar flex flex-col h-full">
      {/* 날짜별 메모 섹션 - 상단 flex-1 (나머지 공간) */}
      <div className="flex flex-col flex-1 min-h-0 border-b border-sidebar-border">
        {/* Header */}
        <div className="px-3 py-2 border-b border-sidebar-border h-[52px] flex items-center flex-shrink-0">
          <div className="flex items-center justify-between w-full gap-2">
            <h2 className="text-sm font-medium text-sidebar-foreground whitespace-nowrap" title={formatDate()}>
              📅 {formatDate()}
            </h2>
            <div className="flex items-center gap-1 flex-shrink-0">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => onFolderCreate('새 폴더')}
                className="h-7 w-7 p-0"
                title="폴더 만들기"
              >
                📁
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => onPageCreate('새 페이지')}
                className="h-7 w-7 p-0"
                title="페이지 만들기"
              >
                <Plus className="h-3 w-3" />
              </Button>
            </div>
          </div>
        </div>

        {/* Pages */}
        <div className="flex-1 overflow-y-auto p-2">
          {pages.length === 0 ? (
            <div className="text-center py-6">
              <div>
                <p className="text-xs text-muted-foreground mb-2">페이지가 없습니다</p>
                <div className="flex flex-col gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => onFolderCreate('첫 번째 폴더')}
                    className="text-xs h-6"
                  >
                    📁 폴더 만들기
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => onPageCreate('첫 번째 페이지')}
                    className="text-xs h-6"
                  >
                    <Plus className="h-3 w-3 mr-1" />
                    페이지 만들기
                  </Button>
                </div>
              </div>
            </div>
          ) : (
            renderPageTree()
          )}
        </div>
      </div>

      {/* 달력 섹션 - 하단 고정 높이 */}
      <div className="flex flex-col h-[280px] flex-shrink-0 p-3">
        <CalendarWidget
          onDateSelect={onDateSelect}
          selectedDate={selectedDate}
          datesWithPages={datesWithPages}
        />
      </div>
    </div>
  );
};