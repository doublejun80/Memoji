import { CalendarDays, FolderKanban, Plus, Tags } from 'lucide-react';
import type { Page } from '../types';
import { getPageDateKey, isProjectIndexPage } from '../utils/pageModel';

export function MetadataStrip({ page }: { page: Page }) {
  const dateKey = getPageDateKey(page);
  return (
    <div className="metadata-strip" aria-label="문서 속성">
      <span className="metadata-chip"><FolderKanban aria-hidden="true" /> 문서</span>
      {isProjectIndexPage(page) ? <span className="metadata-chip">프로젝트</span> : null}
      {dateKey ? <span className="metadata-chip"><CalendarDays aria-hidden="true" /> {dateKey}</span> : null}
      {page.tags.map((tag) => (
        <span className="metadata-chip" key={tag}><Tags aria-hidden="true" /> #{tag}</span>
      ))}
      <button type="button" className="metadata-add" aria-label="속성 추가" title="V3 속성 저장소 연결 후 사용할 수 있습니다">
        <Plus aria-hidden="true" /> 속성
      </button>
    </div>
  );
}
