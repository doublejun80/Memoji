import { Page } from '../types';
import { formatDateKey, parseLocalISOString, toLocalISOString } from './dateUtils';

const normalizeParentId = (parentId: string | null | undefined): string | null => (
  parentId && parentId.trim() ? parentId : null
);

const getFallbackDateKey = (createdAt: string | undefined): string | null => {
  if (!createdAt) return null;
  const parsedDate = parseLocalISOString(createdAt);
  return Number.isNaN(parsedDate.getTime()) ? null : formatDateKey(parsedDate);
};

export const getPageDateKey = (page: Page): string | null => {
  if (page.dateKey !== undefined) return page.dateKey;
  return getFallbackDateKey(page.createdAt);
};

export const getProjectParentId = (page: Page): string | null => (
  normalizeParentId(page.projectParentId ?? page.parentId)
);

export const isProjectIndexPage = (page: Page): boolean => {
  if (page.projectIndex !== undefined) return page.projectIndex;
  return getProjectParentId(page) !== null || getPageDateKey(page) === null;
};

export const normalizePage = (page: any, index: number = 0): Page => {
  const createdAt = page.createdAt || page.created_at || toLocalISOString(new Date());
  const updatedAt = page.updatedAt || page.updated_at || createdAt;
  const projectParentId = normalizeParentId(
    page.projectParentId ?? page.project_parent_id ?? page.parentId ?? page.parent_id
  );
  const dateKey = page.dateKey !== undefined
    ? page.dateKey
    : page.date_key !== undefined
      ? page.date_key
      : getFallbackDateKey(createdAt);
  const projectIndex = page.projectIndex !== undefined && page.projectIndex !== null
    ? Boolean(page.projectIndex)
    : page.project_index !== undefined && page.project_index !== null
      ? Boolean(page.project_index)
      : projectParentId !== null || dateKey === null;

  return {
    id: page.id,
    title: page.title || '제목 없음',
    icon: page.icon || (page.type === 'folder' ? '📁' : '📄'),
    parentId: projectParentId,
    projectParentId,
    projectIndex,
    dateKey,
    content: page.content || '',
    createdAt,
    updatedAt,
    type: page.type || page.page_type || 'page',
    tags: Array.isArray(page.tags) ? page.tags : [],
    order: page.order !== undefined ? page.order : page.page_order !== undefined ? page.page_order : index,
  };
};

export const getProjectIndexPages = (pages: Page[]): Page[] => (
  sortPagesByProjectTree(pages.filter(isProjectIndexPage))
);

export const sortPagesByProjectTree = (pages: Page[]): Page[] => {
  const pagesByParent = pages.reduce((acc, page) => {
    const parentId = getProjectParentId(page) || 'root';
    if (!acc[parentId]) acc[parentId] = [];
    acc[parentId].push(page);
    return acc;
  }, {} as Record<string, Page[]>);

  Object.values(pagesByParent).forEach((siblings) => {
    siblings.sort((a, b) => a.order - b.order || a.title.localeCompare(b.title));
  });

  const sortedPages: Page[] = [];
  const visited = new Set<string>();
  const addPages = (parentId: string | null) => {
    const children = pagesByParent[parentId || 'root'] || [];
    children.forEach((page) => {
      if (visited.has(page.id)) return;
      visited.add(page.id);
      sortedPages.push(page);
      addPages(page.id);
    });
  };

  addPages(null);
  pages.forEach((page) => {
    if (!visited.has(page.id)) {
      visited.add(page.id);
      sortedPages.push(page);
    }
  });
  return sortedPages;
};

export const getPagesForDate = (pages: Page[], dateKey: string): Page[] => (
  pages
    .filter((page) => page.type !== 'folder' && getPageDateKey(page) === dateKey)
    .sort((a, b) => a.order - b.order || a.updatedAt.localeCompare(b.updatedAt))
);
