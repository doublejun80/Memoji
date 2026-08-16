import { createRef } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { act, fireEvent, renderWithProviders, screen, userEvent } from '../test/render';
import type { Page } from '../types';
import { DocumentWorkspace, type DocumentWorkspaceHandle } from './DocumentWorkspace';

vi.mock('../components/editor/MilkdownEditor', () => ({
  MilkdownEditor: ({ value, onChange }: { value: string; onChange: (value: string) => void }) => (
    <textarea
      data-testid="milkdown-editor"
      aria-label="문서 본문"
      value={value}
      onChange={(event) => onChange(event.target.value)}
    />
  ),
}));

const page: Page = {
  id: 'page-1',
  title: 'GA 출시 계획',
  icon: '🚀',
  parentId: null,
  projectParentId: 'project-root',
  projectIndex: true,
  dateKey: '2026-08-16',
  content: '# 목표\n\n출시 준비를 완료합니다.',
  createdAt: '2026-08-15T09:00:00Z',
  updatedAt: '2026-08-16T09:00:00Z',
  type: 'page',
  tags: ['GA', '출시'],
  order: 0,
  revision: 7,
  status: 'active',
  dueDate: '2026-08-31',
};

describe('DocumentWorkspace', () => {
  it('renders document chrome, body, metadata and status without a selection toolbar', () => {
    renderWithProviders(<DocumentWorkspace currentPage={page} onPageUpdate={vi.fn()} />);

    expect(screen.getByLabelText('문서 경로')).toHaveTextContent('프로젝트/GA 출시 계획');
    expect(screen.getByRole('heading', { name: 'GA 출시 계획' })).toBeVisible();
    expect(screen.getByText('저장됨')).toBeVisible();
    expect(screen.getByText('r7')).toBeVisible();
    expect(screen.getByText('active')).toBeVisible();
    expect(screen.getByText('마감 2026-08-31')).toBeVisible();
    expect(screen.getByRole('button', { name: '편집' })).toBeVisible();
    expect(screen.getByRole('button', { name: '원문' })).toBeVisible();
    expect(screen.getByText('문서')).toBeVisible();
    expect(screen.getByText('2026-08-16')).toBeVisible();
    expect(screen.getByText('#GA')).toBeVisible();
    expect(screen.getByTestId('milkdown-editor')).toHaveValue(page.content);
    expect(screen.getByRole('status')).toHaveTextContent('문자');
    expect(screen.queryByRole('toolbar', { name: '선택 영역 AI 도구' })).not.toBeInTheDocument();
  });

  it('opens the editable properties inspector from the metadata strip', async () => {
    const onOpenProperties = vi.fn();
    renderWithProviders(
      <DocumentWorkspace currentPage={page} onPageUpdate={vi.fn()} onOpenProperties={onOpenProperties} />,
    );

    await userEvent.click(screen.getByRole('button', { name: '속성 추가 및 편집' }));
    expect(onOpenProperties).toHaveBeenCalledTimes(1);
  });

  it('keeps source selection explicit and exposes the save flush handle', async () => {
    const ref = createRef<DocumentWorkspaceHandle>();
    renderWithProviders(<DocumentWorkspace ref={ref} currentPage={page} onPageUpdate={vi.fn()} />);
    await userEvent.click(screen.getByRole('button', { name: '원문' }));
    const source = screen.getByRole('textbox', { name: 'Markdown 원문' }) as HTMLTextAreaElement;
    source.setSelectionRange(2, 4);
    fireEvent.select(source);
    expect(await screen.findByRole('toolbar', { name: '선택 영역 AI 도구' })).toBeVisible();
    expect(screen.getByRole('button', { name: '번역' })).toBeVisible();
    await expect(ref.current?.flushUnsaved()).resolves.toBeUndefined();
  });

  it('moves the source editor to an outline heading and reports the active heading', async () => {
    renderWithProviders(<DocumentWorkspace currentPage={page} onPageUpdate={vi.fn()} />);
    await userEvent.click(screen.getByRole('button', { name: '원문' }));
    const source = screen.getByRole('textbox', { name: 'Markdown 원문' }) as HTMLTextAreaElement;
    const active = vi.fn();
    window.addEventListener('memoji:outline-active', active, { once: true });
    act(() => window.dispatchEvent(new CustomEvent('memoji:outline-navigate', {
      detail: { id: '목표', level: 1, text: '목표', line: 1 },
    })));
    expect(source.selectionStart).toBe(0);
    expect(source.selectionEnd).toBe('# 목표'.length);
    expect(active).toHaveBeenCalled();
  });
});
