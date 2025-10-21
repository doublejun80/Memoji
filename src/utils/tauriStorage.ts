import { Page } from '../types';

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
    console.log('Tauri not available, using localStorage fallback');
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
        console.log('🚀 Initializing Tauri database...');
        await invoke('init_database');
        this.isInitialized = true;
        console.log('✅ Tauri database initialized successfully');
      } catch (error) {
        console.warn('⚠️ Failed to initialize Tauri database, falling back to localStorage:', error);
        this.isInitialized = false;
        this.isTauriAvailable = false;
      }
    } else {
      console.log('💾 Using localStorage for data persistence (web mode)');
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
        console.log('📖 tauriStorage.getPages - Tauri에서 로드 시도');
        const tauriPages = await invoke<any[]>('get_pages');
        console.log('📖 Tauri에서 로드된 페이지 수:', tauriPages.length);

        // Convert snake_case from Tauri to camelCase
        const pages = tauriPages.map(p => {
          console.log(`  - Tauri 페이지 "${p.title}":`, {
            tags: p.tags,
            tagsType: typeof p.tags
          });

          return {
            id: p.id,
            title: p.title,
            icon: p.icon,
            parentId: p.parent_id,
            content: p.content,
            createdAt: p.created_at,
            updatedAt: p.updated_at,
            type: p.type,
            tags: p.tags,
            order: p.order
          };
        });

        const migratedPages = this.migratePages(pages);
        console.log('📖 마이그레이션 후 페이지 수:', migratedPages.length);
        return migratedPages;
      } catch (error) {
        console.error('❌ Tauri에서 페이지 로드 실패:', error);
      }
    }

    // Fallback to localStorage
    console.log('📖 tauriStorage.getPages - localStorage에서 로드');
    const saved = localStorage.getItem('blocknote-pages');
    console.log('📖 localStorage 원본 데이터:', saved?.substring(0, 500));

    const pages = saved ? JSON.parse(saved) : [];
    console.log('📖 localStorage에서 로드된 페이지 수:', pages.length);

    pages.forEach((p: any) => {
      console.log(`  - localStorage 페이지 "${p.title}":`, {
        tags: p.tags,
        tagsType: typeof p.tags,
        tagsIsArray: Array.isArray(p.tags),
        전체객체: p
      });
    });

    const migratedPages = this.migratePages(pages);
    console.log('📖 마이그레이션 후:', migratedPages.map(p => ({ title: p.title, tags: p.tags })));

    return migratedPages;
  }

  // 기존 페이지를 새로운 구조로 마이그레이션
  private migratePages(pages: any[]): Page[] {
    return pages.map((page: any, index: number) => ({
      ...page,
      type: page.type || 'page', // 기본값은 'page'
      tags: page.tags || [], // 기본값은 빈 배열
      order: page.order !== undefined ? page.order : index, // 기본값은 인덱스
      content: page.content || '' // 기존 마이그레이션 유지
    }));
  }

  async savePage(page: Page): Promise<void> {
    console.log('💾 tauriStorage.savePage 호출:', page.title);
    console.log('  - content 길이:', page.content?.length || 0);
    console.log('  - content 미리보기:', page.content?.substring(0, 50) || '(empty)');

    await this.init();

    if (this.isInitialized && this.isTauriAvailable && invoke) {
      try {
        // Convert camelCase to snake_case for Tauri
        const tauriPage = {
          id: page.id,
          title: page.title,
          icon: page.icon,
          parent_id: page.parentId,
          content: page.content,
          created_at: page.createdAt,
          updated_at: page.updatedAt,
          type: page.type,
          tags: page.tags,
          order: page.order
        };
        await invoke('save_page', { page: tauriPage });
        console.log('✅ Tauri DB에 저장 완료');
        return;
      } catch (error) {
        console.error('❌ Tauri 저장 실패, localStorage로 fallback:', error);
      }
    }

    // Fallback to localStorage
    const pages = await this.getLocalStoragePages();
    const existingIndex = pages.findIndex(p => p.id === page.id);

    if (existingIndex >= 0) {
      pages[existingIndex] = page;
    } else {
      pages.push(page);
    }

    localStorage.setItem('blocknote-pages', JSON.stringify(pages));
    console.log('✅ localStorage에 저장 완료');
  }

  private getLocalStoragePages(): Page[] {
    const saved = localStorage.getItem('blocknote-pages');
    return saved ? JSON.parse(saved) : [];
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
    const result = [pageId];
    const children = allPages.filter(page => page.parentId === pageId);
    
    children.forEach(child => {
      result.push(...this.getAllChildPageIds(child.id, allPages));
    });
    
    return result;
  }

  cleanupBlockData(): void {
    // 기존 블록 데이터 정리 (마이그레이션용)
    const keys = Object.keys(localStorage);
    keys.forEach(key => {
      if (key.startsWith('blocknote-blocks-') || key === 'blocknote-blocks') {
        localStorage.removeItem(key);
      }
    });
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
}

export const tauriStorage = new TauriStorage();