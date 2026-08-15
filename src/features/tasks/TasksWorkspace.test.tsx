import { describe, expect, it, vi } from 'vitest';
import { renderWithProviders, screen, userEvent, waitFor } from '../../test/render';
import type { TaskApi } from '../../shared/api/taskApi';
import { TasksWorkspace } from './TasksWorkspace';
import type { MarkdownTaskDto } from './taskTypes';

const task: MarkdownTaskDto = {
  id: '01ARZ3NDEKTSV4RRFFQ69G5FAV',
  pageId: 'page-1',
  pageTitle: '출시 계획',
  text: '배포 확인',
  completed: false,
  dueDate: null,
  priority: 1,
  line: 3,
  sourceStart: 10,
  sourceEnd: 30,
  sourceHash: 'sha256:source',
  updatedAt: '2026-08-16T09:00:00Z',
};

const page = {
  id: 'page-1', title: '출시 계획', icon: '📄', parentId: null, content: '- [ ] 배포 확인',
  createdAt: '2026-08-16T09:00:00Z', updatedAt: '2026-08-16T09:00:00Z', type: 'page' as const,
  tags: [], order: 0,
};

describe('TasksWorkspace', () => {
  it('loads filtered Markdown tasks and patches completion through the API', async () => {
    const api: TaskApi = {
      list: vi.fn().mockResolvedValue([task]),
      update: vi.fn().mockResolvedValue({ ...task, completed: true }),
    };
    renderWithProviders(<TasksWorkspace pages={[page]} onPageSelect={vi.fn()} api={api} today="2026-08-16" />);
    expect(await screen.findByText('배포 확인')).toBeVisible();
    await userEvent.click(screen.getByRole('button', { name: '배포 확인 완료' }));
    await waitFor(() => expect(api.update).toHaveBeenCalledWith(expect.objectContaining({
      id: task.id,
      completed: true,
      expectedHash: task.sourceHash,
    })));
  });

  it('reloads when the filter changes', async () => {
    const api: TaskApi = { list: vi.fn().mockResolvedValue([]), update: vi.fn() };
    renderWithProviders(<TasksWorkspace pages={[page]} onPageSelect={vi.fn()} api={api} today="2026-08-16" />);
    await userEvent.selectOptions(screen.getByLabelText('필터'), 'completed');
    await waitFor(() => expect(api.list).toHaveBeenLastCalledWith(expect.objectContaining({ filter: 'completed' })));
  });
});
