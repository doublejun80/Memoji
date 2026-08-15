import { describe, expect, it, vi } from 'vitest';
import { renderWithProviders, screen, userEvent, waitFor } from '../../test/render';
import type { CalendarApi } from '../../shared/api/calendarApi';
import { CalendarWorkspace } from './CalendarWorkspace';

const page = {
  id: 'page-1', title: '출시 계획', icon: '📄', parentId: null, content: '',
  createdAt: '2026-08-16T09:00:00Z', updatedAt: '2026-08-16T09:00:00Z', type: 'page' as const,
  tags: [], order: 0,
};

function fixture(): CalendarApi {
  return {
    list: vi.fn().mockResolvedValue([{ kind: 'task', id: 'task-1', title: '패키징', startAt: '2026-08-16', endAt: null, allDay: true, timezone: 'local', pageId: 'page-1', pageTitle: '출시 계획', completed: false, priority: 1 }]),
    save: vi.fn().mockResolvedValue({}), delete: vi.fn(), exportIcs: vi.fn(), importIcs: vi.fn(),
  } as CalendarApi;
}

describe('CalendarWorkspace', () => {
  it('shows projected task due items and opens their linked page', async () => {
    const api = fixture();
    const onPageOpen = vi.fn();
    renderWithProviders(<CalendarWorkspace pages={[page]} selectedDate={new Date(2026, 7, 16)} onDateSelect={vi.fn()} onPageOpen={onPageOpen} api={api} />);
    await userEvent.click(await screen.findByRole('button', { name: /패키징/ }));
    expect(onPageOpen).toHaveBeenCalledWith(page);
  });

  it('updates selected date without selecting a page', async () => {
    const onDateSelect = vi.fn();
    const onPageOpen = vi.fn();
    renderWithProviders(<CalendarWorkspace pages={[page]} selectedDate={new Date(2026, 7, 16)} onDateSelect={onDateSelect} onPageOpen={onPageOpen} api={fixture()} />);
    await userEvent.click(screen.getByRole('button', { name: '2026-08-17 선택' }));
    expect(onDateSelect).toHaveBeenCalled();
    expect(onPageOpen).not.toHaveBeenCalled();
  });

  it('creates an offline event with an optional page link', async () => {
    const api = fixture();
    renderWithProviders(<CalendarWorkspace pages={[page]} selectedDate={new Date(2026, 7, 16)} onDateSelect={vi.fn()} onPageOpen={vi.fn()} api={api} />);
    await userEvent.click(screen.getByRole('button', { name: '새 일정' }));
    await userEvent.type(screen.getByLabelText('일정 제목'), '릴리스 회의');
    await userEvent.selectOptions(screen.getByLabelText('연결 문서'), 'page-1');
    await userEvent.click(screen.getByRole('button', { name: '저장' }));
    await waitFor(() => expect(api.save).toHaveBeenCalledWith(expect.objectContaining({ title: '릴리스 회의', pageId: 'page-1', allDay: true })));
  });
});
