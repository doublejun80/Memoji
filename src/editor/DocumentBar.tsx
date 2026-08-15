import { Check, Code2, Edit3, FolderTree } from 'lucide-react';
import type { EditorMode } from '../hooks/useMarkdownPageEditor';
import type { Page } from '../types';
import { isProjectIndexPage } from '../utils/pageModel';

interface DocumentBarProps {
  page: Page;
  mode: EditorMode;
  hasUnsavedChanges: boolean;
  onModeChange: (mode: EditorMode) => void;
}

export function DocumentBar({ page, mode, hasUnsavedChanges, onModeChange }: DocumentBarProps) {
  const location = isProjectIndexPage(page) ? '프로젝트' : '데일리';
  return (
    <header className="document-bar">
      <div className="document-bar-copy">
        <div className="document-breadcrumb" aria-label="문서 경로">
          <FolderTree aria-hidden="true" />
          <span>{location}</span>
          <span aria-hidden="true">/</span>
          <span>{page.title}</span>
        </div>
        <div className="document-title-row">
          <h1>{page.title}</h1>
          <span className="document-save-state" data-dirty={hasUnsavedChanges ? 'true' : 'false'}>
            <Check aria-hidden="true" />
            {hasUnsavedChanges ? '저장 중' : '저장됨'}
          </span>
        </div>
      </div>
      <div className="document-mode-switch" aria-label="편집 방식">
        <button
          type="button"
          aria-label="편집"
          data-active={mode === 'wysiwyg' ? 'true' : 'false'}
          onClick={() => onModeChange('wysiwyg')}
        >
          <Edit3 aria-hidden="true" />
          편집
        </button>
        <button
          type="button"
          aria-label="원문"
          data-active={mode === 'source' ? 'true' : 'false'}
          onClick={() => onModeChange('source')}
        >
          <Code2 aria-hidden="true" />
          원문
        </button>
      </div>
    </header>
  );
}
