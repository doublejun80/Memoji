import { Link2, Unlink } from 'lucide-react';
import { useEffect, useState } from 'react';
import type { Page } from '../types';
import { tauriIndexedSearchApi, type IndexedPageLink } from '../shared/api/searchApi';

interface LinksPanelProps {
  page: Page | null;
  pages: Page[];
  onPageSelect?: (page: Page) => void;
}

export function LinksPanel({ page, pages, onPageSelect }: LinksPanelProps) {
  const [indexedLinks, setIndexedLinks] = useState<IndexedPageLink[] | null>(null);
  useEffect(() => {
    setIndexedLinks(null);
    if (!page || !(window as typeof window & { __TAURI_INTERNALS__?: unknown }).__TAURI_INTERNALS__) return;
    let disposed = false;
    void tauriIndexedSearchApi.getPageLinks(page.id).then((links) => {
      if (!disposed) setIndexedLinks(links);
    }).catch(() => undefined);
    return () => { disposed = true; };
  }, [page]);
  if (!page) return <div className="context-empty" role="status">선택한 문서가 없습니다.</div>;
  const marker = `[[${page.title}]]`;
  const fallbackBacklinks = pages.filter((candidate) => candidate.id !== page.id && candidate.content.includes(marker));
  const incoming = indexedLinks?.filter((link) => link.direction === 'incoming') ?? [];
  const outgoing = indexedLinks?.filter((link) => link.direction === 'outgoing') ?? [];
  const backlinks = indexedLinks
    ? incoming.flatMap((link) => {
      const candidate = pages.find((item) => item.id === link.pageId);
      return candidate ? [candidate] : [];
    })
    : fallbackBacklinks;
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
      {outgoing.length > 0 ? (
        <section className="context-section">
          <h3>나가는 링크 <span>{outgoing.length}</span></h3>
          {outgoing.map((link, index) => {
            const target = pages.find((candidate) => candidate.id === link.pageId);
            return (
              <button
                type="button"
                className="context-row"
                key={`${link.pageTitle}-${index}`}
                onClick={() => target && onPageSelect?.(target)}
                disabled={!target}
              >
                {link.pageTitle}{link.resolved ? '' : ' · 미해결'}
              </button>
            );
          })}
        </section>
      ) : null}
      <section className="context-section">
        <h3>연결 상태</h3>
        <p className="context-note">링크 인덱스는 로컬 저장소에서 계산되며 외부로 전송되지 않습니다.</p>
      </section>
    </div>
  );
}
