import { describe, expect, it, vi } from 'vitest';
import { searchWorkspace } from './commandSearch';
import type { AppCommand, CommandContext } from './types';

const context: CommandContext = {
  hasCurrentPage: true,
  canUseAi: true,
  createDailyPage: vi.fn(),
  quickCapture: vi.fn(),
  setLeftView: vi.fn(),
  setWorkspaceView: vi.fn(),
  openAi: vi.fn(),
  summarizeCurrentPage: vi.fn(),
  saveDocument: vi.fn(),
  exportDocument: vi.fn(),
  openSettings: vi.fn(),
  toggleFocus: vi.fn(),
  togglePanel: vi.fn(),
};

const commands: AppCommand[] = [
  {
    id: 'settings.open',
    label: '설정 열기',
    keywords: ['환경설정', 'preferences'],
    category: 'settings',
    enabled: () => true,
    run: vi.fn(),
  },
  {
    id: 'view.tasks',
    label: '작업 보기',
    keywords: ['계획', '할 일'],
    category: 'navigation',
    enabled: () => true,
    run: vi.fn(),
  },
];

const pages = [
  { id: 'p1', title: '구매 계획', excerpt: '업체 견적을 비교합니다.', tags: ['조달'], updatedAt: '2026-08-15T10:00:00Z' },
  { id: 'p2', title: '회의 기록', excerpt: '다음 배포 계획을 확정했습니다.', tags: ['회의'], updatedAt: '2026-08-14T10:00:00Z' },
  { id: 'p3', title: '읽을거리', excerpt: '메모', tags: ['계획'], updatedAt: '2026-08-13T10:00:00Z' },
];

const tasks = [
  { id: 't1', title: '구매 계획 검토', status: 'open' as const, pageId: 'p1', tags: ['조달'] },
];

describe('searchWorkspace', () => {
  it('returns recent pages followed by commands for an empty query', () => {
    const results = searchWorkspace({ query: '', commands, context, pages, tasks, recentPageIds: ['p2', 'p1'], limit: 10 });
    expect(results.slice(0, 2).map((result) => result.id)).toEqual(['page:p2', 'page:p1']);
    expect(results.map((result) => result.group)).toContain('commands');
  });

  it('matches Korean page titles', () => {
    const results = searchWorkspace({ query: '구매', commands, context, pages, tasks, limit: 10 });
    expect(results.map((result) => result.id)).toContain('page:p1');
  });

  it('limits title: searches to titles', () => {
    const results = searchWorkspace({ query: 'title:계획', commands, context, pages, tasks, limit: 10 });
    expect(results.map((result) => result.id)).toEqual(expect.arrayContaining(['page:p1', 'task:t1']));
    expect(results.map((result) => result.id)).not.toContain('page:p2');
  });

  it('limits tag: searches to tags', () => {
    const results = searchWorkspace({ query: 'tag:계획', commands, context, pages, tasks, limit: 10 });
    expect(results.map((result) => result.id)).toContain('page:p3');
    expect(results.map((result) => result.id)).not.toContain('page:p1');
  });

  it('matches command keywords and keeps commands before pages and tasks', () => {
    const results = searchWorkspace({ query: '계획', commands, context, pages, tasks, limit: 10 });
    expect(results[0]).toMatchObject({ id: 'command:view.tasks', group: 'commands' });
    expect(results.map((result) => result.group)).toEqual(['commands', 'pages', 'pages', 'pages', 'tasks']);
  });

  it('enforces the global result limit', () => {
    const results = searchWorkspace({ query: '계획', commands, context, pages, tasks, limit: 2 });
    expect(results).toHaveLength(2);
  });
});
