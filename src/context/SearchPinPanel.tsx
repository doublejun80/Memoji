import { Search } from 'lucide-react';
import { useMemo, useState } from 'react';
import type { Page } from '../types';
import { searchPages } from '../utils/searchIndex';

interface SearchPinPanelProps {
  pages: Page[];
  onPageSelect?: (page: Page) => void;
}

export function SearchPinPanel({ pages, onPageSelect }: SearchPinPanelProps) {
  const [query, setQuery] = useState('');
  const results = useMemo(() => searchPages(pages, query, 'all', 20), [pages, query]);
  return (
    <div className="context-search-panel">
      <label>
        <Search aria-hidden="true" />
        <span className="sr-only">고정 검색</span>
        <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="고정 검색…" />
      </label>
      {query.trim() && results.length === 0 ? <div className="context-empty">검색 결과가 없습니다.</div> : null}
      {results.map((result) => (
        <button type="button" className="context-row" key={result.page.id} onClick={() => onPageSelect?.(result.page)}>
          <strong>{result.page.title}</strong>
          <span>{result.matchedContent}</span>
        </button>
      ))}
    </div>
  );
}
