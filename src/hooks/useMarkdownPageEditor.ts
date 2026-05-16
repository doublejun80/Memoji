import { useCallback, useEffect, useRef, useState } from 'react';
import { Page } from '../types';
import { pageWithMarkdownMetadata } from '../utils/markdownMetadata';

export type EditorMode = 'wysiwyg' | 'source';

interface UseMarkdownPageEditorOptions {
  currentPage: Page | null;
  onPageUpdate: (page: Page) => void | Promise<void>;
  onSaveRequest?: number;
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
  onSaveRequest,
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

  useEffect(() => {
    onPageUpdateRef.current = onPageUpdate;
  }, [onPageUpdate]);

  const savePage = useCallback(async (page: Page, markdown: string) => {
    const nextPage = pageWithMarkdownMetadata(page, markdown);

    try {
      await onPageUpdateRef.current(nextPage);
      if (pageRef.current?.id === nextPage.id) {
        pageRef.current = nextPage;
        contentRef.current = markdown;
        dirtyRef.current = false;
        setHasUnsavedChanges(false);
      }
    } catch (error) {
      console.error('Failed to save page:', error);
      if (pageRef.current?.id === page.id) {
        dirtyRef.current = true;
        setHasUnsavedChanges(true);
      }
    }
  }, []);

  const flushUnsaved = useCallback(() => {
    if (!pageRef.current || !dirtyRef.current) return Promise.resolve();
    return savePage(pageRef.current, contentRef.current);
  }, [savePage]);

  useEffect(() => {
    if (!currentPage) {
      void flushUnsaved();
      pageRef.current = null;
      contentRef.current = '';
      lastPageIdRef.current = null;
      dirtyRef.current = false;
      setContent('');
      setHasUnsavedChanges(false);
      return;
    }

    if (currentPage.id !== lastPageIdRef.current) {
      void flushUnsaved();
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
      void flushUnsaved();
    };
  }, [flushUnsaved]);

  useEffect(() => {
    if (!pageRef.current || !dirtyRef.current) return;

    const timer = window.setTimeout(() => {
      if (pageRef.current && dirtyRef.current) {
        void savePage(pageRef.current, contentRef.current);
      }
    }, debounceMs);

    return () => window.clearTimeout(timer);
  }, [content, debounceMs, savePage]);

  useEffect(() => {
    if (!onSaveRequest || onSaveRequest <= 0) return;
    void flushUnsaved();
  }, [onSaveRequest, flushUnsaved]);

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
