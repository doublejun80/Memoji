import { invoke } from '@tauri-apps/api/core';

export interface PageSummaryDto {
  id: string;
  title: string;
  icon: string;
  parentId?: string | null;
  projectParentId?: string | null;
  projectIndex: boolean;
  dateKey?: string | null;
  createdAt: string;
  updatedAt: string;
  type: 'page' | 'folder';
  tags: string[];
  order: number;
  revision: number;
  deletedAt?: string | null;
}

export interface PageBodyDto {
  pageId: string;
  bodyMarkdown: string;
  revision: number;
}

export interface SavePageV2Dto extends PageSummaryDto {
  bodyMarkdown: string;
  baseRevision: number;
  source: string;
}

export interface SavePageV2Result {
  summary: PageSummaryDto;
  body: PageBodyDto;
}

export interface PageRevisionDto {
  id: number;
  pageId: string;
  revision: number;
  bodyMarkdown: string;
  createdAt: string;
  source: string;
}

export interface PageApi {
  listSummaries(): Promise<PageSummaryDto[]>;
  getBody(pageId: string): Promise<PageBodyDto>;
  save(request: SavePageV2Dto): Promise<SavePageV2Result>;
  trash(pageId: string): Promise<void>;
  restore(pageId: string): Promise<void>;
  listRevisions(pageId: string): Promise<PageRevisionDto[]>;
  restoreRevision(pageId: string, revision: number, baseRevision: number): Promise<PageBodyDto>;
}

export const tauriPageApi: PageApi = {
  listSummaries: () => invoke('list_page_summaries'),
  getBody: (pageId) => invoke('get_page_body', { pageId }),
  save: (request) => invoke('save_page_v2', { request }),
  trash: (pageId) => invoke('trash_page', { pageId }),
  restore: (pageId) => invoke('restore_page', { pageId }),
  listRevisions: (pageId) => invoke('list_page_revisions', { pageId }),
  restoreRevision: (pageId, revision, baseRevision) => invoke('restore_page_revision', {
    pageId,
    revision,
    baseRevision,
  }),
};

