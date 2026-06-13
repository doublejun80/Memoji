import React, { useCallback, useState, useEffect, useRef } from 'react';
import { Sidebar } from './components/Sidebar';
import { MarkdownEditor } from './components/MarkdownEditor';
import { TopBar } from './components/TopBar';
import { SearchModal } from './components/SearchModal';
import { KeyboardShortcutsModal } from './components/KeyboardShortcutsModal';
import { SettingsModal } from './components/SettingsModal';
import { RightPanel } from './components/RightPanel';
import { ThemeProvider } from './contexts/ThemeContext';
import { FocusModeProvider, useFocusMode } from './contexts/FocusModeContext';
import { Page, PageNavigationIndex, PageSelectionSource } from './types';
import { tauriStorage } from './utils/tauriStorage';
import { logEnvironmentInfo } from './utils/environment';
import { formatDateKey, parseDateKey, toLocalISOString } from './utils/dateUtils';
import { pageWithMarkdownMetadata } from './utils/markdownMetadata';
import { getPageDateKey, getPagesForDate, getProjectParentId, isProjectIndexPage, normalizePage } from './utils/pageModel';
import { resolvePageSelectionState } from './utils/navigationState';
import { Toaster } from './components/ui/sonner';

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

// 내부 App 컴포넌트 (FocusMode 컨텍스트 사용)
function AppContent() {
  const [pages, setPages] = useState<Page[]>([]);
  const [currentPage, setCurrentPage] = useState<Page | null>(null);
  const [currentPageIndex, setCurrentPageIndex] = useState<PageNavigationIndex>('daily');
  const [selectedDate, setSelectedDate] = useState<Date>(new Date());
  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const [isShortcutsOpen, setIsShortcutsOpen] = useState(false);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [isRightPanelOpen, setIsRightPanelOpen] = useState(true); // 우측 패널 상태
  const [isLeftPanelOpen, setIsLeftPanelOpen] = useState(true); // 좌측 패널 상태
  const [appTitle, setAppTitle] = useState<string>('Memoji');
  const [saveTriggered, setSaveTriggered] = useState(0); // 저장 트리거 카운터
  const [startupError, setStartupError] = useState<string | null>(null);
  const { isFocusMode } = useFocusMode();
  const pagesRef = useRef<Page[]>([]);

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

  // 키보드 단축키 핸들러
  useEffect(() => {
    // localStorage에서 단축키 설정 불러오기
    const getShortcutKey = (id: string, defaultKey: string): string => {
      const shortcut = readKeyboardShortcuts().find((s: any) => s.id === id);
      return shortcut?.currentKey || defaultKey;
    };

    // 단축키 문자열을 파싱하는 함수
    const matchesShortcut = (e: KeyboardEvent, shortcutKey: string): boolean => {
      const parts = shortcutKey.split('+').map(p => p.trim());
      const hasCtrl = parts.includes('Ctrl');
      const hasAlt = parts.includes('Alt');
      const hasShift = parts.includes('Shift');
      const key = parts.find(p => !['Ctrl', 'Alt', 'Shift', 'Cmd'].includes(p));

      return (
        e.ctrlKey === hasCtrl &&
        e.altKey === hasAlt &&
        e.shiftKey === hasShift &&
        e.key.toLowerCase() === key?.toLowerCase()
      );
    };

    const handleKeyDown = (e: KeyboardEvent) => {
      // 검색 단축키
      const searchKey = getShortcutKey('search', 'Ctrl+K');
      if (matchesShortcut(e, searchKey)) {
        e.preventDefault();
        setIsSearchOpen(true);
        return;
      }

      // 저장 단축키
      const saveKey = getShortcutKey('save', 'Ctrl+S');
      if (matchesShortcut(e, saveKey)) {
        e.preventDefault();
        handleSave();
        return;
      }

      // 단축키 설정 열기 (고정)
      if (e.ctrlKey && e.shiftKey && e.key === 'K') {
        e.preventDefault();
        setIsShortcutsOpen(true);
        return;
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
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

  // Check if page has content (markdown text)
  const pageHasContent = (pageId: string) => {
    const page = pages.find(p => p.id === pageId);
    return page ? page.content.trim().length > 0 : false;
  };

  // Get dates that have pages with content
  const getDatesWithPages = () => {
    const datesSet = new Set<string>();
    pages.forEach(page => {
      if (pageHasContent(page.id)) {
        const dateKey = getPageDateKey(page);
        if (dateKey) {
          datesSet.add(dateKey);
        }
      }
    });
    return Array.from(datesSet);
  };



  // Clean up empty pages
  const cleanupEmptyPages = async () => {
    const pagesToDelete: string[] = [];
    
    pages.forEach(page => {
      if (!pageHasContent(page.id)) {
        pagesToDelete.push(page.id);
      }
    });

    if (pagesToDelete.length > 0) {
      await Promise.all(pagesToDelete.map(pageId => tauriStorage.deletePage(pageId)));
      const updatedPages = pages.filter(page => !pagesToDelete.includes(page.id));
      pagesRef.current = updatedPages;
      setPages(updatedPages);
      
      // If current page was deleted, clear it
      if (currentPage && pagesToDelete.includes(currentPage.id)) {
        setCurrentPage(null);
      }
    }
  };

  const handleDateSelect = (date: Date) => {
    setSelectedDate(date);
    setCurrentPageIndex('daily');
    setCurrentPage(null); // Clear current page when changing dates
  };

  const handleAppTitleChange = async (newTitle: string) => {
    setAppTitle(newTitle);
    await tauriStorage.saveAppTitle(newTitle);
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



  const handleDailyIndexOpen = useCallback(() => {
    const dailyPages = getPagesForDate(pagesRef.current, selectedDateKey);

    setCurrentPageIndex('daily');
    setCurrentPage(previousPage => (
      previousPage && dailyPages.some(page => page.id === previousPage.id)
        ? previousPage
        : dailyPages[0] || null
    ));
  }, [selectedDateKey]);

  const handlePageSelect = (page: Page, source: PageSelectionSource = 'global') => {
    const pageDateKey = getPageDateKey(page);
    const nextSelectionState = resolvePageSelectionState({
      currentDateKey: selectedDateKey,
      pageDateKey,
      isProjectPage: isProjectIndexPage(page),
      requestedSource: source,
    });

    setCurrentPage(page);
    setCurrentPageIndex(nextSelectionState.activeIndex);

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
    const pagesToDelete = getAllChildPages(pageId, pages);
    await tauriStorage.deletePage(pageId);

    const updatedPages = pages.filter(page => !pagesToDelete.includes(page.id));
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
    const result = [pageId];
    const children = allPages.filter(page => getProjectParentId(page) === pageId);
    
    children.forEach(child => {
      result.push(...getAllChildPages(child.id, allPages));
    });
    
    return result;
  };

  const handleSave = async () => {
    setSaveTriggered(prev => prev + 1);
  };

  const handleExport = async () => {
    if (!currentPage) {
      alert('내보낼 페이지가 없습니다.');
      return;
    }

    try {
      // 파일 이름 생성 (특수문자 제거)
      const fileName = `${currentPage.title.replace(/[<>:"/\\|?*]/g, '_')}.md`;

      // Markdown 콘텐츠 생성
      let markdownContent = `# ${currentPage.title}\n\n`;

      // 메타데이터 추가
      markdownContent += `---\n`;
      markdownContent += `생성일: ${new Date(currentPage.createdAt).toLocaleString('ko-KR')}\n`;
      markdownContent += `수정일: ${new Date(currentPage.updatedAt).toLocaleString('ko-KR')}\n`;
      if (currentPage.tags && currentPage.tags.length > 0) {
        markdownContent += `태그: ${currentPage.tags.map(tag => `#${tag}`).join(' ')}\n`;
      }
      markdownContent += `---\n\n`;

      // 본문 내용
      markdownContent += currentPage.content || '';

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
      alert('내보내기 중 오류가 발생했습니다.');
    }
  };

  return (
    <div className={`memoji-app-shell h-screen flex flex-col bg-background text-foreground ${isFocusMode ? 'focus-mode' : ''}`}>
      {/* TopBar - 집중 모드에서 숨김 */}
      {!isFocusMode && (
        <TopBar
          onSave={handleSave}
          onShortcutsOpen={() => setIsShortcutsOpen(true)}
          onSettingsOpen={() => setIsSettingsOpen(true)}
          onRightPanelToggle={() => setIsRightPanelOpen(!isRightPanelOpen)}
          isRightPanelOpen={isRightPanelOpen}
          onLeftPanelToggle={() => setIsLeftPanelOpen(!isLeftPanelOpen)}
          isLeftPanelOpen={isLeftPanelOpen}
          appTitle={appTitle}
          onExport={handleExport}
        />
      )}

      {startupError && (
        <div className="border-b border-destructive/30 bg-destructive/10 px-4 py-2 text-sm text-destructive">
          저장소를 열지 못했습니다. {startupError}
        </div>
      )}

      <div className="flex flex-1 overflow-hidden min-h-0">
        {/* Sidebar - 집중 모드에서 숨김 */}
        {!isFocusMode && isLeftPanelOpen && (
          <div
            className="flex-shrink-0"
            style={{ width: '16rem', minWidth: '16rem', maxWidth: '16rem' }}
          >
            <Sidebar
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
              onClose={() => setIsLeftPanelOpen(false)}
              onInsertText={handleInsertText}
            />
          </div>
        )}

        {/* Main Editor */}
        <div className="flex-1 overflow-hidden flex flex-col min-h-0 border-r border-border">
          <MarkdownEditor
            currentPage={currentPage}
            onPageUpdate={handlePageUpdate}
            pages={pages}
            onPageSelect={handlePageSelect}
            onPageCreate={handlePageCreate}
            onSaveRequest={saveTriggered}
          />
        </div>

        {/* Right Panel - 집중 모드에서 숨김 */}
        {!isFocusMode && isRightPanelOpen && (
          <RightPanel
            pages={pages}
            onPageSelect={handlePageSelect}
            isOpen={isRightPanelOpen}
            onClose={() => setIsRightPanelOpen(false)}
            onDateSelect={handleDateSelect}
            selectedDate={selectedDate}
            datesWithPages={getDatesWithPages()}
            currentPage={currentPage}
            onInsertText={handleInsertText}
            onReplaceText={handleReplaceText}
          />
        )}
      </div>

      {/* 검색 모달 */}
      <SearchModal
        isOpen={isSearchOpen}
        onClose={() => setIsSearchOpen(false)}
        pages={pages}
        onPageSelect={(page) => {
          handlePageSelect(page);
          setIsSearchOpen(false);
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
    </div>
  );
}

// 메인 App 컴포넌트 (Provider들로 감싸기)
export default function App() {
  return (
    <ThemeProvider>
      <FocusModeProvider>
        <AppContent />
      </FocusModeProvider>
    </ThemeProvider>
  );
}
