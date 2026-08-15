import type { Page } from '../types';

export interface OutlineHeading {
  id: string;
  level: number;
  text: string;
  line: number;
}

function slugify(value: string): string {
  return value
    .normalize('NFKC')
    .toLocaleLowerCase('ko-KR')
    .replace(/[`*_~[\]()]/g, '')
    .replace(/[^\p{Letter}\p{Number}]+/gu, '-')
    .replace(/^-|-$/g, '') || 'heading';
}

export function parseOutline(markdown: string): OutlineHeading[] {
  const seen = new Map<string, number>();
  return markdown.split(/\r?\n/).flatMap((line, index) => {
    const match = line.match(/^(#{1,6})\s+(.+?)\s*#*$/);
    if (!match) return [];
    const base = slugify(match[2]);
    const occurrence = seen.get(base) ?? 0;
    seen.set(base, occurrence + 1);
    return [{
      id: occurrence === 0 ? base : `${base}-${occurrence + 1}`,
      level: match[1].length,
      text: match[2].trim(),
      line: index + 1,
    }];
  });
}

export function OutlinePanel({ page }: { page: Page | null }) {
  const headings = parseOutline(page?.content ?? '');
  if (!page) return <div className="context-empty" role="status">선택한 문서가 없습니다.</div>;
  if (headings.length === 0) return <div className="context-empty" role="status">이 문서에는 제목이 없습니다.</div>;

  return (
    <nav className="outline-list" aria-label="문서 개요">
      {headings.map((heading) => (
        <button
          type="button"
          key={`${heading.id}-${heading.line}`}
          data-heading-id={heading.id}
          style={{ paddingLeft: `${10 + (heading.level - 1) * 12}px` }}
          onClick={() => window.dispatchEvent(new CustomEvent('memoji:outline-navigate', { detail: heading }))}
        >
          <span className="outline-level" aria-hidden="true">H{heading.level}</span>
          <span>{heading.text}</span>
        </button>
      ))}
    </nav>
  );
}
