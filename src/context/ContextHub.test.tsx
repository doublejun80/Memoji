import { useState } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { renderWithProviders, screen, userEvent } from '../test/render';
import type { ContextHubTab } from '../app/workspaceState';
import type { Page } from '../types';
import { ContextHub } from './ContextHub';

vi.mock('../components/AIChatAssistant', () => ({
  default: () => <div data-testid="ai-assistant">AI assistant</div>,
}));

const page: Page = {
  id: 'page-1',
  title: '출시 계획',
  icon: '🚀',
  parentId: null,
  dateKey: '2026-08-16',
  content: '# 목표\n\n## 범위\n\n- [ ] 최종 점검',
  createdAt: '2026-08-16T09:00:00Z',
  updatedAt: '2026-08-16T10:00:00Z',
  type: 'page',
  tags: ['GA'],
  order: 0,
};

function ContextHarness({ searchPinned = false }: { searchPinned?: boolean }) {
  const [tab, setTab] = useState<ContextHubTab>('ai');
  return (
    <ContextHub
      activeTab={tab}
      onTabChange={setTab}
      currentPage={page}
      pages={[page]}
      searchPinned={searchPinned}
      onPageSelect={vi.fn()}
    />
  );
}

describe('ContextHub', () => {
  it('defaults to AI and gives its content the full available height', () => {
    renderWithProviders(<ContextHarness />);
    expect(screen.getByRole('tab', { name: 'AI' })).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByTestId('ai-assistant').closest('[data-context-panel]')).toHaveAttribute('data-fill-height', 'true');
  });

  it('persists the selected Outline tab and renders stable headings', async () => {
    renderWithProviders(<ContextHarness />);
    await userEvent.click(screen.getByRole('tab', { name: '개요' }));
    expect(screen.getByRole('tab', { name: '개요' })).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByRole('button', { name: '목표' })).toHaveAttribute('data-heading-id', '목표');
    expect(screen.getByRole('button', { name: '범위' })).toHaveAttribute('data-heading-id', '범위');
  });

  it('omits Search unless pinned', () => {
    const { rerender } = renderWithProviders(<ContextHarness />);
    expect(screen.queryByRole('tab', { name: '검색' })).not.toBeInTheDocument();
    rerender(<ContextHarness searchPinned />);
    expect(screen.getByRole('tab', { name: '검색' })).toBeVisible();
  });

  it('supports keyboard tab navigation', async () => {
    renderWithProviders(<ContextHarness />);
    const aiTab = screen.getByRole('tab', { name: 'AI' });
    aiTab.focus();
    await userEvent.keyboard('{ArrowRight}');
    expect(screen.getByRole('tab', { name: '개요' })).toHaveAttribute('aria-selected', 'true');
  });
});
