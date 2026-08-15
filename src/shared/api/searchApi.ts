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
