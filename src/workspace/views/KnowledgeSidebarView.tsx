import { Network } from 'lucide-react';
import type { Page } from '../../types';

interface KnowledgeSidebarViewProps {
  pages: Page[];
  onPageSelect: (page: Page, source?: 'daily' | 'project' | 'global') => void;
}

export function KnowledgeSidebarView({ pages, onPageSelect }: KnowledgeSidebarViewProps) {
  const linkedCandidates = pages
    .filter((page) => page.type === 'page' && page.tags.length > 0)
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
    .slice(0, 8);

  return (
    <div className="workspace-sidebar-scroll" data-sidebar-view="knowledge">
      <header className="workspace-sidebar-view-header"><h2>지식</h2></header>
      {linkedCandidates.length > 0 ? (
        <div className="workspace-sidebar-list workspace-sidebar-list-padded">
          {linkedCandidates.map((page) => (
            <button type="button" key={page.id} className="workspace-sidebar-row" onClick={() => onPageSelect(page, 'global')}>
              <Network aria-hidden="true" />
              <span>{page.title}</span>
              <small>{page.tags.slice(0, 2).map((tag) => `#${tag}`).join(' ')}</small>
            </button>
          ))}
        </div>
      ) : (
        <div className="workspace-sidebar-zero-state">
          <Network aria-hidden="true" />
          <strong>연결된 지식이 없습니다</strong>
          <p>문서에 태그와 링크를 추가하면 지식 인덱스가 구성됩니다.</p>
        </div>
      )}
    </div>
  );
}
