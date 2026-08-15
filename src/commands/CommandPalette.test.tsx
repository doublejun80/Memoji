import { useState } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { renderWithProviders, screen, userEvent, waitFor } from '../test/render';
import { CommandPalette } from './CommandPalette';
import type { AppCommand, CommandContext } from './types';

const runSettings = vi.fn();
const commands: AppCommand[] = [
  {
    id: 'settings.open',
    label: '설정 열기',
    keywords: ['환경설정'],
    category: 'settings',
    enabled: () => true,
    run: runSettings,
  },
];
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
const pages = [
  { id: 'p1', title: '구매 계획', excerpt: '견적 비교', tags: ['조달'], updatedAt: '2026-08-15T10:00:00Z' },
];

function PaletteHarness({ initiallyOpen = false }: { initiallyOpen?: boolean }) {
  const [open, setOpen] = useState(initiallyOpen);
  return (
    <CommandPalette
      open={open}
      onOpenChange={setOpen}
      commands={commands}
      context={context}
      pages={pages}
      tasks={[]}
      onPageSelect={vi.fn()}
      onTaskSelect={vi.fn()}
    />
  );
}

describe('CommandPalette', () => {
  it('opens with Ctrl+K and focuses the query input', async () => {
    renderWithProviders(<PaletteHarness />);
    await userEvent.keyboard('{Control>}k{/Control}');

    const input = await screen.findByRole('combobox', { name: '명령 또는 검색' });
    await waitFor(() => expect(input).toHaveFocus());
  });

  it('uses arrow navigation and Enter to run the selected command', async () => {
    runSettings.mockClear();
    renderWithProviders(<PaletteHarness initiallyOpen />);
    const input = screen.getByRole('combobox', { name: '명령 또는 검색' });
    await userEvent.type(input, '환경설정');
    await userEvent.keyboard('{ArrowDown}{Enter}');

    expect(runSettings).toHaveBeenCalledWith(context);
    expect(screen.queryByRole('dialog', { name: '명령 또는 검색' })).not.toBeInTheDocument();
  });

  it('closes with Escape', async () => {
    renderWithProviders(<PaletteHarness initiallyOpen />);
    await userEvent.keyboard('{Escape}');
    expect(screen.queryByRole('dialog', { name: '명령 또는 검색' })).not.toBeInTheDocument();
  });

  it('renders result groups and a no-result state', async () => {
    renderWithProviders(<PaletteHarness initiallyOpen />);
    expect(screen.getByText('최근 문서')).toBeVisible();
    expect(screen.getByText('명령')).toBeVisible();

    await userEvent.type(screen.getByRole('combobox', { name: '명령 또는 검색' }), '없는검색어');
    expect(screen.getByText('일치하는 명령, 문서 또는 작업이 없습니다.')).toBeVisible();
  });
});
