import { describe, expect, it, vi } from 'vitest';
import { renderWithProviders, screen, userEvent } from '../test/render';
import type { Page } from '../types';
import type { PageApi } from '../shared/api/pageApi';
import { PropertiesPanel } from './PropertiesPanel';

const page: Page = {
  id: 'page-1',
  title: '출시 계획',
  icon: '📄',
  parentId: null,
  content: '# 출시 계획\n\n본문',
  createdAt: '2026-08-16T09:00:00Z',
  updatedAt: '2026-08-16T09:00:00Z',
  type: 'page',
  tags: [],
  order: 0,
};

describe('PropertiesPanel', () => {
  it('uses one shared context gutter for the full properties surface', () => {
    const { container } = renderWithProviders(<PropertiesPanel page={page} onPageUpdate={vi.fn()} />);

    const editor = container.querySelector('form.properties-editor');
    expect(editor).toHaveClass('context-panel-stack');
    expect(editor?.querySelector('.properties-list')).not.toHaveClass('context-panel-stack');
  });

  it('edits and persists supported document properties into Markdown metadata', async () => {
    const onPageUpdate = vi.fn();
    renderWithProviders(<PropertiesPanel page={page} onPageUpdate={onPageUpdate} />);

    await userEvent.type(screen.getByLabelText('문서 상태'), 'review');
    await userEvent.type(screen.getByLabelText('문서 마감일'), '2026-09-03');
    await userEvent.type(screen.getByLabelText('문서 태그'), 'GA, 출시');
    await userEvent.click(screen.getByRole('button', { name: '속성 저장' }));

    expect(onPageUpdate).toHaveBeenCalledWith(expect.objectContaining({
      status: 'review',
      dueDate: '2026-09-03',
      tags: ['GA', '출시'],
      content: expect.stringContaining('status:: review'),
    }));
    expect(onPageUpdate).toHaveBeenCalledWith(expect.objectContaining({
      content: expect.stringContaining('due:: 2026-09-03'),
    }));
  });

  it('shows every stored revision and restores through exactly one page-save path', async () => {
    const onPageUpdate = vi.fn();
    const api = {
      listRevisions: vi.fn().mockResolvedValue([
        { id: 2, pageId: 'page-1', revision: 2, bodyMarkdown: '두 번째 내용', createdAt: '2026-08-16T11:00:00Z', source: 'user' },
        { id: 1, pageId: 'page-1', revision: 1, bodyMarkdown: '첫 번째 내용', createdAt: '2026-08-16T10:00:00Z', source: 'import:user' },
      ]),
      restoreRevision: vi.fn(),
    } as unknown as PageApi;

    renderWithProviders(<PropertiesPanel page={{ ...page, revision: 2 }} onPageUpdate={onPageUpdate} api={api} />);

    expect(await screen.findByText('첫 번째 내용')).toBeInTheDocument();
    expect(screen.getByText('두 번째 내용')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'r1 버전 복원' }));

    expect(api.restoreRevision).not.toHaveBeenCalled();
    expect(onPageUpdate).toHaveBeenCalledWith(expect.objectContaining({
      content: '첫 번째 내용',
      revision: 2,
    }));
  });
});
