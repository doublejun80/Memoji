import { Page } from '../types';
import { normalizePage } from './pageModel';

export interface DatabaseImportSummary {
  imported: number;
  duplicated: number;
  skipped: number;
  backup_path: string;
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

  async init() {
    if (this.isInitialized) return;
    
    // First check if Tauri is available
    this.isTauriAvailable = await initTauri();
    
    if (this.isTauriAvailable && invoke) {
      try {
        await invoke('init_database');
        this.isInitialized = true;
      } catch (error) {
        console.warn('⚠️ Failed to initialize Tauri database, falling back to localStorage:', error);
        this.isInitialized = false;
        this.isTauriAvailable = false;
      }
    } else {
      this.isInitialized = false;
      this.isTauriAvailable = false;
    }
  }

  generateId(): string {
    return Date.now().toString(36) + Math.random().toString(36).substr(2);
  }

  async getPages(): Promise<Page[]> {
    await this.init();

    if (this.isInitialized && this.isTauriAvailable && invoke) {
      try {
        const tauriPages = await invoke<any[]>('get_pages');

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
      }
    }

    // Fallback to localStorage
    const saved = localStorage.getItem('blocknote-pages');
    let pages: any[] = [];

    if (saved) {
      try {
        pages = JSON.parse(saved);
      } catch (error) {
        console.error('Failed to parse saved localStorage pages:', error);
        pages = [];
      }
    }

    const migratedPages = this.migratePages(pages);

    return migratedPages;
  }

  // 기존 페이지를 새로운 구조로 마이그레이션
  private migratePages(pages: any[]): Page[] {
    return pages.map((page: any, index: number) => normalizePage(page, index));
  }

  async savePage(page: Page): Promise<void> {
    await this.init();

    if (this.isInitialized && this.isTauriAvailable && invoke) {
      try {
        // Convert camelCase to snake_case for Tauri
        const normalizedPage = normalizePage(page);
        const tauriPage = {
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
        await invoke('save_page', { page: tauriPage });
        return;
      } catch (error) {
        console.error('❌ Tauri 저장 실패, localStorage로 fallback:', error);
      }
    }

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
      return JSON.parse(saved);
    } catch (error) {
      console.error('Failed to parse saved localStorage pages:', error);
      return [];
    }
  }

  async deletePage(pageId: string): Promise<void> {
    await this.init();
    
    if (this.isInitialized && this.isTauriAvailable && invoke) {
      try {
        await invoke('delete_page', { pageId });
        return;
      } catch (error) {
        console.error('Failed to delete page from Tauri:', error);
      }
    }

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
        return await invoke<string>('get_app_data_dir');
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
        return await invoke<string>('get_app_title');
      } catch (error) {
        console.error('Failed to get app title from Tauri:', error);
      }
    }

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
      }
    }

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
    return await invoke<DatabaseImportSummary>('import_memoji_database', { dbBytes: bytes });
  }
}

export const tauriStorage = new TauriStorage();
