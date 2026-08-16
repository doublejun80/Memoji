import { describe, expect, it, vi } from 'vitest';
import { renderWithProviders, screen, userEvent, waitFor } from '../test/render';
import type { PageApi } from '../shared/api/pageApi';
import type { Page } from '../types';
import { KnowledgeWorkspace } from './KnowledgeWorkspace';

const page: Page = {
  id: 'page-1', title: 'GA 계획', icon: '📄', parentId: null, content: '',
  createdAt: '2026-08-01', updatedAt: '2026-08-16', type: 'page', tags: ['GA', 'VDI'], order: 0,
};

it('shows the knowledge index and restores pages from trash', async () => {
  const pageApi = {
    listTrashedSummaries: vi.fn().mockResolvedValue([{ ...page, projectIndex: false, revision: 2, deletedAt: '2026-08-16' }]),
    restore: vi.fn().mockResolvedValue(undefined),
  } as unknown as PageApi;
  const onRestored = vi.fn();
  renderWithProviders(<KnowledgeWorkspace pages={[page]} pageApi={pageApi} onPageSelect={vi.fn()} onRestored={onRestored} />);

  expect(screen.getByRole('region', { name: '지식 공간' })).toBeVisible();
  expect(screen.getByText('#GA')).toBeVisible();
  await userEvent.click(screen.getByRole('tab', { name: /휴지통/ }));
  expect(await screen.findByText('GA 계획')).toBeVisible();
  await userEvent.click(screen.getByRole('button', { name: 'GA 계획 복원' }));
  await waitFor(() => expect(pageApi.restore).toHaveBeenCalledWith('page-1'));
  expect(onRestored).toHaveBeenCalled();
});
