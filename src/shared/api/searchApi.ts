export interface SearchPageSummary {
  id: string;
  title: string;
  excerpt: string;
  tags: string[];
  updatedAt: string;
}

export interface SearchTaskSummary {
  id: string;
  title: string;
  status: 'open' | 'done' | 'cancelled';
  pageId: string;
  tags: string[];
}

export interface WorkspaceSearchSnapshot {
  pages: SearchPageSummary[];
  tasks: SearchTaskSummary[];
  recentPageIds?: string[];
}

export interface WorkspaceSearchApi {
  getSnapshot(): Promise<WorkspaceSearchSnapshot>;
}

export interface SearchFilters {
  tag?: string;
  pageType?: 'page' | 'folder';
}

export interface IndexedSearchResult {
  pageId: string;
  title: string;
  tags: string[];
  updatedAt: string;
  field: 'title' | 'tags' | 'body';
  snippet: string;
  score: number;
  anchor?: string | null;
}

export interface IndexedAnchor {
  slug: string;
  heading: string;
  level: number;
  line: number;
}

export interface IndexedPageLink {
  direction: 'incoming' | 'outgoing';
  pageId?: string | null;
  pageTitle: string;
  targetAnchor?: string | null;
  resolved: boolean;
}

export interface IndexedSearchApi {
  search(query: string, filters?: SearchFilters, limit?: number): Promise<IndexedSearchResult[]>;
  getPageAnchors(pageId: string): Promise<IndexedAnchor[]>;
  getPageLinks(pageId: string): Promise<IndexedPageLink[]>;
}

export const tauriIndexedSearchApi: IndexedSearchApi = {
  search: (query, filters = {}, limit = 30) => invoke('search_workspace', {
    request: { query, filters, limit },
  }),
  getPageAnchors: (pageId) => invoke('get_page_anchors', { pageId }),
  getPageLinks: (pageId) => invoke('get_page_links', { pageId }),
};

/**
 * Temporary local adapter. Task 13 can replace this with SQLite FTS without
 * changing command-palette rendering or selection behavior.
 */
export function createInMemorySearchApi(
  readSnapshot: () => WorkspaceSearchSnapshot,
): WorkspaceSearchApi {
  return {
    async getSnapshot() {
      return readSnapshot();
    },
  };
}
import { invoke } from '@tauri-apps/api/core';
