import { Page } from '../types';
import { normalizePage } from './pageModel';

export interface DatabaseImportSummary {
  imported: number;
  duplicated: number;
  skipped: number;
  backup_path: string;
}

export interface PagesZipExportSummary {
  exported: number;
  zip_path: string;
}

// Dynamic import for Tauri API to handle environments where it's not available
let invoke: any = null;

const initTauri = async () => {
  try {
    // Check if we're in a Tauri environment
    if (typeof window !== 'undefined' && 
        ((window as any).__TAURI__ || (window as any).__TAURI_INTERNALS__)) {
      const { invoke: tauriInvoke } = await import('@tauri-apps/api/core');
      invoke = tauriInvoke;
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
        const tauriPages = await invoke('get_pages') as any[];

        // Convert snake_case from Tauri to camelCase
        const pages = tauriPages.map(p => {
          return normalizePage({
            id: p.id,
            title: p.title,
            icon: p.icon,
            parentId: p.parent_id,
            projectParentId: p.project_parent_id ?? p.parent_id,
            projectIndex: p.project_index,
            dateKey: p.date_key,
            content: p.content,
            createdAt: p.created_at,
            updatedAt: p.updated_at,
            type: p.type,
            tags: p.tags,
            order: p.order
          });
        });

        const migratedPages = this.migratePages(pages);
        return migratedPages;
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

  async savePage(page: Page): Promise<void> {
    await this.init();

    if (this.isInitialized && this.isTauriAvailable && invoke) {
      try {
        await invoke('save_page', { page: this.toTauriPage(page) });
        return;
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
    if (Array.isArray(existingPages) && existingPages.length > 0) {
      return;
    }

    const backupKey = 'memoji-localstorage-pages-backup-before-sqlite';
    if (!localStorage.getItem(backupKey)) {
      localStorage.setItem(backupKey, legacyRawPages);
    }

    for (const page of legacyPages) {
      await invoke('save_page', { page: this.toTauriPage(page) });
    }

    localStorage.setItem(migrationMarkerKey, JSON.stringify({
      migratedAt: new Date().toISOString(),
      count: legacyPages.length,
    }));
  }

  async deletePage(pageId: string): Promise<void> {
    await this.init();
    
    if (this.isInitialized && this.isTauriAvailable && invoke) {
      try {
        await invoke('delete_page', { pageId });
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

  async importDatabaseFile(file: File): Promise<DatabaseImportSummary> {
    await this.init();

    if (!this.isInitialized || !this.isTauriAvailable || !invoke) {
      throw new Error('DB 가져오기는 데스크톱 앱에서만 사용할 수 있습니다.');
    }

    if (!file.name.toLowerCase().endsWith('.db')) {
      throw new Error('memoji.db 파일을 선택해주세요.');
    }

    const maxImportBytes = 256 * 1024 * 1024;
    if (file.size > maxImportBytes) {
      throw new Error('DB 파일이 너무 큽니다. data 폴더에서 직접 백업 후 교체해주세요.');
    }

    const buffer = await file.arrayBuffer();
    const bytes = Array.from(new Uint8Array(buffer));
    return await invoke('import_memoji_database', { dbBytes: bytes }) as DatabaseImportSummary;
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
