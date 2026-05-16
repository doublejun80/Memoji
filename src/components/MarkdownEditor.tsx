import React from 'react';
import { Code2, Edit3 } from 'lucide-react';
import { Page } from '../types';
import { Button } from './ui/button';
import { MilkdownEditor } from './editor/MilkdownEditor';
import { useMarkdownPageEditor } from '../hooks/useMarkdownPageEditor';

interface MarkdownEditorProps {
  currentPage: Page | null;
  onPageUpdate: (page: Page) => void | Promise<void>;
  pages?: Page[];
  onPageSelect?: (page: Page) => void;
  onPageCreate?: (title: string) => void;
  onSaveRequest?: number;
}

export const MarkdownEditor: React.FC<MarkdownEditorProps> = ({
  currentPage,
  onPageUpdate,
  onSaveRequest,
}) => {
  const {
    content,
    mode,
    setMode,
    hasUnsavedChanges,
    handleContentChange,
  } = useMarkdownPageEditor({
    currentPage,
    onPageUpdate,
    onSaveRequest,
  });

  if (!currentPage) {
    return (
      <div className="flex-1 flex items-center justify-center text-muted-foreground">
        <div className="text-center">
          <h3 className="text-lg mb-2">페이지를 선택하세요</h3>
          <p className="text-sm">사이드바에서 페이지를 선택하거나 새 페이지를 만들어보세요.</p>
        </div>
      </div>
    );
  }

  if (currentPage.type === 'folder') {
    return (
      <div className="flex-1 flex items-center justify-center text-muted-foreground">
        <div className="text-center">
          <div className="text-4xl mb-4">📁</div>
          <h3 className="text-lg mb-2">{currentPage.title}</h3>
          <p className="text-sm">폴더는 편집할 수 없습니다. 하위 페이지를 생성하거나 선택해주세요.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col min-h-0 bg-background">
      <div className="memoji-editor-header">
        <div className="memoji-editor-title-row">
          <h1 className="memoji-editor-title">{currentPage.title}</h1>
          {hasUnsavedChanges ? (
            <span className="memoji-editor-save-state text-orange-500">저장 중</span>
          ) : (
            <span className="memoji-editor-save-state text-muted-foreground">저장됨</span>
          )}
        </div>

        <div className="memoji-editor-mode-actions">
          <Button
            variant={mode === 'wysiwyg' ? 'default' : 'outline'}
            size="sm"
            onClick={() => setMode('wysiwyg')}
            className="h-8 gap-1.5"
            title="즉시 편집"
          >
            <Edit3 className="h-3.5 w-3.5" />
            편집
          </Button>
          <Button
            variant={mode === 'source' ? 'default' : 'outline'}
            size="sm"
            onClick={() => setMode('source')}
            className="h-8 gap-1.5"
            title="Markdown 원문 보기"
          >
            <Code2 className="h-3.5 w-3.5" />
            원문
          </Button>
        </div>
      </div>

      {mode === 'wysiwyg' ? (
        <div className="flex-1 min-h-0 overflow-hidden">
          <MilkdownEditor
            key={currentPage.id}
            value={content}
            onChange={handleContentChange}
            placeholder="마크다운으로 작성해보세요. / 또는 상단 툴바에서 표를 넣을 수 있습니다."
          />
        </div>
      ) : (
        <div className="flex-1 min-h-0">
          <textarea
            value={content}
            onChange={(event) => handleContentChange(event.target.value)}
            className="w-full h-full resize-none border-none outline-none bg-transparent font-mono text-sm leading-6 p-6 custom-scrollbar"
            placeholder="Markdown 원문"
          />
        </div>
      )}
    </div>
  );
};
