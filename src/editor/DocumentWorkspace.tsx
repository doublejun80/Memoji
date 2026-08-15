import { forwardRef, useImperativeHandle, useState, type SyntheticEvent } from 'react';
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
}

export interface DocumentWorkspaceHandle {
  flushUnsaved: () => Promise<void>;
}

export const DocumentWorkspace = forwardRef<DocumentWorkspaceHandle, DocumentWorkspaceProps>(({
  currentPage,
  onPageUpdate,
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

  useImperativeHandle(ref, () => ({ flushUnsaved }), [flushUnsaved]);

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
      <MetadataStrip page={currentPage} />
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
