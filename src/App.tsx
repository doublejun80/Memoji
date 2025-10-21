import React, { useState, useEffect } from 'react';
import { Sidebar } from './components/Sidebar';
import { MarkdownEditor } from './components/MarkdownEditor';
import { TopBar } from './components/TopBar';
import { SearchModal } from './components/SearchModal';
import { KeyboardShortcutsModal } from './components/KeyboardShortcutsModal';
import { SettingsModal } from './components/SettingsModal';
import { RightPanel } from './components/RightPanel';
import { ThemeProvider } from './contexts/ThemeContext';
import { FocusModeProvider, useFocusMode } from './contexts/FocusModeContext';
import { Page } from './types';
import { tauriStorage } from './utils/tauriStorage';
import { logEnvironmentInfo } from './utils/environment';
import { formatDateKey, toLocalISOString, parseLocalISOString } from './utils/dateUtils';
import { Toaster } from './components/ui/sonner';

// 내부 App 컴포넌트 (FocusMode 컨텍스트 사용)
function AppContent() {
  const [pages, setPages] = useState<Page[]>([]);
  const [currentPage, setCurrentPage] = useState<Page | null>(null);
  const [selectedDate, setSelectedDate] = useState<Date>(new Date());
  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const [isShortcutsOpen, setIsShortcutsOpen] = useState(false);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [isRightPanelOpen, setIsRightPanelOpen] = useState(true); // 우측 패널 상태
  const [isLeftPanelOpen, setIsLeftPanelOpen] = useState(true); // 좌측 패널 상태
  const [appTitle, setAppTitle] = useState<string>('Memoji');
  const [saveTriggered, setSaveTriggered] = useState(0); // 저장 트리거 카운터
  const { isFocusMode } = useFocusMode();

  // 단축키 설정 마이그레이션 (Ctrl+P → Ctrl+E)
  useEffect(() => {
    const savedShortcuts = localStorage.getItem('keyboardShortcuts');
    if (savedShortcuts) {
      const shortcuts = JSON.parse(savedShortcuts);
      const previewShortcut = shortcuts.find((s: any) => s.id === 'preview');

      // Ctrl+P를 사용하고 있다면 Ctrl+E로 업데이트
      if (previewShortcut && previewShortcut.currentKey === 'Ctrl+P') {
        const updatedShortcuts = shortcuts.map((s: any) =>
          s.id === 'preview'
            ? { ...s, defaultKey: 'Ctrl+E', currentKey: 'Ctrl+E' }
            : s
        );
        localStorage.setItem('keyboardShortcuts', JSON.stringify(updatedShortcuts));
        console.log('✅ 단축키 마이그레이션 완료: Ctrl+P → Ctrl+E');
      }
    }
  }, []);

  // 키보드 단축키 핸들러
  useEffect(() => {
    // localStorage에서 단축키 설정 불러오기
    const getShortcutKey = (id: string, defaultKey: string): string => {
      const savedShortcuts = localStorage.getItem('keyboardShortcuts');
      if (savedShortcuts) {
        const shortcuts = JSON.parse(savedShortcuts);
        const shortcut = shortcuts.find((s: any) => s.id === id);
        return shortcut?.currentKey || defaultKey;
      }
      return defaultKey;
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

      // 새 페이지 단축키
      const newPageKey = getShortcutKey('newPage', 'Ctrl+N');
      if (matchesShortcut(e, newPageKey)) {
        e.preventDefault();
        handlePageCreate('새 페이지');
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

  // Helper function to get date in YYYY-MM-DD format (이미 import되어 있으므로 제거)
  // const formatDateKey = (date: Date) => {
  //   return date.toISOString().split('T')[0];
  // };

  // Get pages for selected date with hierarchical sorting
  const getFilteredPages = () => {
    const dateKey = formatDateKey(selectedDate);
    const filteredPages = pages.filter(page => {
      const pageDate = parseLocalISOString(page.createdAt);
      return formatDateKey(pageDate) === dateKey;
    });

    return sortPagesHierarchically(filteredPages);
  };

  const sortPagesHierarchically = (pages: Page[]): Page[] => {
    // 부모 ID별로 그룹화
    const pagesByParent = pages.reduce((acc, page) => {
      const parentId = page.parentId || 'root';
      if (!acc[parentId]) acc[parentId] = [];
      acc[parentId].push(page);
      return acc;
    }, {} as Record<string, Page[]>);

    // 각 그룹 내에서 order로 정렬
    Object.keys(pagesByParent).forEach(parentId => {
      pagesByParent[parentId].sort((a, b) => a.order - b.order);
    });

    // 계층적으로 정렬된 배열 생성
    const sortedPages: Page[] = [];

    const addPagesRecursively = (parentId: string | null) => {
      const key = parentId || 'root';
      const children = pagesByParent[key] || [];

      children.forEach(page => {
        sortedPages.push(page);
        addPagesRecursively(page.id);
      });
    };

    addPagesRecursively(null);
    return sortedPages;
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
        const pageDate = parseLocalISOString(page.createdAt);
        datesSet.add(formatDateKey(pageDate));
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
      setPages(updatedPages);
      
      // If current page was deleted, clear it
      if (currentPage && pagesToDelete.includes(currentPage.id)) {
        setCurrentPage(null);
      }
    }
  };

  const handleDateSelect = (date: Date) => {
    setSelectedDate(date);
    setCurrentPage(null); // Clear current page when changing dates
  };

  const handleAppTitleChange = async (newTitle: string) => {
    setAppTitle(newTitle);
    await tauriStorage.saveAppTitle(newTitle);
  };

  const handleInsertText = (text: string) => {
    if (currentPage) {
      const updatedPage = {
        ...currentPage,
        content: currentPage.content + '\n\n' + text,
        updatedAt: new Date().toISOString()
      };
      handlePageUpdate(updatedPage);
    }
  };



  useEffect(() => {
    const initializeApp = async () => {
      // Log environment information for debugging
      logEnvironmentInfo();

      // 기존 블록 데이터 정리 (마이그레이션)
      tauriStorage.cleanupBlockData();

      try {
        // Load pages from storage
        console.log('📚 App - 페이지 로드 시작');
        const savedPages = await tauriStorage.getPages();
        console.log('📚 App - 로드된 페이지 수:', savedPages.length);

        // 각 페이지의 태그 정보 출력
        savedPages.forEach(page => {
          console.log(`  - "${page.title}":`, {
            id: page.id,
            tags: page.tags,
            tagsType: typeof page.tags,
            tagsLength: page.tags?.length
          });
        });

        setPages(savedPages);

        // Load app title from storage
        const savedTitle = await tauriStorage.getAppTitle();
        if (savedTitle) {
          setAppTitle(savedTitle);
        }

        // Check if there are pages for today
        const today = new Date();
        const todayKey = formatDateKey(today);
        const todayPages = savedPages.filter(page => {
          const pageDate = parseLocalISOString(page.createdAt);
          return formatDateKey(pageDate) === todayKey;
        });

        if (todayPages.length > 0 && !currentPage) {
          setCurrentPage(todayPages[0]);
        }
      } catch (error) {
        console.error('Failed to initialize app:', error);
      }
    };

    initializeApp();
  }, []);



  // Update current page when date changes
  useEffect(() => {
    const filteredPages = getFilteredPages();
    if (filteredPages.length > 0 && (!currentPage || !filteredPages.find(p => p.id === currentPage.id))) {
      setCurrentPage(filteredPages[0]);
    } else if (filteredPages.length === 0) {
      setCurrentPage(null);
    }
  }, [selectedDate, pages]);

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      // Ctrl+N: Create new memo
      if (event.ctrlKey && event.key === 'n') {
        event.preventDefault();
        const today = new Date();
        const title = `메모 ${today.getHours()}:${today.getMinutes().toString().padStart(2, '0')}`;
        handlePageCreate(title);
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, []);



  const handlePageSelect = (page: Page) => {
    setCurrentPage(page);

    // 페이지 선택 시 해당 페이지의 생성 날짜로 달력 이동
    const pageDate = parseLocalISOString(page.createdAt);
    const currentSelectedDate = formatDateKey(selectedDate);
    const pageSelectedDate = formatDateKey(pageDate);

    // 현재 선택된 날짜와 페이지의 날짜가 다르면 날짜 변경
    if (currentSelectedDate !== pageSelectedDate) {
      setSelectedDate(pageDate);
    }
  };

  const handlePageCreate = async (title: string, parentId?: string, type: 'page' | 'folder' = 'page', switchToNew: boolean = true) => {
    // 현재 페이지가 있으면 먼저 저장 (페이지 전환 시 자동 저장)
    if (currentPage) {
      await handleSave();
    }

    // Create page with selected date
    const pageDate = new Date(selectedDate);
    const maxOrder = Math.max(...pages.filter(p => p.parentId === (parentId || null)).map(p => p.order), -1);

    const newPage: Page = {
      id: tauriStorage.generateId(),
      title,
      icon: type === 'folder' ? '📁' : '📄',
      parentId: parentId || null,
      content: type === 'folder' ? '' : '', // 폴더는 빈 콘텐츠
      createdAt: toLocalISOString(pageDate),
      updatedAt: toLocalISOString(pageDate),
      type,
      tags: [],
      order: maxOrder + 1
    };

    await tauriStorage.savePage(newPage);

    const updatedPages = [...pages, newPage];
    setPages(updatedPages);

    // 폴더가 아니고 switchToNew가 true인 경우에만 새 페이지로 전환
    if (type === 'page' && switchToNew) {
      setCurrentPage(newPage);
    }
  };

  const handleFolderCreate = async (title: string, parentId?: string) => {
    await handlePageCreate(title, parentId, 'folder');
  };

  const handlePageUpdate = async (updatedPage: Page) => {
    console.log('📝 App.handlePageUpdate 호출:', updatedPage.title);
    console.log('  - content 길이:', updatedPage.content?.length || 0);
    console.log('  - tags:', updatedPage.tags);
    console.log('  - 전체 페이지 객체:', updatedPage);

    await tauriStorage.savePage(updatedPage);

    setPages(pages.map(page =>
      page.id === updatedPage.id ? updatedPage : page
    ));

    if (currentPage?.id === updatedPage.id) {
      setCurrentPage(updatedPage);
    }

    console.log('✅ App.handlePageUpdate 완료');
  };

  const handlePageDelete = async (pageId: string) => {
    // Delete page and all its children
    const pagesToDelete = getAllChildPages(pageId, pages);
    await Promise.all(pagesToDelete.map(id => tauriStorage.deletePage(id)));

    const updatedPages = pages.filter(page => !pagesToDelete.includes(page.id));
    setPages(updatedPages);

    // If current page was deleted, select another page from filtered pages
    if (currentPage && pagesToDelete.includes(currentPage.id)) {
      const filteredPages = updatedPages.filter(page => {
        const pageDate = parseLocalISOString(page.createdAt);
        return formatDateKey(pageDate) === formatDateKey(selectedDate);
      });
      setCurrentPage(filteredPages[0] || null);
    }
  };

  const handlePageMove = async (pageId: string, direction: 'up' | 'down') => {
    // Find the page to move
    const pageToMove = pages.find(p => p.id === pageId);
    if (!pageToMove) return;

    // Get siblings (pages with the same parent)
    const siblings = pages.filter(p => p.parentId === pageToMove.parentId);

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
      order: index,
      updatedAt: toLocalISOString(new Date())
    }));

    // Update the full pages array
    const updatedPages = pages.map(page => {
      const updatedSibling = updatedSiblings.find(s => s.id === page.id);
      return updatedSibling || page;
    });

    setPages(updatedPages);

    // Save all affected pages
    await Promise.all(updatedSiblings.map(page => tauriStorage.savePage(page)));
  };

  const getAllChildPages = (pageId: string, allPages: Page[]): string[] => {
    const result = [pageId];
    const children = allPages.filter(page => page.parentId === pageId);
    
    children.forEach(child => {
      result.push(...getAllChildPages(child.id, allPages));
    });
    
    return result;
  };

  const handleSave = async () => {
    // MarkdownEditor에 저장 트리거
    setSaveTriggered(prev => prev + 1);

    // Clean up truly empty pages when saving (no content at all)
    // ❌ 폴더는 삭제하지 않음 (폴더는 항상 빈 콘텐츠를 가짐)
    const pagesToDelete: string[] = [];

    pages.forEach(page => {
      // 폴더가 아니고, 내용이 비어있는 페이지만 삭제
      if (page.type !== 'folder' && (!page.content || page.content.trim().length === 0)) {
        pagesToDelete.push(page.id);
      }
    });

    if (pagesToDelete.length > 0) {
      await Promise.all(pagesToDelete.map(pageId => tauriStorage.deletePage(pageId)));
      const updatedPages = pages.filter(page => !pagesToDelete.includes(page.id));
      setPages(updatedPages);

      if (currentPage && pagesToDelete.includes(currentPage.id)) {
        setCurrentPage(null);
      }
    }
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

      console.log(`✅ 내보내기 완료: ${fileName}`);
    } catch (error) {
      console.error('내보내기 실패:', error);
      alert('내보내기 중 오류가 발생했습니다.');
    }
  };

  return (
    <div className={`h-screen flex flex-col bg-background text-foreground ${isFocusMode ? 'focus-mode' : ''}`}>
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

      <div className="flex flex-1 overflow-hidden min-h-0">
        {/* Sidebar - 집중 모드에서 숨김 */}
        {!isFocusMode && isLeftPanelOpen && (
          <div className="flex-shrink-0 w-52 min-w-52 max-w-52">
            <Sidebar
              pages={getFilteredPages()}
              currentPage={currentPage}
              onPageSelect={handlePageSelect}
              onPageCreate={handlePageCreate}
              onFolderCreate={handleFolderCreate}
              onPageUpdate={handlePageUpdate}
              onPageDelete={handlePageDelete}
              onPageMove={handlePageMove}
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