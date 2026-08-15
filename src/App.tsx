import React, { useCallback, useState, useEffect, useRef } from 'react';
import { MarkdownEditor, MarkdownEditorHandle } from './components/MarkdownEditor';
import { KeyboardShortcutsModal } from './components/KeyboardShortcutsModal';
import { SettingsModal } from './components/SettingsModal';
import { RightPanel } from './components/RightPanel';
import { useFocusMode } from './contexts/FocusModeContext';
import { Page, PageNavigationIndex, PageSelectionSource } from './types';
import { tauriStorage } from './utils/tauriStorage';
import { getEnvironment, logEnvironmentInfo } from './utils/environment';
import { formatDateKey, parseDateKey, toLocalISOString } from './utils/dateUtils';
import { pageWithMarkdownMetadata } from './utils/markdownMetadata';
import { getPageDateKey, getPagesForDate, getProjectParentId, isProjectIndexPage, normalizePage } from './utils/pageModel';
import { resolvePageSelectionState } from './utils/navigationState';
import { Toaster } from './components/ui/sonner';
import { toast } from 'sonner';
import { useWorkspaceController } from './app/useWorkspaceController';
import { AppShell } from './app/AppShell';
import { WorkspaceLayout } from './workspace/WorkspaceLayout';
import { TopCommandBar } from './workspace/TopCommandBar';
import { useTheme } from './contexts/ThemeContext';
import { createCommandRegistry } from './commands/commandRegistry';
import type { CommandContext } from './commands/types';
import { bindCommandKeyboard } from './app/keyboardBindings';
import { CommandPalette } from './commands/CommandPalette';
import { WorkspaceSidebar } from './workspace/WorkspaceSidebar';
import { WorkspaceCanvas } from './workspace/WorkspaceCanvas';

interface CreatePageOptions {
  title: string;
  type?: 'page' | 'folder';
  dateKey?: string | null;
  projectParentId?: string | null;
  switchToNew?: boolean;
}

const readKeyboardShortcuts = (): any[] => {
  const savedShortcuts = localStorage.getItem('keyboardShortcuts');
  if (!savedShortcuts) return [];

  try {
    const shortcuts = JSON.parse(savedShortcuts);
    return Array.isArray(shortcuts) ? shortcuts : [];
  } catch (error) {
    console.error('Failed to parse keyboard shortcuts:', error);
    return [];
  }
};

const APP_COMMANDS = createCommandRegistry();

// 내부 App 컴포넌트 (FocusMode 컨텍스트 사용)
function AppContent() {
  const [pages, setPages] = useState<Page[]>([]);
  const [currentPage, setCurrentPage] = useState<Page | null>(null);
  const [currentPageIndex, setCurrentPageIndex] = useState<PageNavigationIndex>('daily');
  const [selectedDate, setSelectedDate] = useState<Date>(new Date());
  const [isShortcutsOpen, setIsShortcutsOpen] = useState(false);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [appTitle, setAppTitle] = useState<string>('Memoji');
  const [startupError, setStartupError] = useState<string | null>(null);
  const { isFocusMode, toggleFocusMode } = useFocusMode();
  const { setTheme, actualTheme } = useTheme();
  const {
    state: workspaceUi,
    togglePanel,
    setPanelOpen,
    setPanelWidth,
    setLeftView,
    setWorkspaceView,
    setContextTab,
    setCommandPaletteOpen,
  } = useWorkspaceController();
  const pagesRef = useRef<Page[]>([]);
  const editorRef = useRef<MarkdownEditorHandle>(null);
  const commandContextRef = useRef<CommandContext | null>(null);

  useEffect(() => bindCommandKeyboard(APP_COMMANDS, () => {
    if (!commandContextRef.current) {
      throw new Error('Command context is not ready');
    }
    return commandContextRef.current;
  }), []);

  useEffect(() => {
    if (!getEnvironment().isTauri) return;

    let disposed = false;
    let closing = false;
    let unlisten: (() => void) | undefined;

    void import('@tauri-apps/api/window').then(async ({ getCurrentWindow }) => {
      const appWindow = getCurrentWindow();
      unlisten = await appWindow.onCloseRequested(async (event) => {
        event.preventDefault();
        if (closing) return;
        closing = true;
        try {
          await editorRef.current?.flushUnsaved();
        } catch (error) {
          closing = false;
          toast.error('마지막 편집 내용을 저장하지 못해 앱을 닫지 않았습니다: ' + String(error));
          return;
        }

        if (disposed) return;

        // destroy()가 다시 close-requested를 발생시키는 플랫폼에서는 이미 저장한
        // 내용을 두 번째 handler가 가로채지 않도록 listener를 먼저 해제한다.
        unlisten?.();
        unlisten = undefined;
        try {
          await appWindow.destroy();
        } catch (error) {
          closing = false;
          console.error('Failed to close window after saving:', error);
          toast.error('저장은 완료됐지만 창을 닫지 못했습니다. 다시 시도해주세요.');
        }
      });
    }).catch((error) => {
      console.error('Failed to register close safeguard:', error);
    });

    return () => {
      disposed = true;
      unlisten?.();
    };
  }, []);

  useEffect(() => {
    pagesRef.current = pages;
  }, [pages]);

  // 단축키 설정 마이그레이션 (이전 원문 전환 단축키 id 유지)
  useEffect(() => {
    const shortcuts = readKeyboardShortcuts();
    if (shortcuts.length > 0) {
      const legacySourceModeShortcutId = ['pre', 'view'].join('');
      const hasLegacySourceModeShortcut = shortcuts.some((s: any) => s.id === legacySourceModeShortcutId);

      if (hasLegacySourceModeShortcut) {
        const updatedShortcuts = shortcuts.map((s: any) => (
          s.id === legacySourceModeShortcutId
            ? {
              ...s,
              id: 'sourceMode',
              name: '원문 모드',
              description: '즉시 편집/Markdown 원문 전환',
              defaultKey: 'Ctrl+E',
              currentKey: s.currentKey === 'Ctrl+P' ? 'Ctrl+E' : (s.currentKey || 'Ctrl+E')
            }
            : s
        ));
        localStorage.setItem('keyboardShortcuts', JSON.stringify(updatedShortcuts));
      }
    }
  }, []);

  const selectedDateKey = formatDateKey(selectedDate);

  const reloadPagesFromStorage = useCallback(async () => {
    const loadedPages = await tauriStorage.getPages();
    const savedPages = loadedPages.map(normalizePage);
    pagesRef.current = savedPages;
    setPages(savedPages);
    setCurrentPage(previousPage => {
      if (previousPage) {
        const reloadedPage = savedPages.find(page => page.id === previousPage.id);
        if (reloadedPage) return reloadedPage;
      }

      return getPagesForDate(savedPages, selectedDateKey)[0]
        || savedPages.find(page => page.type === 'page')
        || null;
    });
  }, [selectedDateKey]);

  // Get pages for selected date
  const getDailyPages = () => {
    return getPagesForDate(pages, selectedDateKey);
  };

  // Get dates that have pages with content
  const getDatesWithPages = () => {
    const datesSet = new Set<string>();
    pages.forEach(page => {
      if (page.content.trim().length > 0) {
        const dateKey = getPageDateKey(page);
        if (dateKey) {
          datesSet.add(dateKey);
        }
      }
    });
    return Array.from(datesSet);
  };

  const handleDateSelect = async (date: Date) => {
    try {
      await editorRef.current?.flushUnsaved();
    } catch (error) {
      toast.error('날짜를 바꾸기 전에 저장하지 못했습니다: ' + String(error));
      return;
    }
    setSelectedDate(date);
    setCurrentPageIndex('daily');
    setCurrentPage(null); // Clear current page when changing dates
  };

  const handleAppTitleChange = async (newTitle: string) => {
    await tauriStorage.saveAppTitle(newTitle);
    setAppTitle(newTitle);
  };

  const handleInsertText = (text: string) => {
    if (currentPage) {
      const nextContent = `${currentPage.content}${currentPage.content.trim() ? '\n\n' : ''}${text}`;
      const updatedPage = pageWithMarkdownMetadata(currentPage, nextContent);
      handlePageUpdate(updatedPage);
    }
  };

  const handleReplaceText = (targetText: string, replacementText: string): boolean => {
    if (!currentPage || !targetText.trim()) return false;

    const index = currentPage.content.indexOf(targetText);
    if (index === -1) return false;

    const nextContent = [
      currentPage.content.slice(0, index),
      replacementText,
      currentPage.content.slice(index + targetText.length)
    ].join('');
    const updatedPage = pageWithMarkdownMetadata(currentPage, nextContent);
    handlePageUpdate(updatedPage);
    return true;
  };



  useEffect(() => {
    const initializeApp = async () => {
      // Log environment information for debugging
      logEnvironmentInfo();

      // 기존 블록 데이터 정리 (마이그레이션)
      tauriStorage.cleanupBlockData();

      try {
        const loadedPages = await tauriStorage.getPages();
        const savedPages = loadedPages.map(normalizePage);

        setStartupError(null);
        pagesRef.current = savedPages;
        setPages(savedPages);

        // Load app title from storage
        const savedTitle = await tauriStorage.getAppTitle();
        if (savedTitle) {
          setAppTitle(savedTitle);
        }

        // Check if there are pages for today
        const today = new Date();
        const todayKey = formatDateKey(today);
        const todayPages = getPagesForDate(savedPages, todayKey);

        if (todayPages.length > 0 && !currentPage) {
          setCurrentPageIndex('daily');
          setCurrentPage(todayPages[0]);
        }
      } catch (error) {
        console.error('Failed to initialize app:', error);
        setStartupError(error instanceof Error ? error.message : String(error));
      }
    };

    initializeApp();
  }, []);



  // Update current page when date changes
  useEffect(() => {
    const currentPageStillExists = currentPage
      ? pages.some(page => page.id === currentPage.id)
      : false;

    if (currentPage && currentPageStillExists) {
      return;
    }

    const dailyPages = getDailyPages();
    setCurrentPage(dailyPages[0] || null);
  }, [selectedDate, pages, currentPage]);



  const handleDailyIndexOpen = useCallback(async () => {
    try {
      await editorRef.current?.flushUnsaved();
    } catch (error) {
      toast.error('목록을 바꾸기 전에 저장하지 못했습니다: ' + String(error));
      return;
    }
    const dailyPages = getPagesForDate(pagesRef.current, selectedDateKey);

    setCurrentPageIndex('daily');
    setWorkspaceView('editor');
    setCurrentPage(previousPage => (
      previousPage && dailyPages.some(page => page.id === previousPage.id)
        ? previousPage
        : dailyPages[0] || null
    ));
  }, [selectedDateKey, setWorkspaceView]);

  const handlePageSelect = async (page: Page, source: PageSelectionSource = 'global') => {
    if (currentPage?.id !== page.id) {
      try {
        await editorRef.current?.flushUnsaved();
      } catch (error) {
        toast.error('페이지를 바꾸기 전에 저장하지 못했습니다: ' + String(error));
        return;
      }
    }
    const pageDateKey = getPageDateKey(page);
    const nextSelectionState = resolvePageSelectionState({
      currentDateKey: selectedDateKey,
      pageDateKey,
      isProjectPage: isProjectIndexPage(page),
      requestedSource: source,
    });

    setCurrentPage(page);
    setCurrentPageIndex(nextSelectionState.activeIndex);
    setWorkspaceView('editor');

    if (selectedDateKey !== nextSelectionState.selectedDateKey) {
      setSelectedDate(parseDateKey(nextSelectionState.selectedDateKey));
    }
  };

  const createPage = async ({
    title,
    type = 'page',
    dateKey = selectedDateKey,
    projectParentId = null,
    switchToNew = true
  }: CreatePageOptions) => {
    // 현재 페이지가 있으면 먼저 저장 (페이지 전환 시 자동 저장)
    if (currentPage) {
      await handleSave();
    }

    const normalizedProjectParentId = projectParentId || null;
    const currentPages = pagesRef.current;
    if (
      normalizedProjectParentId
      && !currentPages.some(page => page.id === normalizedProjectParentId)
    ) {
      console.warn('Project parent not found; skipped creating orphan project page:', normalizedProjectParentId);
      return;
    }

    const pageDate = dateKey ? parseDateKey(dateKey) : new Date();
    const siblingPages = dateKey !== null && normalizedProjectParentId === null
      ? currentPages.filter(p => p.type !== 'folder' && getPageDateKey(p) === dateKey)
      : currentPages.filter(p => isProjectIndexPage(p) && getProjectParentId(p) === normalizedProjectParentId);
    const maxOrder = Math.max(
      ...siblingPages.map(p => p.order),
      -1
    );

    const newPage: Page = normalizePage({
      id: tauriStorage.generateId(),
      title,
      icon: type === 'folder' ? '📁' : '📄',
      parentId: normalizedProjectParentId,
      projectParentId: normalizedProjectParentId,
      projectIndex: dateKey === null || normalizedProjectParentId !== null,
      dateKey,
      content: type === 'folder' ? '' : '', // 폴더는 빈 콘텐츠
      createdAt: toLocalISOString(pageDate),
      updatedAt: toLocalISOString(new Date()),
      type,
      tags: [],
      order: maxOrder + 1
    });

    await tauriStorage.savePage(newPage);

    const updatedPages = [...currentPages, newPage];
    pagesRef.current = updatedPages;
    setPages(updatedPages);

    // 폴더가 아니고 switchToNew가 true인 경우에만 새 페이지로 전환
    if (type === 'page' && switchToNew) {
      setCurrentPageIndex(dateKey === null || normalizedProjectParentId !== null ? 'project' : 'daily');
      setCurrentPage(newPage);
    }
  };

  const handlePageCreate = async (title: string) => {
    await createPage({
      title,
      type: 'page',
      dateKey: selectedDateKey,
      projectParentId: null
    });
  };

  const handleDailyPageCreate = async (title: string) => {
    await handlePageCreate(title);
  };

  // 새 페이지 단축키는 현재 선택 날짜를 따라 데일리 페이지를 만든다.
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.ctrlKey && !event.altKey && !event.shiftKey && event.key.toLowerCase() === 'n') {
        event.preventDefault();
        handlePageCreate('새 페이지');
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [handlePageCreate]);

  const handleProjectPageCreate = async (title: string, parentId?: string) => {
    await createPage({
      title,
      type: 'page',
      dateKey: null,
      projectParentId: parentId || null
    });
  };

  const handleProjectFolderCreate = async (title: string, parentId?: string) => {
    await createPage({
      title,
      type: 'folder',
      dateKey: null,
      projectParentId: parentId || null,
      switchToNew: false
    });
  };

  const handlePageUpdate = async (updatedPage: Page) => {
    const normalizedPage = normalizePage(updatedPage);
    await tauriStorage.savePage(normalizedPage);

    const updatedPages = pagesRef.current.map(page =>
      page.id === normalizedPage.id ? normalizedPage : page
    );
    pagesRef.current = updatedPages;
    setPages(updatedPages);

    setCurrentPage(previousPage => (
      previousPage?.id === normalizedPage.id ? normalizedPage : previousPage
    ));

  };

  const handlePageDelete = async (pageId: string) => {
    try {
      await editorRef.current?.flushUnsaved();
    } catch (error) {
      toast.error('삭제 전에 저장하지 못했습니다: ' + String(error));
      return;
    }
    const pagesToDelete = getAllChildPages(pageId, pagesRef.current);
    await tauriStorage.deletePage(pageId);

    const deletedIds = new Set(pagesToDelete);
    const updatedPages = pagesRef.current.filter(page => !deletedIds.has(page.id));
    pagesRef.current = updatedPages;
    setPages(updatedPages);

    // If current page was deleted, select another page from filtered pages
    if (currentPage && pagesToDelete.includes(currentPage.id)) {
      setCurrentPageIndex('daily');
      setCurrentPage(getPagesForDate(updatedPages, selectedDateKey)[0] || null);
    }
  };

  const handlePageMove = async (pageId: string, direction: 'up' | 'down') => {
    // Find the page to move
    const pageToMove = pages.find(p => p.id === pageId);
    if (!pageToMove) return;

    // Get siblings (pages with the same parent)
    const parentId = getProjectParentId(pageToMove);
    const siblings = pages.filter(p => isProjectIndexPage(p) && getProjectParentId(p) === parentId);

    // Sort siblings by order
    siblings.sort((a, b) => a.order - b.order);

    // Find current index among siblings
    const currentIndex = siblings.findIndex(p => p.id === pageId);
    if (currentIndex === -1) return;

    // Calculate new index
    let newIndex: number;
    if (direction === 'up' && currentIndex > 0) {
      newIndex = currentIndex - 1;
    } else if (direction === 'down' && currentIndex < siblings.length - 1) {
      newIndex = currentIndex + 1;
    } else {
      return; // Can't move
    }

    // Swap the pages
    const reorderedSiblings = [...siblings];
    const [movedPage] = reorderedSiblings.splice(currentIndex, 1);
    reorderedSiblings.splice(newIndex, 0, movedPage);

    // Update order field for all reordered siblings
    const updatedSiblings = reorderedSiblings.map((page, index) => ({
      ...page,
      parentId,
      projectParentId: parentId,
      order: index,
      updatedAt: toLocalISOString(new Date())
    }));

    // Update the full pages array
    const updatedPages = pages.map(page => {
      const updatedSibling = updatedSiblings.find(s => s.id === page.id);
      return updatedSibling || page;
    });

    pagesRef.current = updatedPages;
    setPages(updatedPages);

    // Save all affected pages
    await Promise.all(updatedSiblings.map(page => tauriStorage.savePage(page)));
  };

  const handlePageParentChange = async (pageId: string, nextParentId: string | null) => {
    const pageToMove = pages.find(page => page.id === pageId);
    if (!pageToMove) return;

    const normalizedNextParentId = nextParentId || null;
    if (normalizedNextParentId === pageId) return;

    let cursor = normalizedNextParentId;
    while (cursor) {
      if (cursor === pageId) return;
      const parentPage = pages.find(page => page.id === cursor);
      cursor = parentPage ? getProjectParentId(parentPage) : null;
    }

    const maxOrder = Math.max(
      ...pages
        .filter(page => page.id !== pageId && isProjectIndexPage(page) && getProjectParentId(page) === normalizedNextParentId)
        .map(page => page.order),
      -1
    );
    const updatedPage = normalizePage({
      ...pageToMove,
      parentId: normalizedNextParentId,
      projectParentId: normalizedNextParentId,
      projectIndex: true,
      dateKey: null,
      order: maxOrder + 1,
      updatedAt: toLocalISOString(new Date())
    });
    const updatedPages = pages.map(page => page.id === pageId ? updatedPage : page);

    pagesRef.current = updatedPages;
    setPages(updatedPages);
    if (currentPage?.id === pageId) {
      setCurrentPage(updatedPage);
    }
    await tauriStorage.savePage(updatedPage);
  };

  const getAllChildPages = (pageId: string, allPages: Page[]): string[] => {
    const childrenByParent = new Map<string, string[]>();
    for (const page of allPages) {
      const parentId = getProjectParentId(page);
      if (!parentId) continue;
      const children = childrenByParent.get(parentId) ?? [];
      children.push(page.id);
      childrenByParent.set(parentId, children);
    }

    const result: string[] = [];
    const visited = new Set<string>();
    const pending = [pageId];
    while (pending.length > 0) {
      const nextId = pending.pop()!;
      if (visited.has(nextId)) continue;
      visited.add(nextId);
      result.push(nextId);
      pending.push(...(childrenByParent.get(nextId) ?? []));
    }
    return result;
  };

  const handleSave = async () => {
    await editorRef.current?.flushUnsaved();
  };

  const handleExport = async () => {
    if (!currentPage) {
      throw new Error('내보낼 페이지가 없습니다.');
    }

    try {
      await handleSave();
      const pageToExport = pagesRef.current.find(page => page.id === currentPage.id) ?? currentPage;
      // 파일 이름 생성 (특수문자 제거)
      const fileName = `${pageToExport.title.replace(/[<>:"/\\|?*]/g, '_')}.md`;

      // Markdown 콘텐츠 생성
      let markdownContent = `# ${pageToExport.title}\n\n`;

      // 메타데이터 추가
      markdownContent += `---\n`;
      markdownContent += `생성일: ${new Date(pageToExport.createdAt).toLocaleString('ko-KR')}\n`;
      markdownContent += `수정일: ${new Date(pageToExport.updatedAt).toLocaleString('ko-KR')}\n`;
      if (pageToExport.tags && pageToExport.tags.length > 0) {
        markdownContent += `태그: ${pageToExport.tags.map(tag => `#${tag}`).join(' ')}\n`;
      }
      markdownContent += `---\n\n`;

      // 본문 내용
      markdownContent += pageToExport.content || '';

      // Blob 생성 및 다운로드
      const blob = new Blob([markdownContent], { type: 'text/markdown;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = fileName;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);

    } catch (error) {
      console.error('내보내기 실패:', error);
      throw error;
    }
  };

  const openSettingsAfterSave = async () => {
    try {
      await handleSave();
      setIsSettingsOpen(true);
    } catch (error) {
      toast.error('설정을 열기 전에 저장하지 못했습니다: ' + String(error));
    }
  };

  commandContextRef.current = {
    hasCurrentPage: Boolean(currentPage),
    canUseAi: true,
    createDailyPage: () => handleDailyPageCreate('새 페이지'),
    quickCapture: () => {
      const time = new Intl.DateTimeFormat('ko-KR', {
        hour: '2-digit',
        minute: '2-digit',
        hour12: false,
      }).format(new Date());
      return handleDailyPageCreate(`빠른 메모 ${time}`);
    },
    setLeftView,
    setWorkspaceView,
    openAi: () => {
      setContextTab('ai');
      setPanelOpen('right', true);
    },
    summarizeCurrentPage: () => {
      setContextTab('ai');
      setPanelOpen('right', true);
      window.dispatchEvent(new CustomEvent('memoji:ai-action', {
        detail: { action: 'summarize-current' },
      }));
    },
    saveDocument: async () => {
      await handleSave();
      toast.success('저장되었습니다.');
    },
    exportDocument: async () => {
      await handleExport();
      toast.success('파일이 다운로드되었습니다.');
    },
    openSettings: openSettingsAfterSave,
    toggleFocus: toggleFocusMode,
    togglePanel,
    openCommandPalette: () => setCommandPaletteOpen(true),
  };

  return (
    <AppShell
      focusMode={isFocusMode}
      topBar={!isFocusMode ? (
        <TopCommandBar
          workspaceName={appTitle}
          leftOpen={workspaceUi.leftOpen}
          rightOpen={workspaceUi.rightOpen}
          saveState="saved"
          runtimeState="로컬 AI"
          onToggleLeft={() => togglePanel('left')}
          onToggleRight={() => togglePanel('right')}
          onOpenPalette={() => setCommandPaletteOpen(true)}
          onSave={handleSave}
          onExport={async () => {
            await handleExport();
            toast.success('파일이 다운로드되었습니다.');
          }}
          onOpenSettings={() => void openSettingsAfterSave()}
          onOpenShortcuts={() => setIsShortcutsOpen(true)}
          onToggleFocus={toggleFocusMode}
          onToggleTheme={() => setTheme(actualTheme === 'dark' ? 'light' : 'dark')}
        />
      ) : undefined}
      notice={startupError ? (
        <div role="alert" className="border-b border-destructive/30 bg-destructive/10 px-4 py-2 text-sm text-destructive">
          저장소를 열지 못했습니다. {startupError}
        </div>
      ) : undefined}
      workspace={(
        <WorkspaceLayout
          left={(
            <WorkspaceSidebar
              pages={pages}
              dailyPages={getDailyPages()}
              currentPage={currentPage}
              currentPageIndex={currentPageIndex}
              onPageSelect={handlePageSelect}
              onDailyIndexOpen={handleDailyIndexOpen}
              onDailyPageCreate={handleDailyPageCreate}
              onProjectPageCreate={handleProjectPageCreate}
              onProjectFolderCreate={handleProjectFolderCreate}
              onPageUpdate={handlePageUpdate}
              onPageDelete={handlePageDelete}
              onPageMove={handlePageMove}
              onPageParentChange={handlePageParentChange}
              onDateSelect={handleDateSelect}
              selectedDate={selectedDate}
              datesWithPages={getDatesWithPages()}
              onClose={() => setPanelOpen('left', false)}
              onInsertText={handleInsertText}
              activeView={workspaceUi.leftView}
              onViewChange={(view) => {
                setLeftView(view);
                setWorkspaceView(
                  view === 'tasks'
                    ? 'tasks'
                    : view === 'calendar'
                      ? 'calendar'
                      : view === 'knowledge'
                        ? 'knowledge'
                        : 'editor',
                );
              }}
            />
          )}
          center={(
            <WorkspaceCanvas
              view={workspaceUi.workspaceView}
              editor={(
                <MarkdownEditor
                  ref={editorRef}
                  currentPage={currentPage}
                  onPageUpdate={handlePageUpdate}
                  pages={pages}
                  onPageSelect={handlePageSelect}
                  onPageCreate={handlePageCreate}
                />
              )}
            />
          )}
          right={(
            <RightPanel
              pages={pages}
              onPageSelect={handlePageSelect}
              isOpen={workspaceUi.rightOpen}
              onClose={() => setPanelOpen('right', false)}
              onDateSelect={handleDateSelect}
              selectedDate={selectedDate}
              datesWithPages={getDatesWithPages()}
              currentPage={currentPage}
              onInsertText={handleInsertText}
              onReplaceText={handleReplaceText}
            />
          )}
          leftOpen={workspaceUi.leftOpen}
          rightOpen={workspaceUi.rightOpen}
          leftWidth={workspaceUi.leftWidth}
          rightWidth={workspaceUi.rightWidth}
          focusMode={isFocusMode}
          onLeftOpenChange={(open) => setPanelOpen('left', open)}
          onRightOpenChange={(open) => setPanelOpen('right', open)}
          onLeftWidthChange={(width) => setPanelWidth('left', width)}
          onRightWidthChange={(width) => setPanelWidth('right', width)}
        />
      )}
    >
      <CommandPalette
        open={workspaceUi.commandPaletteOpen}
        onOpenChange={setCommandPaletteOpen}
        commands={APP_COMMANDS}
        context={commandContextRef.current}
        pages={pages
          .filter((page) => page.type === 'page')
          .map((page) => ({
            id: page.id,
            title: page.title,
            excerpt: page.content.replace(/\s+/g, ' ').trim().slice(0, 120),
            tags: page.tags,
            updatedAt: page.updatedAt,
          }))}
        tasks={[]}
        recentPageIds={currentPage ? [currentPage.id] : undefined}
        onPageSelect={(pageSummary) => {
          const page = pagesRef.current.find((candidate) => candidate.id === pageSummary.id);
          if (page) void handlePageSelect(page);
        }}
        onTaskSelect={() => {
          setLeftView('tasks');
          setWorkspaceView('tasks');
        }}
      />

      {/* 단축키 설정 모달 */}
      <KeyboardShortcutsModal
        isOpen={isShortcutsOpen}
        onClose={() => setIsShortcutsOpen(false)}
      />

      {/* 설정 모달 */}
      <SettingsModal
        isOpen={isSettingsOpen}
        onClose={() => setIsSettingsOpen(false)}
        appTitle={appTitle}
        onAppTitleChange={handleAppTitleChange}
        onDataImported={reloadPagesFromStorage}
      />

      <Toaster />
    </AppShell>
  );
}

export default function App() {
  return <AppContent />;
}
