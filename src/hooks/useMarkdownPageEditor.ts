import { useCallback, useEffect, useRef, useState } from 'react';
import { Page } from '../types';
import { pageWithMarkdownMetadata } from '../utils/markdownMetadata';

export type EditorMode = 'wysiwyg' | 'source';

interface UseMarkdownPageEditorOptions {
  currentPage: Page | null;
  onPageUpdate: (page: Page) => void | Promise<void>;
  debounceMs?: number;
}

const getShortcutKey = (id: string, fallback: string): string => {
  const savedShortcuts = localStorage.getItem('keyboardShortcuts');
  if (!savedShortcuts) return fallback;

  try {
    const shortcuts = JSON.parse(savedShortcuts);
    const shortcut = shortcuts.find((item: { id: string }) => item.id === id);
    return shortcut?.currentKey || fallback;
  } catch {
    return fallback;
  }
};

const matchesShortcut = (event: KeyboardEvent, shortcutKey: string): boolean => {
  const parts = shortcutKey.split('+').map((part) => part.trim());
  const hasCtrl = parts.includes('Ctrl');
  const hasAlt = parts.includes('Alt');
  const hasShift = parts.includes('Shift');
  const key = parts.find((part) => !['Ctrl', 'Alt', 'Shift', 'Cmd'].includes(part));

  return (
    event.ctrlKey === hasCtrl &&
    event.altKey === hasAlt &&
    event.shiftKey === hasShift &&
    event.key.toLowerCase() === key?.toLowerCase()
  );
};

const mergeExternalContent = (baseContent: string, localContent: string, incomingContent: string): string => {
  if (incomingContent === baseContent) return localContent;
  if (localContent === baseContent) return incomingContent;
  if (incomingContent.startsWith(baseContent)) {
    return `${localContent}${incomingContent.slice(baseContent.length)}`;
  }
  if (incomingContent.endsWith(baseContent)) {
    return `${incomingContent.slice(0, incomingContent.length - baseContent.length)}${localContent}`;
  }

  let start = 0;
  while (
    start < baseContent.length &&
    start < incomingContent.length &&
    baseContent[start] === incomingContent[start]
  ) {
    start += 1;
  }

  let baseEnd = baseContent.length;
  let incomingEnd = incomingContent.length;
  while (
    baseEnd > start &&
    incomingEnd > start &&
    baseContent[baseEnd - 1] === incomingContent[incomingEnd - 1]
  ) {
    baseEnd -= 1;
    incomingEnd -= 1;
  }

  const removedText = baseContent.slice(start, baseEnd);
  if (localContent.slice(start, start + removedText.length) !== removedText) return localContent;

  return [
    localContent.slice(0, start),
    incomingContent.slice(start, incomingEnd),
    localContent.slice(start + removedText.length),
  ].join('');
};

export const useMarkdownPageEditor = ({
  currentPage,
  onPageUpdate,
  debounceMs = 900,
}: UseMarkdownPageEditorOptions) => {
  const [content, setContent] = useState('');
  const [mode, setMode] = useState<EditorMode>('wysiwyg');
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);

  const pageRef = useRef<Page | null>(null);
  const contentRef = useRef('');
  const dirtyRef = useRef(false);
  const lastPageIdRef = useRef<string | null>(null);
  const onPageUpdateRef = useRef(onPageUpdate);
  const saveVersionRef = useRef(0);
  const latestAppliedSaveVersionRef = useRef(0);
  const saveQueueRef = useRef<Promise<void>>(Promise.resolve());

  useEffect(() => {
    onPageUpdateRef.current = onPageUpdate;
  }, [onPageUpdate]);

  const savePage = useCallback((page: Page, markdown: string): Promise<void> => {
    const saveVersion = ++saveVersionRef.current;
    const nextPage = pageWithMarkdownMetadata(page, markdown);

    const queuedSave = saveQueueRef.current.then(async () => {
      try {
        await onPageUpdateRef.current(nextPage);
        if (saveVersion < latestAppliedSaveVersionRef.current) return;
        latestAppliedSaveVersionRef.current = saveVersion;

        if (pageRef.current?.id === nextPage.id) {
          pageRef.current = nextPage;
          const hasNewerLocalContent = contentRef.current !== markdown;
          dirtyRef.current = hasNewerLocalContent;
          setHasUnsavedChanges(hasNewerLocalContent);
        }
      } catch (error) {
        console.error('Failed to save page:', error);
        if (pageRef.current?.id === page.id) {
          dirtyRef.current = true;
          setHasUnsavedChanges(true);
        }
        throw error;
      }
    });

    saveQueueRef.current = queuedSave.catch(() => undefined);
    return queuedSave;
  }, []);

  const flushUnsaved = useCallback(async () => {
    // VDI의 느린 디스크 쓰기 중 사용자가 다시 입력할 수 있다. 한 번의 snapshot만
    // 저장하면 종료·이동 직전에 그 새 입력이 빠지므로 dirty가 사라질 때까지 직렬화한다.
    while (pageRef.current && dirtyRef.current) {
      const pageId = pageRef.current.id;
      await savePage(pageRef.current, contentRef.current);
      if (pageRef.current?.id !== pageId) return;
    }
  }, [savePage]);

  useEffect(() => {
    if (!currentPage) {
      void flushUnsaved().catch(() => undefined);
      pageRef.current = null;
      contentRef.current = '';
      lastPageIdRef.current = null;
      dirtyRef.current = false;
      setContent('');
      setHasUnsavedChanges(false);
      return;
    }

    if (currentPage.id !== lastPageIdRef.current) {
      void flushUnsaved().catch(() => undefined);
      pageRef.current = currentPage;
      contentRef.current = currentPage.content || '';
      lastPageIdRef.current = currentPage.id;
      dirtyRef.current = false;
      setContent(currentPage.content || '');
      setHasUnsavedChanges(false);
      setMode('wysiwyg');
      return;
    }

    const previousContent = pageRef.current?.content || '';
    const incomingContent = currentPage.content || '';
    pageRef.current = currentPage;

    if (incomingContent !== previousContent) {
      const nextContent = dirtyRef.current
        ? mergeExternalContent(previousContent, contentRef.current, incomingContent)
        : incomingContent;

      contentRef.current = nextContent;
      dirtyRef.current = nextContent !== incomingContent;
      setContent(nextContent);
      setHasUnsavedChanges(dirtyRef.current);
    }
  }, [currentPage, flushUnsaved]);

  useEffect(() => {
    return () => {
      void flushUnsaved().catch(() => undefined);
    };
  }, [flushUnsaved]);

  useEffect(() => {
    if (!pageRef.current || !dirtyRef.current) return;

    const timer = window.setTimeout(() => {
      if (pageRef.current && dirtyRef.current) {
        void savePage(pageRef.current, contentRef.current).catch(() => undefined);
      }
    }, debounceMs);

    return () => window.clearTimeout(timer);
  }, [content, debounceMs, savePage]);

  useEffect(() => {
    if (!currentPage || currentPage.type === 'folder') return;

    const handleKeyDown = (event: KeyboardEvent) => {
      const sourceModeKey = getShortcutKey('sourceMode', 'Ctrl+E');
      if (!matchesShortcut(event, sourceModeKey)) return;

      event.preventDefault();
      setMode((currentMode) => (currentMode === 'wysiwyg' ? 'source' : 'wysiwyg'));
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [currentPage]);

  const handleContentChange = (nextContent: string) => {
    contentRef.current = nextContent;
    setContent(nextContent);
    dirtyRef.current = nextContent !== (pageRef.current?.content || '');
    setHasUnsavedChanges(dirtyRef.current);
  };

  return {
    content,
    mode,
    setMode,
    hasUnsavedChanges,
    flushUnsaved,
    handleContentChange,
  };
};
