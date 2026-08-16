import { invoke } from '@tauri-apps/api/core';
import { TAURI_COMMANDS } from './tauriCommands';

export interface SearchPageSummary {
  id: string;
  title: string;
  excerpt: string;
  tags: string[];
  updatedAt: string;
  pageType?: 'page' | 'folder';
  projectIndex?: boolean;
  projectId?: string | null;
  projectTitle?: string | null;
  dueDate?: string | null;
  status?: string | null;
}

export interface SearchTaskSummary {
  id: string;
  title: string;
  status: 'open' | 'done' | 'cancelled';
  pageId: string;
  tags: string[];
  projectId?: string | null;
  projectTitle?: string | null;
  dueDate?: string | null;
  startDate?: string | null;
  assignee?: string | null;
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
  reindex?(): Promise<{ pagesIndexed: number; elapsedMs: number }>;
}

export const tauriIndexedSearchApi: IndexedSearchApi = {
  search: (query, filters = {}, limit = 30) => invoke(TAURI_COMMANDS.searchWorkspace, {
    request: { query, filters, limit },
  }),
  getPageAnchors: (pageId) => invoke(TAURI_COMMANDS.getPageAnchors, { pageId }),
  getPageLinks: (pageId) => invoke(TAURI_COMMANDS.getPageLinks, { pageId }),
  reindex: () => invoke(TAURI_COMMANDS.reindexWorkspace),
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
