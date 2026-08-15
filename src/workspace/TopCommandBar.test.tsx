import { describe, expect, it, vi } from 'vitest';
import { renderWithProviders, screen, userEvent } from '../test/render';
import { TopCommandBar } from './TopCommandBar';

function renderBar() {
  return renderWithProviders(
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
}

describe('TopCommandBar', () => {
  it('keeps only the primary workspace controls persistent', () => {
    renderBar();

    expect(screen.getByRole('button', { name: '왼쪽 패널 닫기' })).toBeVisible();
    expect(screen.getByRole('heading', { name: 'Memoji' })).toBeVisible();
    expect(screen.getByRole('button', { name: '명령 또는 검색 Ctrl K 열기' })).toBeVisible();
    expect(screen.getByRole('button', { name: '저장됨' })).toBeVisible();
    expect(screen.getByText('로컬 AI 준비')).toBeVisible();
    expect(screen.getByRole('button', { name: '오른쪽 패널 닫기' })).toBeVisible();
    expect(screen.getByRole('button', { name: '더보기' })).toBeVisible();
    expect(screen.getByRole('group', { name: '창 제어' })).toBeVisible();
  });

  it('places theme, export and settings inside the overflow menu', async () => {
    renderBar();
    await userEvent.click(screen.getByRole('button', { name: '더보기' }));

    const overflow = screen.getByRole('menu', { name: '더보기 메뉴' });
    expect(overflow).toContainElement(screen.getByRole('menuitem', { name: '테마 전환' }));
    expect(overflow).toContainElement(screen.getByRole('menuitem', { name: 'Markdown 내보내기' }));
    expect(overflow).toContainElement(screen.getByRole('menuitem', { name: '설정 열기' }));
  });
});
