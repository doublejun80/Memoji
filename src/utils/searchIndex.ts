import { Page } from '../types';
import { stripMarkdownCode } from './markdownMetadata';

export type SearchFilter = 'all' | 'title' | 'content' | 'tags';

export interface SearchResult {
  page: Page;
  relevance: number;
  matchedContent: string;
  matchType: 'title' | 'content' | 'tag';
}

export interface HighlightPart {
  text: string;
  match: boolean;
}

const normalizeTerm = (value: string): string =>
  value.trim().replace(/^#/, '').toLowerCase();

export const getSearchTerms = (query: string): string[] =>
  Array.from(
    new Set(
      query
        .split(/\s+/)
        .map(normalizeTerm)
        .filter(Boolean)
    )
  );

export const removeInlineTags = (markdown: string): string =>
  stripMarkdownCode(markdown).replace(/#[\w가-힣\u4e00-\u9fff]+/g, ' ');

const snippetAround = (source: string, index: number, radius = 64): string => {
  const start = Math.max(0, index - radius);
  const end = Math.min(source.length, index + radius);
  const prefix = start > 0 ? '...' : '';
  const suffix = end < source.length ? '...' : '';
  return `${prefix}${source.slice(start, end).trim()}${suffix}`;
};

export const searchPages = (
  pages: Page[],
  query: string,
  filter: SearchFilter,
  limit = 20
): SearchResult[] => {
  const searchTerms = getSearchTerms(query);
  if (searchTerms.length === 0) return [];

  const results = pages.flatMap((page): SearchResult[] => {
    let relevance = 0;
    let matchedContent = '';
    let matchType: SearchResult['matchType'] = 'content';

    if (filter === 'all' || filter === 'title') {
      const titleLower = page.title.toLowerCase();
      const titleMatches = searchTerms.filter((term) => titleLower.includes(term)).length;
      if (titleMatches > 0) {
        relevance += titleMatches * 3;
        matchedContent = page.title;
        matchType = 'title';
      }
    }

    if (filter === 'all' || filter === 'content') {
      const contentWithoutTags = removeInlineTags(page.content);
      const contentLower = contentWithoutTags.toLowerCase();
      const contentMatches = searchTerms.filter((term) => contentLower.includes(term)).length;

      if (contentMatches > 0) {
        relevance += contentMatches;
        if (!matchedContent) {
          const firstMatch = searchTerms.find((term) => contentLower.includes(term));
          const index = firstMatch ? contentLower.indexOf(firstMatch) : 0;
          matchedContent = snippetAround(contentWithoutTags, index);
          matchType = 'content';
        }
      }
    }

    if (filter === 'all' || filter === 'tags') {
      const tagMatches = page.tags.filter((tag) =>
        searchTerms.some((term) => normalizeTerm(tag).includes(term))
      ).length;

      if (tagMatches > 0) {
        relevance += tagMatches * 2;
        if (!matchedContent) {
          matchedContent = page.tags.map((tag) => `#${tag.replace(/^#/, '')}`).join(', ');
          matchType = 'tag';
        }
      }
    }

    if (relevance <= 0) return [];

    return [{
      page,
      relevance,
      matchedContent: matchedContent || snippetAround(removeInlineTags(page.content), 0),
      matchType,
    }];
  });

  return results.sort((a, b) => b.relevance - a.relevance).slice(0, limit);
};

export const splitHighlightedText = (text: string, query: string): HighlightPart[] => {
  const searchTerms = getSearchTerms(query);
  if (searchTerms.length === 0) return [{ text, match: false }];

  const lowerText = text.toLowerCase();
  const ranges: Array<[number, number]> = [];

  searchTerms.forEach((term) => {
    let cursor = 0;
    while (cursor < lowerText.length) {
      const index = lowerText.indexOf(term, cursor);
      if (index === -1) break;
      ranges.push([index, index + term.length]);
      cursor = index + term.length;
    }
  });

  if (ranges.length === 0) return [{ text, match: false }];

  const merged = ranges
    .sort((a, b) => a[0] - b[0])
    .reduce<Array<[number, number]>>((acc, range) => {
      const last = acc[acc.length - 1];
      if (!last || range[0] > last[1]) {
        acc.push(range);
      } else {
        last[1] = Math.max(last[1], range[1]);
      }
      return acc;
    }, []);

  const parts: HighlightPart[] = [];
  let cursor = 0;

  merged.forEach(([start, end]) => {
    if (start > cursor) {
      parts.push({ text: text.slice(cursor, start), match: false });
    }
    parts.push({ text: text.slice(start, end), match: true });
    cursor = end;
  });

  if (cursor < text.length) {
    parts.push({ text: text.slice(cursor), match: false });
  }

  return parts;
};
