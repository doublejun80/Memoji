import { useEffect, useState } from 'react';
import { FileSearch, RefreshCw, Search, Tag } from 'lucide-react';
import { tauriIndexedSearchApi, type IndexedSearchApi, type IndexedSearchResult } from '../shared/api/searchApi';
import './workspace-tools.css';

interface SearchWorkspaceProps {
  onPageOpen: (pageId: string) => void;
  searchApi?: IndexedSearchApi;
}

export function SearchWorkspace({ onPageOpen, searchApi = tauriIndexedSearchApi }: SearchWorkspaceProps) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<IndexedSearchResult[]>([]);
  const [state, setState] = useState<'idle' | 'loading' | 'error'>('idle');
  const [reindexMessage, setReindexMessage] = useState<string | null>(null);
  const [reindexing, setReindexing] = useState(false);

  const reindex = async () => {
    if (!searchApi.reindex || reindexing) return;
    setReindexing(true);
    setReindexMessage(null);
    try {
      const report = await searchApi.reindex();
      setReindexMessage(`${report.pagesIndexed}개 문서 재색인 완료 · ${report.elapsedMs}ms`);
    } catch {
      setReindexMessage('검색 인덱스 재구성 실패');
    } finally {
      setReindexing(false);
    }
  };

  useEffect(() => {
    const term = query.trim();
    if (!term) {
      setResults([]);
      setState('idle');
      return;
    }
    let active = true;
    setState('loading');
    const timer = window.setTimeout(() => {
      void searchApi.search(term, {}, 50).then((nextResults) => {
        if (!active) return;
        setResults(nextResults);
        setState('idle');
      }).catch(() => {
        if (active) setState('error');
      });
    }, 160);
    return () => { active = false; window.clearTimeout(timer); };
  }, [query, searchApi]);

  return (
    <section className="workspace-tool workspace-search" role="region" aria-label="검색 공간">
      <header className="workspace-tool-header">
        <div><FileSearch aria-hidden="true" /><div><h2>전체 검색</h2><p>제목·태그·본문의 SQLite FTS 인덱스를 검색합니다.</p></div></div>
        {searchApi.reindex ? <button type="button" className="workspace-tool-action" aria-label="검색 인덱스 재구성" disabled={reindexing} onClick={() => void reindex()}><RefreshCw aria-hidden="true" /> {reindexing ? '재구성 중…' : '인덱스 재구성'}</button> : null}
      </header>
      <label className="workspace-search-box">
        <Search aria-hidden="true" />
        <input autoFocus type="search" aria-label="워크스페이스 검색" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="문서, 태그, 본문 검색…" />
        <kbd>Esc</kbd>
      </label>
      <div className="workspace-search-summary" aria-live="polite">
        {reindexMessage ?? (state === 'loading' ? '검색 중…' : query.trim() ? `${results.length}개 결과` : '검색어를 입력하세요')}
      </div>
      {state === 'error' && <p role="alert">검색 인덱스를 불러오지 못했습니다.</p>}
      <div className="workspace-search-results">
        {results.map((result) => (
          <button type="button" key={`${result.pageId}-${result.field}-${result.anchor ?? ''}`} onClick={() => onPageOpen(result.pageId)} aria-label={`${result.title} 열기`}>
            <FileSearch aria-hidden="true" />
            <span><strong>{result.title}</strong><small>{result.snippet}</small>{result.tags.length ? <em><Tag aria-hidden="true" /> {result.tags.map((tag) => `#${tag}`).join(' ')}</em> : null}</span>
            <code>{result.field}</code>
          </button>
        ))}
      </div>
    </section>
  );
}
