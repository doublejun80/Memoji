import { CalendarClock, CalendarDays, CircleDot, FolderKanban, Plus, Tags } from 'lucide-react';
import type { Page } from '../types';
import { getPageDateKey, isProjectIndexPage } from '../utils/pageModel';

export function MetadataStrip({ page, onOpenProperties }: { page: Page; onOpenProperties?: () => void }) {
  const dateKey = getPageDateKey(page);
  return (
    <div className="metadata-strip" aria-label="문서 속성">
      <span className="metadata-chip"><FolderKanban aria-hidden="true" /> 문서</span>
      {isProjectIndexPage(page) ? <span className="metadata-chip">프로젝트</span> : null}
      {dateKey ? <span className="metadata-chip"><CalendarDays aria-hidden="true" /> {dateKey}</span> : null}
      {page.status ? <span className="metadata-chip"><CircleDot aria-hidden="true" /> {page.status}</span> : null}
      {page.dueDate ? <span className="metadata-chip"><CalendarClock aria-hidden="true" /> 마감 {page.dueDate}</span> : null}
      {page.tags.map((tag) => (
        <span className="metadata-chip" key={tag}><Tags aria-hidden="true" /> #{tag}</span>
      ))}
      <button type="button" className="metadata-add" aria-label="속성 추가 및 편집" title="문서 속성 열기" onClick={onOpenProperties}>
        <Plus aria-hidden="true" /> 속성
      </button>
    </div>
  );
}
