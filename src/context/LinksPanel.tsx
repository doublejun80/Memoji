import { Link2, Unlink } from 'lucide-react';
import type { Page } from '../types';

interface LinksPanelProps {
  page: Page | null;
  pages: Page[];
  onPageSelect?: (page: Page) => void;
}

export function LinksPanel({ page, pages, onPageSelect }: LinksPanelProps) {
  if (!page) return <div className="context-empty" role="status">선택한 문서가 없습니다.</div>;
  const marker = `[[${page.title}]]`;
  const backlinks = pages.filter((candidate) => candidate.id !== page.id && candidate.content.includes(marker));
  return (
    <div className="context-panel-stack">
      <section className="context-section">
        <h3><Link2 aria-hidden="true" /> 백링크 <span>{backlinks.length}</span></h3>
        {backlinks.length > 0 ? backlinks.map((candidate) => (
          <button type="button" className="context-row" key={candidate.id} onClick={() => onPageSelect?.(candidate)}>
            {candidate.title}
          </button>
        )) : <div className="context-empty context-empty-compact"><Unlink aria-hidden="true" /> 이 문서를 참조하는 링크가 없습니다.</div>}
      </section>
      <section className="context-section">
        <h3>연결 상태</h3>
        <p className="context-note">링크 인덱스는 로컬 저장소에서 계산되며 외부로 전송되지 않습니다.</p>
      </section>
    </div>
  );
}
