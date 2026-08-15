import { ListChecks, Sparkles, Wand2 } from 'lucide-react';

export interface EditorSelection {
  pageId: string;
  baseRevision: number;
  text: string;
  start: number;
  end: number;
  textHash: string;
}

export function SelectionAiToolbar({ selection }: { selection: EditorSelection | null }) {
  if (!selection) return null;

  const requestAction = (action: 'rewrite' | 'summarize' | 'tasks') => {
    window.dispatchEvent(new CustomEvent('memoji:selection-ai', {
      detail: { action, selection },
    }));
  };

  return (
    <div className="selection-ai-toolbar" role="toolbar" aria-label="선택 영역 AI 도구">
      <span>{selection.text.length}자 선택</span>
      <button type="button" onClick={() => requestAction('rewrite')}><Wand2 aria-hidden="true" /> 다듬기</button>
      <button type="button" onClick={() => requestAction('summarize')}><Sparkles aria-hidden="true" /> 요약</button>
      <button type="button" onClick={() => requestAction('tasks')}><ListChecks aria-hidden="true" /> 작업 추출</button>
    </div>
  );
}
