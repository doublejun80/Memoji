import { Page } from '../types';
import { normalizePage } from './pageModel';
import { tauriPageApi, type PageBodyDto, type PageSummaryDto } from '../shared/api/pageApi';
import { invoke as tauriInvoke } from '@tauri-apps/api/core';

export interface DatabaseImportSummary {
  imported: number;
  duplicated: number;
  skipped: number;
  backup_path: string;
  backup_sha256: string;
  backup_bytes: number;
}

export interface PagesZipExportSummary {
  exported: number;
  zip_path: string;
}

// Dynamic import for Tauri API to handle environments where it's not available
let invoke: typeof tauriInvoke | null = tauriInvoke;

const initTauri = async () => {
  try {
    // Check if we're in a Tauri environment
    if (typeof window !== 'undefined' && 
        ((window as any).__TAURI__ || (window as any).__TAURI_INTERNALS__)) {
      return true;
    }
  } catch (error) {
    // Web preview mode uses localStorage instead of Tauri commands.
  }
  return false;
};

class TauriStorage {
  private isInitialized = false;
  private isTauriAvailable = false;
  private initPromise: Promise<void> | null = null;
  private tauriInitializationError: unknown = null;
  private revisionCache = new Map<string, number>();
  private bodyCache = new Map<string, PageBodyDto>();

  async init() {
    if (this.isInitialized) return;
    if (this.initPromise) {
      await this.initPromise;
      return;
    }

    this.initPromise = this.initialize();
    try {
      await this.initPromise;
    } finally {
      this.initPromise = null;
    }
  }

  private async initialize() {
    this.isTauriAvailable = await initTauri();
    this.tauriInitializationError = null;
    
    if (this.isTauriAvailable && invoke) {
      try {
        await invoke('init_database');
        this.isInitialized = true;
        await this.migrateLocalStoragePagesToTauri();
      } catch (error) {
        this.tauriInitializationError = error;
        this.isInitialized = false;
        throw this.makeDesktopStorageError('데이터베이스 초기화', error);
      }
    } else {
      this.isInitialized = false;
      this.isTauriAvailable = false;
    }
  }

  private makeDesktopStorageError(operation: string, error: unknown): Error {
    const detail = error instanceof Error ? error.message : String(error);
    return new Error(`${operation}에 실패했습니다. 데스크톱 앱에서는 memoji.db 저장소가 열리지 않으면 localStorage로 대체 저장하지 않습니다. 원인: ${detail}`);
  }

  private assertDesktopStorageReady(operation: string): void {
    if (this.isTauriAvailable && (!this.isInitialized || !invoke)) {
      throw this.makeDesktopStorageError(operation, this.tauriInitializationError ?? 'Tauri 저장소가 준비되지 않았습니다.');
    }
  }

  generateId(): string {
    return Date.now().toString(36) + Math.random().toString(36).substr(2);
  }

  async getPages(): Promise<Page[]> {
    await this.init();

    if (this.isInitialized && this.isTauriAvailable && invoke) {
      try {
        let summaries: PageSummaryDto[];
        try {
          summaries = await tauriPageApi.listSummaries();
        } catch (error) {
          if (!this.isUnknownCommand(error)) throw error;
          const legacyPages = await invoke('get_pages') as any[];
          return this.migratePages(legacyPages.map((page) => ({
            ...page,
            content: page.content,
            bodyLoaded: true,
            revision: 0,
          })));
        }

        const pages = summaries.map((summary) => {
          this.revisionCache.set(summary.id, summary.revision);
          return normalizePage({ ...summary, content: '', bodyLoaded: summary.type === 'folder' });
        });
        return this.migratePages(pages);
      } catch (error) {
        console.error('❌ Tauri에서 페이지 로드 실패:', error);
        throw this.makeDesktopStorageError('페이지 로드', error);
      }
    }

    this.assertDesktopStorageReady('페이지 로드');

    // Fallback to localStorage
    return this.getLocalStoragePages();
  }

  // 기존 페이지를 새로운 구조로 마이그레이션
  private migratePages(pages: any[]): Page[] {
    return pages.map((page: any, index: number) => normalizePage(page, index));
  }

  async savePage(page: Page): Promise<number> {
    await this.init();

    if (this.isInitialized && this.isTauriAvailable && invoke) {
      try {
        const normalizedPage = normalizePage(page);
        const baseRevision = this.revisionCache.get(page.id) ?? normalizedPage.revision ?? 0;
        try {
          const result = await tauriPageApi.save({
            id: normalizedPage.id,
            title: normalizedPage.title,
            icon: normalizedPage.icon,
            parentId: normalizedPage.parentId,
            projectParentId: normalizedPage.projectParentId,
            projectIndex: Boolean(normalizedPage.projectIndex),
            dateKey: normalizedPage.dateKey,
            bodyMarkdown: normalizedPage.content,
            createdAt: normalizedPage.createdAt,
            updatedAt: normalizedPage.updatedAt,
            type: normalizedPage.type,
            tags: normalizedPage.tags,
            order: normalizedPage.order,
            revision: baseRevision,
            baseRevision,
            source: 'user',
          });
          this.revisionCache.set(page.id, result.body.revision);
          this.rememberBody(result.body);
          return result.body.revision;
        } catch (error) {
          if (!this.isUnknownCommand(error)) throw error;
          await invoke('save_page', { page: this.toTauriPage(page) });
          return baseRevision;
        }
      } catch (error) {
        console.error('❌ Tauri 저장 실패:', error);
        throw this.makeDesktopStorageError('페이지 저장', error);
      }
    }

    this.assertDesktopStorageReady('페이지 저장');

    // Fallback to localStorage
    const normalizedPage = normalizePage(page);
    const pages = await this.getLocalStoragePages();
    const existingIndex = pages.findIndex(p => p.id === normalizedPage.id);

    if (existingIndex >= 0) {
      pages[existingIndex] = normalizedPage;
    } else {
      pages.push(normalizedPage);
    }

    localStorage.setItem('blocknote-pages', JSON.stringify(pages));
    return normalizedPage.revision ?? 0;
  }

  async getPageBody(pageId: string): Promise<PageBodyDto> {
    await this.init();
    const cached = this.bodyCache.get(pageId);
    if (cached) return cached;
    if (this.isInitialized && this.isTauriAvailable && invoke) {
      try {
        const body = await tauriPageApi.getBody(pageId);
        this.revisionCache.set(pageId, body.revision);
        this.rememberBody(body);
        return body;
      } catch (error) {
        if (!this.isUnknownCommand(error)) {
          throw this.makeDesktopStorageError('페이지 본문 로드', error);
        }
        const legacyPages = await invoke('get_pages') as any[];
        const page = legacyPages.find((candidate) => candidate.id === pageId);
        if (!page) throw new Error(`페이지를 찾을 수 없습니다: ${pageId}`);
        return { pageId, bodyMarkdown: page.content || '', revision: 0 };
      }
    }
    const page = this.getLocalStoragePages().find((candidate) => candidate.id === pageId);
    if (!page) throw new Error(`페이지를 찾을 수 없습니다: ${pageId}`);
    return { pageId, bodyMarkdown: page.content, revision: page.revision ?? 0 };
  }

  private rememberBody(body: PageBodyDto): void {
    this.bodyCache.delete(body.pageId);
    this.bodyCache.set(body.pageId, body);
    while (this.bodyCache.size > 12) {
      const oldest = this.bodyCache.keys().next().value as string | undefined;
      if (!oldest) break;
      this.bodyCache.delete(oldest);
    }
  }

  syncPageBody(body: PageBodyDto): void {
    this.revisionCache.set(body.pageId, body.revision);
    this.rememberBody(body);
  }

  private isUnknownCommand(error: unknown): boolean {
    const message = String(error).toLowerCase();
    return message.includes('unknown command') || message.includes('command not found');
  }

  private getLocalStoragePages(): Page[] {
    const saved = localStorage.getItem('blocknote-pages');
    if (!saved) return [];

    try {
      const parsed = JSON.parse(saved);
      return Array.isArray(parsed) ? this.migratePages(parsed) : [];
    } catch (error) {
      console.error('Failed to parse saved localStorage pages:', error);
      return [];
    }
  }

  private toTauriPage(page: Page) {
    const normalizedPage = normalizePage(page);
    return {
      id: normalizedPage.id,
      title: normalizedPage.title,
      icon: normalizedPage.icon,
      parent_id: normalizedPage.projectParentId,
      project_parent_id: normalizedPage.projectParentId,
      project_index: normalizedPage.projectIndex,
      date_key: normalizedPage.dateKey,
      content: normalizedPage.content,
      created_at: normalizedPage.createdAt,
      updated_at: normalizedPage.updatedAt,
      type: normalizedPage.type,
      tags: normalizedPage.tags,
      order: normalizedPage.order
    };
  }

  private async migrateLocalStoragePagesToTauri(): Promise<void> {
    if (!this.isInitialized || !this.isTauriAvailable || !invoke) return;

    const legacyRawPages = localStorage.getItem('blocknote-pages');
    if (!legacyRawPages) return;

    const migrationMarkerKey = 'memoji-localstorage-pages-migrated-to-sqlite';
    if (localStorage.getItem(migrationMarkerKey)) return;

    const legacyPages = this.getLocalStoragePages();
    if (legacyPages.length === 0) {
      localStorage.setItem(migrationMarkerKey, JSON.stringify({
        migratedAt: new Date().toISOString(),
        count: 0,
      }));
      return;
    }

    const existingPages = await invoke('get_pages') as any[];
    const existingIds = new Set(
      (Array.isArray(existingPages) ? existingPages : [])
        .map((page) => String(page?.id ?? ''))
        .filter(Boolean)
    );

    const backupKey = 'memoji-localstorage-pages-backup-before-sqlite';
    if (!localStorage.getItem(backupKey)) {
      localStorage.setItem(backupKey, legacyRawPages);
    }

    let migratedCount = 0;
    for (const page of legacyPages) {
      if (existingIds.has(page.id)) continue;
      await this.savePage(page);
      existingIds.add(page.id);
      migratedCount += 1;
    }

    localStorage.setItem(migrationMarkerKey, JSON.stringify({
      migratedAt: new Date().toISOString(),
      count: migratedCount,
      totalLegacyPages: legacyPages.length,
    }));
  }

  async deletePage(pageId: string): Promise<void> {
    await this.init();
    
    if (this.isInitialized && this.isTauriAvailable && invoke) {
      try {
        try {
          await tauriPageApi.trash(pageId);
        } catch (error) {
          if (!this.isUnknownCommand(error)) throw error;
          await invoke('delete_page', { pageId });
        }
        this.bodyCache.delete(pageId);
        this.revisionCache.delete(pageId);
        return;
      } catch (error) {
        console.error('Failed to delete page from Tauri:', error);
        throw this.makeDesktopStorageError('페이지 삭제', error);
      }
    }

    this.assertDesktopStorageReady('페이지 삭제');

    // Fallback to localStorage
    const pages = this.getLocalStoragePages();
    // Get all child page IDs recursively
    const pagesToDelete = this.getAllChildPageIds(pageId, pages);
    const filteredPages = pages.filter(page => !pagesToDelete.includes(page.id));
    localStorage.setItem('blocknote-pages', JSON.stringify(filteredPages));
  }

  private getAllChildPageIds(pageId: string, allPages: Page[]): string[] {
    const result: string[] = [];
    const visited = new Set<string>();

    const collect = (id: string) => {
      if (visited.has(id)) return;
      visited.add(id);
      result.push(id);
      allPages
        .filter(page => page.projectParentId === id || page.parentId === id)
        .forEach(child => collect(child.id));
    };

    collect(pageId);
    return result;
  }

  cleanupBlockData(): void {
    const legacyEntries = Object.keys(localStorage)
      .filter(key => key.startsWith('blocknote-blocks-') || key === 'blocknote-blocks')
      .map(key => [key, localStorage.getItem(key)] as const)
      .filter((entry): entry is readonly [string, string] => entry[1] !== null);

    if (legacyEntries.length === 0) return;

    const backupKey = 'memoji-legacy-blocknote-blocks-backup';
    if (!localStorage.getItem(backupKey)) {
      localStorage.setItem(backupKey, JSON.stringify({
        createdAt: new Date().toISOString(),
        entries: Object.fromEntries(legacyEntries),
      }));
    }
  }

  async getAppDataDir(): Promise<string | null> {
    if (this.isInitialized && this.isTauriAvailable && invoke) {
      try {
        return await invoke('get_app_data_dir') as string;
      } catch (error) {
        console.error('Failed to get app data dir:', error);
      }
    }
    return null;
  }

  async getAppTitle(): Promise<string | null> {
    await this.init();

    if (this.isInitialized && this.isTauriAvailable && invoke) {
      try {
        return await invoke('get_app_title') as string;
      } catch (error) {
        console.error('Failed to get app title from Tauri:', error);
        throw this.makeDesktopStorageError('앱 제목 로드', error);
      }
    }

    this.assertDesktopStorageReady('앱 제목 로드');

    // Fallback to localStorage
    return localStorage.getItem('app-title');
  }

  async saveAppTitle(title: string): Promise<void> {
    await this.init();

    if (this.isInitialized && this.isTauriAvailable && invoke) {
      try {
        await invoke('save_app_title', { title });
        return;
      } catch (error) {
        console.error('Failed to save app title to Tauri:', error);
        throw this.makeDesktopStorageError('앱 제목 저장', error);
      }
    }

    this.assertDesktopStorageReady('앱 제목 저장');

    // Fallback to localStorage
    localStorage.setItem('app-title', title);
  }

  async importDatabasePath(dbPath: string): Promise<DatabaseImportSummary> {
    await this.init();

    if (!this.isInitialized || !this.isTauriAvailable || !invoke) {
      throw new Error('DB 가져오기는 데스크톱 앱에서만 사용할 수 있습니다.');
    }

    const normalizedPath = dbPath.trim();
    if (!normalizedPath.toLowerCase().endsWith('.db')) {
      throw new Error('memoji.db 파일을 선택해주세요.');
    }
    return await invoke('import_memoji_database', { dbPath: normalizedPath }) as DatabaseImportSummary;
  }

  async exportPagesZip(): Promise<PagesZipExportSummary> {
    await this.init();

    if (!this.isInitialized || !this.isTauriAvailable || !invoke) {
      throw new Error('전체 페이지 ZIP 내보내기는 데스크톱 앱에서만 사용할 수 있습니다.');
    }

    return await invoke('export_pages_zip') as PagesZipExportSummary;
  }
}

export const tauriStorage = new TauriStorage();
