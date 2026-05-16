import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Page } from '../types';
import { Button } from './ui/button';
import { Input } from './ui/input';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger
} from './ui/alert-dialog';
import {
  ArrowDown,
  ArrowUp,
  CalendarDays,
  ChevronDown,
  ChevronRight,
  FilePlus2,
  FileText,
  FolderClosed,
  FolderInput,
  FolderOpen,
  FolderOutput,
  FolderPlus,
  FolderTree,
  MoreHorizontal,
  PencilLine,
  Plus,
  Trash2
} from 'lucide-react';
import { CalendarWidget } from './CalendarWidget';
import { toLocalISOString } from '../utils/dateUtils';
import { getProjectIndexPages, getProjectParentId } from '../utils/pageModel';

const EMOJI_PALETTE = ['📝', '📄', '📌', '✅', '💡', '📚', '📅', '💼', '🚀', '⭐', '🔥', '🎯', '🔎', '🧠', '🛠️', '📊', '🔐', '🏠', '📁', '🙂'];
const INDEX_ITEM_ROW_CLASS = 'group flex items-center gap-1 rounded px-1 py-2 hover:bg-accent';
const INDEX_ITEM_BUTTON_CLASS = 'flex min-w-0 flex-1 items-center gap-2 text-left';
const ACTION_MENU_CLASS = 'absolute right-0 top-7 z-50 flex items-center gap-1 rounded-lg border border-border bg-popover p-1.5 shadow-lg';
const ACTION_BUTTON_CLASS = 'inline-flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-md p-0 text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground [&>svg]:block [&>svg]:shrink-0';
const ACTION_BUTTON_DISABLED_CLASS = 'inline-flex h-7 w-7 flex-shrink-0 cursor-not-allowed items-center justify-center rounded-md p-0 text-muted-foreground opacity-30 [&>svg]:block [&>svg]:shrink-0';
const ACTION_DIVIDER_CLASS = 'hidden';
const ACTION_ICON_CLASS = 'size-[15px] stroke-[2.2]';
const INDEX_LIST_STYLE: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: '4px'
};
const INDEX_ITEM_STYLE: React.CSSProperties = {
  minHeight: '42px'
};

type ActionGlyphName = 'edit' | 'page-add' | 'folder-add' | 'folder-in' | 'folder-out' | 'up' | 'down' | 'delete';

const ActionGlyph: React.FC<{ name: ActionGlyphName }> = ({ name }) => {
  const icons = {
    edit: PencilLine,
    'page-add': FilePlus2,
    'folder-add': FolderPlus,
    'folder-in': FolderInput,
    'folder-out': FolderOutput,
    up: ArrowUp,
    down: ArrowDown,
    delete: Trash2,
  };
  const Icon = icons[name];
  return <Icon className={ACTION_ICON_CLASS} aria-hidden="true" />;
};

interface SidebarProps {
  pages: Page[];
  dailyPages: Page[];
  currentPage: Page | null;
  onPageSelect: (page: Page) => void;
  onDailyPageCreate: (title: string) => void;
  onProjectPageCreate: (title: string, parentId?: string) => void;
  onProjectFolderCreate: (title: string, parentId?: string) => void;
  onPageUpdate: (page: Page) => void;
  onPageDelete: (pageId: string) => void;
  onPageMove: (pageId: string, direction: 'up' | 'down') => void;
  onPageParentChange: (pageId: string, parentId: string | null) => void;
  onDateSelect: (date: Date) => void;
  selectedDate: Date;
  datesWithPages: string[];
  onClose: () => void;
  onInsertText?: (text: string) => void;
}

type SidebarIndex = 'daily' | 'project';

export const Sidebar: React.FC<SidebarProps> = ({
  pages,
  dailyPages,
  currentPage,
  onPageSelect,
  onDailyPageCreate,
  onProjectPageCreate,
  onProjectFolderCreate,
  onPageUpdate,
  onPageDelete,
  onPageMove,
  onPageParentChange,
  onDateSelect,
  selectedDate,
  datesWithPages
}) => {
  const [expandedPages, setExpandedPages] = useState<Set<string>>(new Set());
  const [editingPage, setEditingPage] = useState<string | null>(null);
  const [editTitle, setEditTitle] = useState('');
  const [openMenu, setOpenMenu] = useState<string | null>(null);
  const [emojiMenuPage, setEmojiMenuPage] = useState<string | null>(null);
  const [activeIndex, setActiveIndex] = useState<SidebarIndex>('daily');
  const [isWideLayout, setIsWideLayout] = useState(false);
  const [draggedPageId, setDraggedPageId] = useState<string | null>(null);
  const [dropTargetPageId, setDropTargetPageId] = useState<string | null>(null);
  const sidebarRef = useRef<HTMLDivElement>(null);

  const projectPages = useMemo(() => getProjectIndexPages(pages), [pages]);

  useEffect(() => {
    if (!sidebarRef.current) return;

    const resizeObserver = new ResizeObserver(([entry]) => {
      setIsWideLayout(entry.contentRect.width >= 520);
    });

    resizeObserver.observe(sidebarRef.current);
    return () => resizeObserver.disconnect();
  }, []);

  const toggleExpanded = (pageId: string) => {
    setExpandedPages(prev => {
      const next = new Set(prev);
      if (next.has(pageId)) {
        next.delete(pageId);
      } else {
        next.add(pageId);
      }
      return next;
    });
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

  const handleMenuClick = (pageId: string, event: React.MouseEvent) => {
    event.stopPropagation();
    setOpenMenu(openMenu === pageId ? null : pageId);
    setEmojiMenuPage(null);
  };

  const closeFloatingControls = (pageId: string) => {
    setOpenMenu(currentOpenMenu => (
      currentOpenMenu === pageId ? null : currentOpenMenu
    ));
    setEmojiMenuPage(currentEmojiMenuPage => (
      currentEmojiMenuPage === pageId ? null : currentEmojiMenuPage
    ));
  };

  const updatePageIcon = (page: Page, icon: string) => {
    onPageUpdate({
      ...page,
      icon,
      updatedAt: toLocalISOString(new Date())
    });
    setEmojiMenuPage(null);
  };

  const getProjectChildren = (parentId: string | null) => (
    projectPages.filter(page => getProjectParentId(page) === parentId)
  );

  const isDescendantOf = (candidateId: string, ancestorId: string): boolean => {
    const candidatePage = projectPages.find(page => page.id === candidateId);
    let cursor = candidatePage ? getProjectParentId(candidatePage) : null;
    while (cursor) {
      if (cursor === ancestorId) return true;
      const parentPage = projectPages.find(page => page.id === cursor);
      cursor = parentPage ? getProjectParentId(parentPage) : null;
    }
    return false;
  };

  const canDropOnFolder = (targetPage: Page) => {
    if (!draggedPageId || targetPage.type !== 'folder' || draggedPageId === targetPage.id) return false;
    return !isDescendantOf(targetPage.id, draggedPageId);
  };

  const moveIntoFolder = (pageId: string, folderId: string) => {
    onPageParentChange(pageId, folderId);
    setExpandedPages(prev => new Set(prev).add(folderId));
    setOpenMenu(null);
  };

  const renderIndexIcon = (page: Page, isExpandedFolder = false) => {
    const hasCustomIcon = !!page.icon && !['📄', '📁'].includes(page.icon);
    if (hasCustomIcon) {
      return <span className="text-xs leading-none">{page.icon}</span>;
    }

    if (page.type === 'folder') {
      const Icon = isExpandedFolder ? FolderOpen : FolderClosed;
      return <Icon className="h-3.5 w-3.5 text-muted-foreground" strokeWidth={1.8} />;
    }

    return <FileText className="h-3.5 w-3.5 text-muted-foreground" strokeWidth={1.8} />;
  };

  const renderEmojiButton = (page: Page) => (
    <span className="relative flex-shrink-0">
      <button
        type="button"
        className="h-5 w-5 rounded text-xs hover:bg-accent flex items-center justify-center"
        title="이모지 변경"
        onMouseDown={(event) => {
          event.preventDefault();
          event.stopPropagation();
          setEmojiMenuPage(emojiMenuPage === page.id ? null : page.id);
          setOpenMenu(null);
        }}
      >
        {renderIndexIcon(page, expandedPages.has(page.id))}
      </button>
      {emojiMenuPage === page.id && (
        <div
          className="absolute left-0 top-6 z-50 grid w-44 grid-cols-5 gap-1 rounded-md border bg-popover p-2 shadow-lg"
          onMouseDown={(event) => {
            event.preventDefault();
            event.stopPropagation();
          }}
        >
          {EMOJI_PALETTE.map((icon) => (
            <button
              key={icon}
              type="button"
              className="h-7 w-7 rounded text-sm hover:bg-accent"
              onMouseDown={(event) => {
                event.preventDefault();
                event.stopPropagation();
                updatePageIcon(page, icon);
              }}
            >
              {icon}
            </button>
          ))}
        </div>
      )}
    </span>
  );

  const renderDailyIndex = () => (
    <section className="flex h-full min-h-0 flex-col">
      <div className="border-b border-sidebar-border px-3 py-2">
        <div className="flex items-center justify-between gap-2">
          <h2 className="truncate text-sm font-medium text-sidebar-foreground" title={formatDate()}>
            {formatDate()}
          </h2>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => onDailyPageCreate('새 페이지')}
            className="h-7 w-7 p-0"
            title="날짜 기준 페이지 만들기"
            aria-label="날짜 기준 페이지 만들기"
          >
            <Plus className="h-3.5 w-3.5" />
          </Button>
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto p-2">
        {dailyPages.length === 0 ? (
          <div className="px-2 py-6 text-center">
            <p className="mb-3 text-xs text-muted-foreground">이 날짜의 페이지가 없습니다</p>
            <Button
              variant="outline"
              size="sm"
              onClick={() => onDailyPageCreate('새 페이지')}
              className="h-7 text-xs"
            >
              <Plus className="mr-1 h-3 w-3" />
              날짜 페이지
            </Button>
          </div>
        ) : (
          <div style={INDEX_LIST_STYLE}>
            {dailyPages.map(page => {
              const isSelected = currentPage?.id === page.id;
              const isEditing = editingPage === page.id;
              const isMenuOpen = openMenu === page.id;

              return (
                <div
                  key={page.id}
                  className={`${INDEX_ITEM_ROW_CLASS} ${isSelected ? 'bg-accent' : ''}`}
                  style={INDEX_ITEM_STYLE}
                  onMouseLeave={() => closeFloatingControls(page.id)}
                >
                  <div
                    className={`${INDEX_ITEM_BUTTON_CLASS} cursor-pointer`}
                    onClick={() => onPageSelect(page)}
                  >
                    <span className="flex h-5 w-5 flex-shrink-0 items-center justify-center text-xs">
                      {renderIndexIcon(page)}
                    </span>
                    {isEditing ? (
                      <Input
                        value={editTitle}
                        onChange={(event) => setEditTitle(event.target.value)}
                        onBlur={finishEditing}
                        onKeyDown={(event) => {
                          if (event.key === 'Enter') finishEditing();
                          if (event.key === 'Escape') {
                            setEditingPage(null);
                            setEditTitle('');
                          }
                        }}
                        className="h-5 px-1 py-0 text-xs"
                        autoFocus
                        onClick={(event) => event.stopPropagation()}
                      />
                    ) : (
                      <span className="min-w-0 flex-1 truncate text-xs text-sidebar-foreground">
                        {page.title}
                      </span>
                    )}
                  </div>

                  <div className={`relative flex-shrink-0 transition-opacity ${isMenuOpen ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'}`}>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="flex h-6 w-6 items-center justify-center p-1 hover:bg-accent"
                      onClick={(event: React.MouseEvent) => handleMenuClick(page.id, event)}
                      title="페이지 메뉴"
                      aria-label="페이지 메뉴"
                    >
                      <MoreHorizontal className="h-3 w-3" />
                    </Button>

                    {isMenuOpen && (
                      <div
                        className={ACTION_MENU_CLASS}
                        onMouseDown={(event) => {
                          event.stopPropagation();
                        }}
                      >
                        <button
                          className={ACTION_BUTTON_CLASS}
                          onMouseDown={(event) => {
                            event.preventDefault();
                            event.stopPropagation();
                            startEditing(page);
                          }}
                          title="수정"
                          aria-label="수정"
                        >
                          <ActionGlyph name="edit" />
                        </button>

                        <AlertDialog>
                          <AlertDialogTrigger asChild>
                            <button
                              className={`${ACTION_BUTTON_CLASS} hover:text-destructive`}
                              onMouseDown={(event) => {
                                event.stopPropagation();
                              }}
                              title="삭제"
                              aria-label="삭제"
                            >
                              <ActionGlyph name="delete" />
                            </button>
                          </AlertDialogTrigger>
                          <AlertDialogContent>
                            <AlertDialogHeader>
                              <AlertDialogTitle>페이지 삭제</AlertDialogTitle>
                              <AlertDialogDescription>
                                '{page.title}' 페이지를 정말 삭제하시겠습니까?<br />
                                이 작업은 되돌릴 수 없습니다.
                              </AlertDialogDescription>
                            </AlertDialogHeader>
                            <AlertDialogFooter>
                              <AlertDialogCancel onClick={() => setOpenMenu(null)}>취소</AlertDialogCancel>
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
              );
            })}
          </div>
        )}
      </div>

      <div className="flex-shrink-0 border-t border-sidebar-border p-3">
        <CalendarWidget
          onDateSelect={onDateSelect}
          selectedDate={selectedDate}
          datesWithPages={datesWithPages}
        />
      </div>
    </section>
  );

  const renderProjectTree = (parentId: string | null = null, level: number = 0): React.ReactNode => {
    const children = getProjectChildren(parentId);

    return children.map((page, index) => {
      const childPages = getProjectChildren(page.id);
      const hasChildren = childPages.length > 0;
      const isExpanded = expandedPages.has(page.id);
      const isSelected = currentPage?.id === page.id;
      const isEditing = editingPage === page.id;
      const isMenuOpen = openMenu === page.id;
      const canMoveUp = index > 0;
      const canMoveDown = index < children.length - 1;
      const previousSiblingFolder = [...children]
        .slice(0, index)
        .reverse()
        .find(sibling => sibling.type === 'folder') || null;
      const parentIdForPage = getProjectParentId(page);
      const parentPage = parentIdForPage ? pages.find(candidate => candidate.id === parentIdForPage) : null;
      const canMoveIntoPreviousFolder = !!previousSiblingFolder && previousSiblingFolder.id !== page.id;
      const canMoveOut = !!parentIdForPage;

      return (
        <div key={page.id} className="relative">
          <div
            className={`${INDEX_ITEM_ROW_CLASS} ${
              isSelected ? 'bg-accent' : ''
            } ${dropTargetPageId === page.id ? 'ring-1 ring-primary/60' : ''}`}
            style={{ ...INDEX_ITEM_STYLE, paddingLeft: `${6 + level * 12}px` }}
            onMouseLeave={() => closeFloatingControls(page.id)}
            draggable
            onDragStart={(event) => {
              event.dataTransfer.effectAllowed = 'move';
              event.dataTransfer.setData('text/plain', page.id);
              setDraggedPageId(page.id);
              setOpenMenu(null);
            }}
            onDragEnd={() => {
              setDraggedPageId(null);
              setDropTargetPageId(null);
            }}
            onDragOver={(event) => {
              if (!canDropOnFolder(page)) return;
              event.preventDefault();
              event.dataTransfer.dropEffect = 'move';
              setDropTargetPageId(page.id);
            }}
            onDragLeave={() => {
              if (dropTargetPageId === page.id) setDropTargetPageId(null);
            }}
            onDrop={(event) => {
              const droppedPageId = event.dataTransfer.getData('text/plain') || draggedPageId;
              if (!droppedPageId || !canDropOnFolder(page)) return;
              event.preventDefault();
              moveIntoFolder(droppedPageId, page.id);
              setDraggedPageId(null);
              setDropTargetPageId(null);
            }}
          >
            {hasChildren ? (
              <Button
                variant="ghost"
                size="sm"
                className="h-4 w-4 p-0 hover:bg-transparent"
                onClick={(event: React.MouseEvent) => {
                  event.stopPropagation();
                  toggleExpanded(page.id);
                }}
                title={isExpanded ? '접기' : '펼치기'}
                aria-label={isExpanded ? '접기' : '펼치기'}
              >
                {isExpanded ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
              </Button>
            ) : (
              <div className="w-4 flex-shrink-0" />
            )}

            <div
              className="flex min-w-0 flex-1 cursor-pointer items-center gap-2"
              onClick={() => {
                if (page.type === 'folder') {
                  toggleExpanded(page.id);
                } else {
                  onPageSelect(page);
                }
              }}
            >
              {renderEmojiButton(page)}

              {isEditing ? (
                <Input
                  value={editTitle}
                  onChange={(event) => setEditTitle(event.target.value)}
                  onBlur={finishEditing}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter') finishEditing();
                    if (event.key === 'Escape') {
                      setEditingPage(null);
                      setEditTitle('');
                    }
                  }}
                  className="h-5 px-1 py-0 text-xs"
                  autoFocus
                  onClick={(event) => event.stopPropagation()}
                />
              ) : (
                <div className="min-w-0 flex-1">
                  <div className="truncate text-xs text-sidebar-foreground">
                    {page.title}
                  </div>
                </div>
              )}
            </div>

            <div className={`relative transition-opacity ${isMenuOpen ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'}`}>
              <Button
                variant="ghost"
                size="sm"
                className="flex h-6 w-6 items-center justify-center p-1 hover:bg-accent"
                onClick={(event: React.MouseEvent) => handleMenuClick(page.id, event)}
                title="페이지 메뉴"
                aria-label="페이지 메뉴"
              >
                <MoreHorizontal className="h-3 w-3" />
              </Button>

              {isMenuOpen && (
                <div
                  className={ACTION_MENU_CLASS}
                  onMouseDown={(event) => {
                    event.stopPropagation();
                  }}
                >
                  <button
                    className={ACTION_BUTTON_CLASS}
                    onMouseDown={(event) => {
                      event.preventDefault();
                      event.stopPropagation();
                      startEditing(page);
                    }}
                    title="수정"
                    aria-label="수정"
                  >
                    <ActionGlyph name="edit" />
                  </button>

                  <button
                    className={ACTION_BUTTON_CLASS}
                    onMouseDown={(event) => {
                      event.preventDefault();
                      event.stopPropagation();
                      onProjectPageCreate('하위 페이지', page.id);
                      setExpandedPages(prev => new Set(prev).add(page.id));
                      setOpenMenu(null);
                    }}
                    title="하위 페이지 추가"
                    aria-label="하위 페이지 추가"
                  >
                    <ActionGlyph name="page-add" />
                  </button>

                  <button
                    className={ACTION_BUTTON_CLASS}
                    onMouseDown={(event) => {
                      event.preventDefault();
                      event.stopPropagation();
                      onProjectFolderCreate('하위 폴더', page.id);
                      setExpandedPages(prev => new Set(prev).add(page.id));
                      setOpenMenu(null);
                    }}
                    title="하위 폴더 추가"
                    aria-label="하위 폴더 추가"
                  >
                    <ActionGlyph name="folder-add" />
                  </button>

                  <div className={ACTION_DIVIDER_CLASS} />

                  <button
                    className={canMoveIntoPreviousFolder ? ACTION_BUTTON_CLASS : ACTION_BUTTON_DISABLED_CLASS}
                    onMouseDown={(event) => {
                      event.preventDefault();
                      event.stopPropagation();
                      if (previousSiblingFolder) {
                        moveIntoFolder(page.id, previousSiblingFolder.id);
                      }
                    }}
                    disabled={!canMoveIntoPreviousFolder}
                    title={previousSiblingFolder ? `'${previousSiblingFolder.title}' 안으로 이동` : '앞쪽 폴더 안으로 이동'}
                    aria-label="앞쪽 폴더 안으로 이동"
                  >
                    <ActionGlyph name="folder-in" />
                  </button>

                  <button
                    className={canMoveOut ? ACTION_BUTTON_CLASS : ACTION_BUTTON_DISABLED_CLASS}
                    onMouseDown={(event) => {
                      event.preventDefault();
                      event.stopPropagation();
                      if (canMoveOut) {
                        onPageParentChange(page.id, parentPage ? getProjectParentId(parentPage) : null);
                        setOpenMenu(null);
                      }
                    }}
                    disabled={!canMoveOut}
                    title="상위 폴더로 빼기"
                    aria-label="상위 폴더로 빼기"
                  >
                    <ActionGlyph name="folder-out" />
                  </button>

                  <div className={ACTION_DIVIDER_CLASS} />

                  <button
                    className={canMoveUp ? ACTION_BUTTON_CLASS : ACTION_BUTTON_DISABLED_CLASS}
                    onMouseDown={(event) => {
                      event.preventDefault();
                      event.stopPropagation();
                      if (canMoveUp) {
                        onPageMove(page.id, 'up');
                        setOpenMenu(null);
                      }
                    }}
                    disabled={!canMoveUp}
                    title="위로 이동"
                    aria-label="위로 이동"
                  >
                    <ActionGlyph name="up" />
                  </button>

                  <button
                    className={canMoveDown ? ACTION_BUTTON_CLASS : ACTION_BUTTON_DISABLED_CLASS}
                    onMouseDown={(event) => {
                      event.preventDefault();
                      event.stopPropagation();
                      if (canMoveDown) {
                        onPageMove(page.id, 'down');
                        setOpenMenu(null);
                      }
                    }}
                    disabled={!canMoveDown}
                    title="아래로 이동"
                    aria-label="아래로 이동"
                  >
                    <ActionGlyph name="down" />
                  </button>

                  <div className={ACTION_DIVIDER_CLASS} />

                  <AlertDialog>
                    <AlertDialogTrigger asChild>
                      <button
                        className={`${ACTION_BUTTON_CLASS} hover:text-destructive`}
                        onMouseDown={(event) => {
                          event.stopPropagation();
                        }}
                        title="삭제"
                        aria-label="삭제"
                      >
                        <ActionGlyph name="delete" />
                      </button>
                    </AlertDialogTrigger>
                    <AlertDialogContent>
                      <AlertDialogHeader>
                        <AlertDialogTitle>페이지 삭제</AlertDialogTitle>
                        <AlertDialogDescription>
                          '{page.title}' 페이지를 정말 삭제하시겠습니까?<br />
                          하위 페이지도 함께 삭제되며, 이 작업은 되돌릴 수 없습니다.
                        </AlertDialogDescription>
                      </AlertDialogHeader>
                      <AlertDialogFooter>
                        <AlertDialogCancel onClick={() => setOpenMenu(null)}>취소</AlertDialogCancel>
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

          {hasChildren && isExpanded && (
            <div className="mt-1" style={INDEX_LIST_STYLE}>
              {renderProjectTree(page.id, level + 1)}
            </div>
          )}
        </div>
      );
    });
  };

  const renderProjectIndex = () => (
    <section className="flex h-full min-h-0 flex-col">
      <div className="border-b border-sidebar-border px-3 py-2">
        <div className="flex items-center justify-between gap-2">
          <h2 className="truncate text-sm font-medium text-sidebar-foreground">
            프로젝트/사건
          </h2>
          <div className="flex flex-shrink-0 items-center gap-1">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => onProjectFolderCreate('새 폴더')}
              className="h-7 w-7 p-0"
              title="폴더 만들기"
              aria-label="폴더 만들기"
            >
              <FolderPlus className="h-3.5 w-3.5" />
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => onProjectPageCreate('새 프로젝트 페이지')}
              className="h-7 w-7 p-0"
              title="프로젝트 페이지 만들기"
              aria-label="프로젝트 페이지 만들기"
            >
              <Plus className="h-3.5 w-3.5" />
            </Button>
          </div>
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto p-2">
        {projectPages.length === 0 ? (
          <div className="px-2 py-6 text-center">
            <p className="mb-3 text-xs text-muted-foreground">프로젝트 페이지가 없습니다</p>
            <div className="flex flex-col gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => onProjectFolderCreate('첫 번째 폴더')}
                className="h-7 text-xs"
              >
                <FolderPlus className="mr-1 h-3 w-3" />
                폴더
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => onProjectPageCreate('첫 번째 프로젝트 페이지')}
                className="h-7 text-xs"
              >
                <Plus className="mr-1 h-3 w-3" />
                프로젝트 페이지
              </Button>
            </div>
          </div>
        ) : (
          <div style={INDEX_LIST_STYLE}>
            {renderProjectTree()}
          </div>
        )}
      </div>
    </section>
  );

  return (
    <div ref={sidebarRef} className="h-full w-full border-r border-border bg-sidebar">
      {isWideLayout ? (
        <div
          className="grid h-full min-h-0"
          style={{ gridTemplateColumns: 'minmax(0, 1fr) minmax(0, 1fr)' }}
        >
          <div className="min-w-0 border-r border-sidebar-border">
            {renderDailyIndex()}
          </div>
          <div className="min-w-0">
            {renderProjectIndex()}
          </div>
        </div>
      ) : (
        <div className="flex h-full min-h-0 flex-col">
          <div className="flex gap-1 border-b border-sidebar-border p-2">
            <button
              type="button"
              className={`flex h-8 min-w-0 flex-1 items-center justify-center gap-1 rounded-md text-xs transition-colors ${
                activeIndex === 'daily' ? 'bg-accent text-accent-foreground' : 'text-muted-foreground hover:bg-accent/60'
              }`}
              onClick={() => setActiveIndex('daily')}
            >
              <CalendarDays className="h-3.5 w-3.5" />
              데일리
            </button>
            <button
              type="button"
              className={`flex h-8 min-w-0 flex-1 items-center justify-center gap-1 rounded-md text-xs transition-colors ${
                activeIndex === 'project' ? 'bg-accent text-accent-foreground' : 'text-muted-foreground hover:bg-accent/60'
              }`}
              onClick={() => setActiveIndex('project')}
            >
              <FolderTree className="h-3.5 w-3.5" />
              프로젝트
            </button>
          </div>
          <div className="min-h-0 flex-1">
            {activeIndex === 'daily' ? renderDailyIndex() : renderProjectIndex()}
          </div>
        </div>
      )}
    </div>
  );
};
