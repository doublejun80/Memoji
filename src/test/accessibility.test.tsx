import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { renderWithProviders, screen, userEvent, waitFor } from './render';
import { TopCommandBar } from '../workspace/TopCommandBar';
import { AiProposalCard } from '../features/ai/AiProposalCard';
import type { AiProposal } from '../features/ai/aiProposalReducer';
import { ContextHub } from '../context/ContextHub';
import type { Page } from '../types';

vi.mock('../components/AIChatAssistant', () => ({
  default: () => <div>AI assistant</div>,
}));

const page: Page = {
  id: 'page-1',
  title: '접근성 계획',
  icon: '📄',
  parentId: null,
  content: '# 목표\n\n- [ ] 키보드 검증',
  createdAt: '2026-08-16T00:00:00Z',
  updatedAt: '2026-08-16T00:00:00Z',
  type: 'page',
  tags: [],
  order: 0,
};

const proposal: AiProposal = {
  id: 'proposal-a11y',
  requestId: 'request-a11y',
  pageId: page.id,
  baseRevision: 1,
  type: 'replace',
  title: '접근성 문장 다듬기',
  summary: '선택 문장을 바꿉니다.',
  patch: {
    kind: 'text',
    before: '이전',
    after: '이후',
    anchor: { start: 0, end: 2, textHash: 'hash' },
    contextBefore: '',
    contextAfter: '',
  },
  sources: [{ pageId: page.id, label: '원문 근거' }],
  status: 'pending',
};

describe('GA workspace accessibility', () => {
  it('gives every persistent top-bar control an accessible name in focus order', async () => {
    renderWithProviders(
      <TopCommandBar
        workspaceName="Memoji"
        leftOpen
        rightOpen
        saveState="saved"
        runtimeState="로컬 AI 준비"
        onToggleLeft={vi.fn()}
        onToggleRight={vi.fn()}
        onOpenPalette={vi.fn()}
        onSave={vi.fn()}
        onExport={vi.fn()}
        onOpenSettings={vi.fn()}
        onOpenShortcuts={vi.fn()}
        onToggleFocus={vi.fn()}
        onToggleTheme={vi.fn()}
      />,
    );
    const expectedOrder = [
      '왼쪽 패널 닫기',
      '명령 또는 검색 Ctrl K 열기',
      '저장됨',
      '오른쪽 패널 닫기',
      '더보기',
    ];
    const controls = expectedOrder.map((name) => screen.getByRole('button', { name }));
    for (const control of controls) {
      await userEvent.tab();
      expect(control).toHaveFocus();
    }
  });

  it('exposes named tabs with selected state and keyboard navigation', async () => {
    renderWithProviders(
      <ContextHub
        activeTab="ai"
        onTabChange={vi.fn()}
        currentPage={page}
        pages={[page]}
      />,
    );
    const tabList = screen.getByRole('tablist', { name: 'Context Hub' });
    expect(tabList).toBeVisible();
    expect(screen.getByRole('tab', { name: 'AI' })).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByRole('tab', { name: '개요' })).toHaveAccessibleName('개요');
  });

  it('focuses, traps and closes the AI review dialog with Escape', async () => {
    const onClose = vi.fn();
    renderWithProviders(
      <AiProposalCard proposal={proposal} diffOpen onCloseDiff={onClose} />,
    );
    const close = await screen.findByRole('button', { name: '비교 닫기' });
    await waitFor(() => expect(close).toHaveFocus());
    await userEvent.keyboard('{Shift>}{Tab}{/Shift}');
    expect(screen.getByRole('button', { name: '변경 적용' })).toHaveFocus();
    await userEvent.keyboard('{Escape}');
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('does not reintroduce persistent 8–10px typography in the GA shell', () => {
    const files = [
      'src/styles/shell.css',
      'src/styles/sidebar.css',
      'src/styles/commands.css',
      'src/styles/context-hub.css',
      'src/styles/tasks.css',
      'src/styles/calendar.css',
      'src/features/ai/ai.css',
    ];
    const offenders = files.flatMap((file) => {
      const content = readFileSync(resolve(process.cwd(), file), 'utf8');
      return [...content.matchAll(/font-size:\s*(8|9|10)px/g)].map((match) => `${file}:${match[0]}`);
    });
    expect(offenders).toEqual([]);
  });
});
