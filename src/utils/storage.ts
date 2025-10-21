import { Page } from '../types';

const PAGES_KEY = 'blocknote-pages';

export const storage = {
  // Pages
  getPages(): Page[] {
    const data = localStorage.getItem(PAGES_KEY);
    const pages = data ? JSON.parse(data) : [];
    
    // 기존 블록 기반 페이지를 마크다운으로 마이그레이션
    return pages.map((page: any) => {
      if (page.content === undefined) {
        return {
          ...page,
          content: '' // 기본 빈 마크다운 콘텐츠
        };
      }
      return page;
    });
  },

  savePage(page: Page): void {
    const pages = this.getPages();
    const existingIndex = pages.findIndex(p => p.id === page.id);
    
    if (existingIndex >= 0) {
      pages[existingIndex] = page;
    } else {
      pages.push(page);
    }
    
    localStorage.setItem(PAGES_KEY, JSON.stringify(pages));
  },

  deletePage(pageId: string): void {
    const pages = this.getPages().filter(p => p.id !== pageId);
    localStorage.setItem(PAGES_KEY, JSON.stringify(pages));
  },

  // 기존 블록 데이터 정리 (마이그레이션)
  cleanupBlockData(): void {
    localStorage.removeItem('blocknote-blocks');
  },

  // Utility
  generateId(): string {
    return Math.random().toString(36).substr(2, 9);
  }
};