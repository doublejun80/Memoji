import { CalendarDays, FileType2, Tags } from 'lucide-react';
import type { Page } from '../types';
import { getPageDateKey } from '../utils/pageModel';

export function PropertiesPanel({ page }: { page: Page | null }) {
  if (!page) return <div className="context-empty" role="status">선택한 문서가 없습니다.</div>;
  return (
    <dl className="properties-list">
      <div><dt><FileType2 aria-hidden="true" /> 유형</dt><dd>{page.type === 'folder' ? '폴더' : '문서'}</dd></div>
      <div><dt><CalendarDays aria-hidden="true" /> 날짜</dt><dd>{getPageDateKey(page) ?? '없음'}</dd></div>
      <div><dt><Tags aria-hidden="true" /> 태그</dt><dd>{page.tags.length ? page.tags.map((tag) => `#${tag}`).join(' ') : '없음'}</dd></div>
      <div><dt>수정</dt><dd>{new Date(page.updatedAt).toLocaleString('ko-KR')}</dd></div>
      <div><dt>ID</dt><dd><code>{page.id}</code></dd></div>
    </dl>
  );
}
