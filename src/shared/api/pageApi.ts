import { invoke } from '@tauri-apps/api/core';
import { TAURI_COMMANDS } from './tauriCommands';

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
  listTrashedSummaries(): Promise<PageSummaryDto[]>;
  getBody(pageId: string): Promise<PageBodyDto>;
  save(request: SavePageV2Dto): Promise<SavePageV2Result>;
  trash(pageId: string): Promise<void>;
  restore(pageId: string): Promise<void>;
  listRevisions(pageId: string): Promise<PageRevisionDto[]>;
  restoreRevision(pageId: string, revision: number, baseRevision: number): Promise<PageBodyDto>;
}

export const tauriPageApi: PageApi = {
  listSummaries: () => invoke(TAURI_COMMANDS.listPageSummaries),
  listTrashedSummaries: () => invoke(TAURI_COMMANDS.listTrashedPageSummaries),
  getBody: (pageId) => invoke(TAURI_COMMANDS.getPageBody, { pageId }),
  save: (request) => invoke(TAURI_COMMANDS.savePageV2, { request }),
  trash: (pageId) => invoke(TAURI_COMMANDS.trashPage, { pageId }),
  restore: (pageId) => invoke(TAURI_COMMANDS.restorePage, { pageId }),
  listRevisions: (pageId) => invoke(TAURI_COMMANDS.listPageRevisions, { pageId }),
  restoreRevision: (pageId, revision, baseRevision) => invoke(TAURI_COMMANDS.restorePageRevision, {
    pageId,
    revision,
    baseRevision,
  }),
};
