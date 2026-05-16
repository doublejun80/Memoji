import { Page } from '../types';
import { normalizePage } from './pageModel';

const PAGES_KEY = 'blocknote-pages';

export const storage = {
  // Pages
  getPages(): Page[] {
    const data = localStorage.getItem(PAGES_KEY);
    let pages: any[] = [];

    if (data) {
      try {
        pages = JSON.parse(data);
      } catch (error) {
        console.error('Failed to parse saved pages:', error);
        pages = [];
      }
    }
    
    // 기존 블록 기반 페이지를 마크다운으로 마이그레이션
    return pages.map((page: any, index: number) => {
      if (page.content === undefined) {
        return normalizePage({
          ...page,
          content: '' // 기본 빈 마크다운 콘텐츠
        }, index);
      }
      return normalizePage(page, index);
    });
  },

  savePage(page: Page): void {
    const normalizedPage = normalizePage(page);
    const pages = this.getPages();
    const existingIndex = pages.findIndex(p => p.id === normalizedPage.id);
    
    if (existingIndex >= 0) {
      pages[existingIndex] = normalizedPage;
    } else {
      pages.push(normalizedPage);
    }
    
    localStorage.setItem(PAGES_KEY, JSON.stringify(pages));
  },

  deletePage(pageId: string): void {
    const pages = this.getPages();
    const pageIdsToDelete = new Set<string>();

    const collectChildren = (id: string) => {
      if (pageIdsToDelete.has(id)) return;
      pageIdsToDelete.add(id);
      pages
        .filter(page => page.projectParentId === id || page.parentId === id)
        .forEach(child => collectChildren(child.id));
    };

    collectChildren(pageId);
    const filteredPages = pages.filter(p => !pageIdsToDelete.has(p.id));
    localStorage.setItem(PAGES_KEY, JSON.stringify(filteredPages));
  },

  cleanupBlockData(): void {
    const legacyBlocks = localStorage.getItem('blocknote-blocks');
    if (!legacyBlocks || localStorage.getItem('memoji-legacy-blocknote-blocks-backup')) return;

    localStorage.setItem('memoji-legacy-blocknote-blocks-backup', JSON.stringify({
      createdAt: new Date().toISOString(),
      entries: {
        'blocknote-blocks': legacyBlocks,
      },
    }));
  },

  // Utility
  generateId(): string {
    return Math.random().toString(36).substr(2, 9);
  }
};
