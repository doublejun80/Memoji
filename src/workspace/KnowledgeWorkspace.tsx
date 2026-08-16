import { useCallback, useMemo, useState } from 'react';
import { FileText, Network, RotateCcw, Tags, Trash2 } from 'lucide-react';
import { tauriPageApi, type PageApi, type PageSummaryDto } from '../shared/api/pageApi';
import type { Page } from '../types';
import './workspace-tools.css';

interface KnowledgeWorkspaceProps {
  pages: Page[];
  onPageSelect: (page: Page, source?: 'daily' | 'project' | 'global') => void;
  onRestored?: () => void | Promise<void>;
  pageApi?: PageApi;
}

type KnowledgeTab = 'index' | 'trash';

export function KnowledgeWorkspace({
  pages,
  onPageSelect,
  onRestored,
  pageApi = tauriPageApi,
}: KnowledgeWorkspaceProps) {
  const [tab, setTab] = useState<KnowledgeTab>('index');
  const [trashed, setTrashed] = useState<PageSummaryDto[]>([]);
  const [trashState, setTrashState] = useState<'idle' | 'loading' | 'error'>('idle');

  const tags = useMemo(() => {
    const counts = new Map<string, number>();
    pages.forEach((page) => page.tags.forEach((tag) => counts.set(tag, (counts.get(tag) ?? 0) + 1)));
    return [...counts.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], 'ko'));
  }, [pages]);

  const recentPages = useMemo(() => pages
    .filter((page) => page.type === 'page')
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
    .slice(0, 30), [pages]);

  const loadTrash = useCallback(async () => {
    setTrashState('loading');
    try {
      setTrashed(await pageApi.listTrashedSummaries());
      setTrashState('idle');
    } catch {
      setTrashState('error');
    }
  }, [pageApi]);

  const selectTab = (nextTab: KnowledgeTab) => {
    setTab(nextTab);
    if (nextTab === 'trash') void loadTrash();
  };

  const restore = async (pageId: string) => {
    await pageApi.restore(pageId);
    setTrashed((current) => current.filter((page) => page.id !== pageId));
    await onRestored?.();
  };

  return (
    <section className="workspace-tool" role="region" aria-label="지식 공간">
      <header className="workspace-tool-header">
        <div><Network aria-hidden="true" /><div><h2>지식</h2><p>{pages.length}개 항목 · {tags.length}개 태그</p></div></div>
        <div role="tablist" aria-label="지식 보기">
          <button type="button" role="tab" aria-selected={tab === 'index'} onClick={() => selectTab('index')}><Tags aria-hidden="true" /> 인덱스</button>
          <button type="button" role="tab" aria-selected={tab === 'trash'} onClick={() => selectTab('trash')}><Trash2 aria-hidden="true" /> 휴지통{trashed.length ? ` ${trashed.length}` : ''}</button>
        </div>
      </header>

      {tab === 'index' ? (
        <div className="workspace-tool-grid">
          <section aria-label="태그 인덱스" className="workspace-tool-card">
            <h3>태그 인덱스</h3>
            {tags.length ? <div className="knowledge-tags">{tags.map(([tag, count]) => <span key={tag}>#{tag}<small>{count}</small></span>)}</div> : <p className="workspace-tool-empty">문서에 #태그를 추가하면 여기에 모입니다.</p>}
          </section>
          <section aria-label="최근 지식 문서" className="workspace-tool-card workspace-tool-list-card">
            <h3>최근 지식 문서</h3>
            {recentPages.length ? recentPages.map((page) => (
              <button type="button" key={page.id} onClick={() => onPageSelect(page, 'global')}>
                <FileText aria-hidden="true" /><span><strong>{page.title}</strong><small>{page.tags.slice(0, 3).map((tag) => `#${tag}`).join(' ') || '태그 없음'}</small></span><time>{page.updatedAt.slice(0, 10)}</time>
              </button>
            )) : <p className="workspace-tool-empty">지식 문서가 없습니다.</p>}
          </section>
        </div>
      ) : (
        <section className="workspace-tool-card workspace-tool-list-card workspace-trash-list" aria-label="삭제된 문서">
          <div className="workspace-tool-section-title"><h3>삭제된 문서</h3><button type="button" onClick={() => void loadTrash()}><RotateCcw aria-hidden="true" /> 새로고침</button></div>
          {trashState === 'loading' && <p role="status">휴지통을 불러오는 중…</p>}
          {trashState === 'error' && <p role="alert">휴지통을 불러오지 못했습니다.</p>}
          {trashState === 'idle' && !trashed.length && <p className="workspace-tool-empty">휴지통이 비어 있습니다.</p>}
          {trashed.map((page) => (
            <div className="workspace-trash-row" key={page.id}>
              <FileText aria-hidden="true" /><span><strong>{page.title}</strong><small>삭제 {page.deletedAt?.slice(0, 10)} · r{page.revision}</small></span>
              <button type="button" aria-label={`${page.title} 복원`} onClick={() => void restore(page.id)}><RotateCcw aria-hidden="true" /> 복원</button>
            </div>
          ))}
        </section>
      )}
    </section>
  );
}
