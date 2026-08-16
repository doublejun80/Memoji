import { describe, expect, it, vi } from 'vitest';
import { renderWithProviders, screen, userEvent, waitFor } from '../test/render';
import type { IndexedSearchApi } from '../shared/api/searchApi';
import { SearchWorkspace } from './SearchWorkspace';

it('runs indexed workspace search and opens a result', async () => {
  const searchApi: IndexedSearchApi = {
    search: vi.fn().mockResolvedValue([{
      pageId: 'page-1', title: 'VDI 배포', tags: ['VDI'], updatedAt: '2026-08-16',
      field: 'body', snippet: 'LiteRT 배포 확인', score: 9,
    }]),
    getPageAnchors: vi.fn(),
    getPageLinks: vi.fn(),
    reindex: vi.fn().mockResolvedValue({ pagesIndexed: 12, elapsedMs: 34 }),
  };
  const onPageOpen = vi.fn();
  renderWithProviders(<SearchWorkspace searchApi={searchApi} onPageOpen={onPageOpen} />);
  await userEvent.type(screen.getByRole('searchbox', { name: '워크스페이스 검색' }), 'LiteRT');
  expect(await screen.findByText('VDI 배포')).toBeVisible();
  await userEvent.click(screen.getByRole('button', { name: /VDI 배포/ }));
  await waitFor(() => expect(onPageOpen).toHaveBeenCalledWith('page-1'));
  await userEvent.click(screen.getByRole('button', { name: '검색 인덱스 재구성' }));
  expect(await screen.findByText('12개 문서 재색인 완료 · 34ms')).toBeVisible();
});
