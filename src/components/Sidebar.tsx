import React, { useEffect, useMemo, useState } from 'react';
import { Page, PageNavigationIndex, PageSelectionSource } from '../types';
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
  AlertDialogTitle
} from './ui/alert-dialog';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from './ui/dropdown-menu';
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
const ACTION_ICON_CLASS = 'size-[15px] stroke-[2.2]';
const ACTION_MENU_CONTENT_CLASS = 'w-48 text-xs';
const ACTION_MENU_ITEM_CLASS = 'text-xs';
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

export interface SidebarProps {
  pages: Page[];
  dailyPages: Page[];
  currentPage: Page | null;
  currentPageIndex: PageNavigationIndex;
  onPageSelect: (page: Page, source?: PageSelectionSource) => void;
  onDailyIndexOpen: () => void;
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
  forcedIndex?: PageNavigationIndex;
  hideIndexSwitcher?: boolean;
}

export const Sidebar: React.FC<SidebarProps> = ({
  pages,
  dailyPages,
  currentPage,
  currentPageIndex,
  onPageSelect,
  onDailyIndexOpen,
  onDailyPageCreate,
  onProjectPageCreate,
  onProjectFolderCreate,
  onPageUpdate,
  onPageDelete,
  onPageMove,
  onPageParentChange,
  onDateSelect,
  selectedDate,
  datesWithPages,
  forcedIndex,
  hideIndexSwitcher = false,
}) => {
  const [expandedPages, setExpandedPages] = useState<Set<string>>(new Set());
  const [editingPage, setEditingPage] = useState<string | null>(null);
  const [editTitle, setEditTitle] = useState('');
  const [openMenu, setOpenMenu] = useState<string | null>(null);
  const [pendingDeletePage, setPendingDeletePage] = useState<Page | null>(null);
  const [emojiMenuPage, setEmojiMenuPage] = useState<string | null>(null);
  const [activeIndex, setActiveIndex] = useState<PageNavigationIndex>(forcedIndex ?? 'daily');
  const [draggedPageId, setDraggedPageId] = useState<string | null>(null);
  const [dropTargetPageId, setDropTargetPageId] = useState<string | null>(null);

  const projectPages = useMemo(() => getProjectIndexPages(pages), [pages]);
  const projectPageById = useMemo(
    () => new Map(projectPages.map((page) => [page.id, page])),
    [projectPages]
  );
  const projectChildrenByParent = useMemo(() => {
    const children = new Map<string | null, Page[]>();
    for (const page of projectPages) {
      const parentId = getProjectParentId(page);
      const siblings = children.get(parentId) ?? [];
      siblings.push(page);
      children.set(parentId, siblings);
    }
    return children;
  }, [projectPages]);

  useEffect(() => {
    if (forcedIndex) {
      setActiveIndex(forcedIndex);
      return;
    }
    if (currentPage) setActiveIndex(currentPageIndex);
  }, [currentPage, currentPageIndex, forcedIndex]);

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

  const startEditingAfterMenuClose = (page: Page) => {
    setOpenMenu(null);
    window.setTimeout(() => startEditing(page), 0);
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

  const handleItemContextMenu = (pageId: string, event: React.MouseEvent) => {
    event.preventDefault();
    event.stopPropagation();
    setOpenMenu(pageId);
    setEmojiMenuPage(null);
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
    projectChildrenByParent.get(parentId) ?? []
  );

  const isDescendantOf = (candidateId: string, ancestorId: string): boolean => {
    const candidatePage = projectPageById.get(candidateId);
    let cursor = candidatePage ? getProjectParentId(candidatePage) : null;
    const visited = new Set<string>();
    while (cursor && visited.add(cursor)) {
      if (cursor === ancestorId) return true;
      const parentPage = projectPageById.get(cursor);
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
                  onContextMenu={(event) => handleItemContextMenu(page.id, event)}
                >
                  <div
                    className={`${INDEX_ITEM_BUTTON_CLASS} cursor-pointer`}
                    onClick={() => onPageSelect(page, 'daily')}
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
                        aria-label="페이지 제목"
                        onClick={(event) => event.stopPropagation()}
                      />
                    ) : (
                      <span className="min-w-0 flex-1 truncate text-xs text-sidebar-foreground">
                        {page.title}
                      </span>
                    )}
                  </div>

                  <DropdownMenu
                    open={isMenuOpen}
                    onOpenChange={(open) => setOpenMenu(open ? page.id : null)}
                  >
                    <DropdownMenuTrigger asChild>
                      <Button
                        variant="ghost"
                        size="sm"
                        className={`flex h-6 w-6 flex-shrink-0 items-center justify-center p-1 transition-opacity hover:bg-accent ${
                          isMenuOpen ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'
                        }`}
                        onClick={(event: React.MouseEvent) => event.stopPropagation()}
                        title="페이지 메뉴"
                        aria-label="페이지 메뉴"
                      >
                        <MoreHorizontal className="h-3 w-3" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent
                      align="end"
                      sideOffset={4}
                      collisionPadding={8}
                      className={ACTION_MENU_CONTENT_CLASS}
                      onCloseAutoFocus={(event) => event.preventDefault()}
                    >
                      <DropdownMenuItem
                        className={ACTION_MENU_ITEM_CLASS}
                        onSelect={() => startEditingAfterMenuClose(page)}
                      >
                        <ActionGlyph name="edit" />
                        이름 수정
                      </DropdownMenuItem>
                      <DropdownMenuSeparator />
                      <DropdownMenuItem
                        className={ACTION_MENU_ITEM_CLASS}
                        variant="destructive"
                        onSelect={() => {
                          setOpenMenu(null);
                          setPendingDeletePage(page);
                        }}
                      >
                        <ActionGlyph name="delete" />
                        삭제
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
              );
            })}
          </div>
        )}
      </div>

      <div
        role="region"
        aria-label="미니 캘린더"
        className="flex-shrink-0 border-t border-sidebar-border p-3"
      >
        <CalendarWidget
          onDateSelect={onDateSelect}
          selectedDate={selectedDate}
          datesWithPages={datesWithPages}
        />
      </div>
    </section>
  );

  const renderProjectTree = (
    parentId: string | null = null,
    level: number = 0,
    ancestorIds: ReadonlySet<string> = new Set()
  ): React.ReactNode => {
    if (level > 64) return null;
    const children = getProjectChildren(parentId).filter((page) => !ancestorIds.has(page.id));

    return children.map((page, index) => {
      const childPages = getProjectChildren(page.id);
      const hasChildren = childPages.length > 0;
      const isExpanded = expandedPages.has(page.id);
      const isSelected = currentPage?.id === page.id;
      const isEditing = editingPage === page.id;
      const isMenuOpen = openMenu === page.id;
      const canMoveUp = index > 0;
      const canMoveDown = index < children.length - 1;
      const nextAncestorIds = new Set(ancestorIds).add(page.id);
      const previousSiblingFolder = [...children]
        .slice(0, index)
        .reverse()
        .find(sibling => sibling.type === 'folder') || null;
      const parentIdForPage = getProjectParentId(page);
      const parentPage = parentIdForPage ? projectPageById.get(parentIdForPage) : null;
      const canMoveIntoPreviousFolder = !!previousSiblingFolder && previousSiblingFolder.id !== page.id;
      const canMoveOut = !!parentIdForPage;

      return (
        <div key={page.id} className="relative">
          <div
            className={`${INDEX_ITEM_ROW_CLASS} ${
              isSelected ? 'bg-accent' : ''
            } ${dropTargetPageId === page.id ? 'ring-1 ring-primary/60' : ''}`}
            style={{ ...INDEX_ITEM_STYLE, paddingLeft: `${6 + level * 12}px` }}
            onContextMenu={(event) => handleItemContextMenu(page.id, event)}
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
                  onPageSelect(page, 'project');
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
                  aria-label={page.type === 'folder' ? '폴더 제목' : '페이지 제목'}
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

            <DropdownMenu
              open={isMenuOpen}
              onOpenChange={(open) => setOpenMenu(open ? page.id : null)}
            >
              <DropdownMenuTrigger asChild>
                <Button
                  variant="ghost"
                  size="sm"
                  className={`flex h-6 w-6 flex-shrink-0 items-center justify-center p-1 transition-opacity hover:bg-accent ${
                    isMenuOpen ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'
                  }`}
                  onClick={(event: React.MouseEvent) => event.stopPropagation()}
                  title="페이지 메뉴"
                  aria-label="페이지 메뉴"
                >
                  <MoreHorizontal className="h-3 w-3" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent
                align="end"
                sideOffset={4}
                collisionPadding={8}
                className={ACTION_MENU_CONTENT_CLASS}
                onCloseAutoFocus={(event) => event.preventDefault()}
              >
                <DropdownMenuGroup>
                  <DropdownMenuItem
                    className={ACTION_MENU_ITEM_CLASS}
                    onSelect={() => startEditingAfterMenuClose(page)}
                  >
                    <ActionGlyph name="edit" />
                    이름 수정
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    className={ACTION_MENU_ITEM_CLASS}
                    onSelect={() => {
                      onProjectPageCreate('하위 페이지', page.id);
                      setExpandedPages(prev => new Set(prev).add(page.id));
                      setOpenMenu(null);
                    }}
                  >
                    <ActionGlyph name="page-add" />
                    하위 페이지 추가
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    className={ACTION_MENU_ITEM_CLASS}
                    onSelect={() => {
                      onProjectFolderCreate('하위 폴더', page.id);
                      setExpandedPages(prev => new Set(prev).add(page.id));
                      setOpenMenu(null);
                    }}
                  >
                    <ActionGlyph name="folder-add" />
                    하위 폴더 추가
                  </DropdownMenuItem>
                </DropdownMenuGroup>

                <DropdownMenuSeparator />

                <DropdownMenuGroup>
                  <DropdownMenuItem
                    className={ACTION_MENU_ITEM_CLASS}
                    disabled={!canMoveIntoPreviousFolder}
                    onSelect={() => {
                      if (previousSiblingFolder) moveIntoFolder(page.id, previousSiblingFolder.id);
                    }}
                  >
                    <ActionGlyph name="folder-in" />
                    {previousSiblingFolder ? `'${previousSiblingFolder.title}' 안으로` : '앞쪽 폴더 안으로'}
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    className={ACTION_MENU_ITEM_CLASS}
                    disabled={!canMoveOut}
                    onSelect={() => {
                      if (canMoveOut) {
                        onPageParentChange(page.id, parentPage ? getProjectParentId(parentPage) : null);
                        setOpenMenu(null);
                      }
                    }}
                  >
                    <ActionGlyph name="folder-out" />
                    상위 폴더로 빼기
                  </DropdownMenuItem>
                </DropdownMenuGroup>

                <DropdownMenuSeparator />

                <DropdownMenuGroup>
                  <DropdownMenuItem
                    className={ACTION_MENU_ITEM_CLASS}
                    disabled={!canMoveUp}
                    onSelect={() => {
                      if (canMoveUp) {
                        onPageMove(page.id, 'up');
                        setOpenMenu(null);
                      }
                    }}
                  >
                    <ActionGlyph name="up" />
                    위로 이동
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    className={ACTION_MENU_ITEM_CLASS}
                    disabled={!canMoveDown}
                    onSelect={() => {
                      if (canMoveDown) {
                        onPageMove(page.id, 'down');
                        setOpenMenu(null);
                      }
                    }}
                  >
                    <ActionGlyph name="down" />
                    아래로 이동
                  </DropdownMenuItem>
                </DropdownMenuGroup>

                <DropdownMenuSeparator />

                <DropdownMenuItem
                  className={ACTION_MENU_ITEM_CLASS}
                  variant="destructive"
                  onSelect={() => {
                    setOpenMenu(null);
                    setPendingDeletePage(page);
                  }}
                >
                  <ActionGlyph name="delete" />
                  삭제
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>

          {hasChildren && isExpanded && (
            <div className="mt-1" style={INDEX_LIST_STYLE}>
              {renderProjectTree(page.id, level + 1, nextAncestorIds)}
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
    <div className="h-full w-full bg-sidebar">
      <div className="flex h-full min-h-0 flex-col">
        {!hideIndexSwitcher ? (
          <div className="flex gap-1 border-b border-sidebar-border p-2">
            <button
              type="button"
              className={`flex h-8 min-w-0 flex-1 items-center justify-center gap-1 rounded-md text-xs transition-colors ${
                activeIndex === 'daily' ? 'bg-accent text-accent-foreground' : 'text-muted-foreground hover:bg-accent/60'
              }`}
              onClick={() => {
                setActiveIndex('daily');
                onDailyIndexOpen();
              }}
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
        ) : null}
        <div className="min-h-0 flex-1">
          {activeIndex === 'daily' ? renderDailyIndex() : renderProjectIndex()}
        </div>
      </div>
      <AlertDialog
        open={pendingDeletePage !== null}
        onOpenChange={(open) => {
          if (!open) setPendingDeletePage(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {pendingDeletePage?.type === 'folder' ? '폴더 삭제' : '페이지 삭제'}
            </AlertDialogTitle>
            <AlertDialogDescription>
              '{pendingDeletePage?.title ?? ''}'을(를) 정말 삭제하시겠습니까?<br />
              {pendingDeletePage && projectPageById.has(pendingDeletePage.id)
                ? '하위 페이지도 함께 삭제되며, 이 작업은 되돌릴 수 없습니다.'
                : '이 작업은 되돌릴 수 없습니다.'}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>취소</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (pendingDeletePage) onPageDelete(pendingDeletePage.id);
                setPendingDeletePage(null);
              }}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              삭제
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};
