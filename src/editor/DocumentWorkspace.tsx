import { forwardRef, useEffect, useImperativeHandle, useRef, useState, type SyntheticEvent } from 'react';
import { FileQuestion, FolderOpen } from 'lucide-react';
import type { Page } from '../types';
import { MilkdownEditor } from '../components/editor/MilkdownEditor';
import { useMarkdownPageEditor } from '../hooks/useMarkdownPageEditor';
import { WorkspaceStatusBar } from '../workspace/WorkspaceStatusBar';
import { DocumentBar } from './DocumentBar';
import { MetadataStrip } from './MetadataStrip';
import { SelectionAiToolbar, type EditorSelection } from './SelectionAiToolbar';
import { hashTextAnchor } from '../features/ai/aiProposalReducer';

export interface DocumentWorkspaceProps {
  currentPage: Page | null;
  onPageUpdate: (page: Page) => void | Promise<void>;
  onOpenProperties?: () => void;
}

export interface DocumentWorkspaceHandle {
  flushUnsaved: () => Promise<void>;
}

export const DocumentWorkspace = forwardRef<DocumentWorkspaceHandle, DocumentWorkspaceProps>(({
  currentPage,
  onPageUpdate,
  onOpenProperties,
}, ref) => {
  const {
    content,
    mode,
    setMode,
    hasUnsavedChanges,
    flushUnsaved,
    handleContentChange,
  } = useMarkdownPageEditor({ currentPage, onPageUpdate });
  const [selection, setSelection] = useState<EditorSelection | null>(null);
  const sourceRef = useRef<HTMLTextAreaElement>(null);

  useImperativeHandle(ref, () => ({ flushUnsaved }), [flushUnsaved]);

  useEffect(() => {
    const navigate = (event: Event) => {
      const heading = (event as CustomEvent<{ id: string; text: string; line: number }>).detail;
      if (!heading || !currentPage || currentPage.type === 'folder') return;
      if (mode === 'source' && sourceRef.current) {
        const lines = content.split(/\r?\n/);
        const lineIndex = Math.max(0, Math.min(lines.length - 1, heading.line - 1));
        const start = lines.slice(0, lineIndex).reduce((offset, line) => offset + line.length + 1, 0);
        const end = start + (lines[lineIndex]?.length ?? 0);
        sourceRef.current.focus();
        sourceRef.current.setSelectionRange(start, end);
        sourceRef.current.scrollTop = Math.max(0, (lineIndex - 3) * 21);
      } else {
        const candidates = Array.from(document.querySelectorAll<HTMLElement>('.document-body h1, .document-body h2, .document-body h3, .document-body h4, .document-body h5, .document-body h6'));
        const target = candidates.find((candidate) => candidate.textContent?.trim() === heading.text);
        target?.scrollIntoView?.({ behavior: 'smooth', block: 'center' });
      }
      window.dispatchEvent(new CustomEvent('memoji:outline-active', { detail: heading }));
    };
    window.addEventListener('memoji:outline-navigate', navigate);
    return () => window.removeEventListener('memoji:outline-navigate', navigate);
  }, [content, currentPage, mode]);

  if (!currentPage) {
    return (
      <div className="document-empty-state">
        <FileQuestion aria-hidden="true" />
        <h2>페이지를 선택하세요</h2>
        <p>사이드바에서 페이지를 선택하거나 새 페이지를 만들어보세요.</p>
      </div>
    );
  }

  if (currentPage.type === 'folder') {
    return (
      <div className="document-empty-state">
        <FolderOpen aria-hidden="true" />
        <h2>{currentPage.title}</h2>
        <p>폴더는 편집할 수 없습니다. 하위 페이지를 만들거나 선택하세요.</p>
      </div>
    );
  }

  const updateSourceSelection = (event: SyntheticEvent<HTMLTextAreaElement>) => {
    const target = event.currentTarget;
    const start = target.selectionStart;
    const end = target.selectionEnd;
    if (end <= start) {
      setSelection(null);
      return;
    }
    const text = target.value.slice(start, end);
    setSelection({
      pageId: currentPage.id,
      baseRevision: currentPage.revision ?? 0,
      text,
      start,
      end,
      textHash: hashTextAnchor(text),
    });
  };

  return (
    <article className="document-workspace" aria-label={`${currentPage.title} 문서`}>
      <DocumentBar
        page={currentPage}
        mode={mode}
        hasUnsavedChanges={hasUnsavedChanges}
        onModeChange={(nextMode) => {
          setSelection(null);
          setMode(nextMode);
        }}
      />
      <MetadataStrip page={currentPage} onOpenProperties={onOpenProperties} />
      <div className="document-body">
        {mode === 'wysiwyg' ? (
          <MilkdownEditor
            key={currentPage.id}
            value={content}
            onChange={handleContentChange}
            placeholder="마크다운으로 작성해보세요. / 또는 상단 툴바에서 표를 넣을 수 있습니다."
          />
        ) : (
          <textarea
            ref={sourceRef}
            value={content}
            onChange={(event) => handleContentChange(event.target.value)}
            onSelect={updateSourceSelection}
            onKeyUp={updateSourceSelection}
            onPointerUp={updateSourceSelection}
            className="document-source-editor"
            aria-label="Markdown 원문"
            placeholder="Markdown 원문"
            spellCheck="false"
          />
        )}
        <SelectionAiToolbar selection={selection} />
      </div>
      <WorkspaceStatusBar content={content} mode={mode} updatedAt={currentPage.updatedAt} />
    </article>
  );
});

DocumentWorkspace.displayName = 'DocumentWorkspace';
