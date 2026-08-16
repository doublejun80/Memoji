import { useEffect, useRef, useState } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { renderWithProviders, screen, userEvent, within } from '../test/render';
import type { Page } from '../types';
import { bindCommandKeyboard } from '../app/keyboardBindings';
import type { LeftView } from '../app/workspaceState';
import { createCommandRegistry } from '../commands/commandRegistry';
import type { CommandContext } from '../commands/types';
import { WorkspaceSidebar, type WorkspaceSidebarProps } from './WorkspaceSidebar';

const dailyPage: Page = {
  id: 'daily-1',
  title: '오늘 메모',
  icon: '📝',
  parentId: null,
  dateKey: '2026-08-16',
  content: '오늘의 기록',
  createdAt: '2026-08-16T09:00:00Z',
  updatedAt: '2026-08-16T10:00:00Z',
  type: 'page',
  tags: [],
  order: 0,
};

const projectPage: Page = {
  ...dailyPage,
  id: 'project-1',
  title: 'GA 출시',
  dateKey: null,
  projectIndex: true,
  content: '출시 계획',
};

const handlers = {
  onPageSelect: vi.fn(),
  onDailyIndexOpen: vi.fn(),
  onDailyPageCreate: vi.fn(),
  onProjectPageCreate: vi.fn(),
  onProjectFolderCreate: vi.fn(),
  onPageUpdate: vi.fn(),
  onPageDelete: vi.fn(),
  onPageMove: vi.fn(),
  onPageParentChange: vi.fn(),
  onDateSelect: vi.fn(),
  onClose: vi.fn(),
};

function SidebarHarness({ keyboard = false }: { keyboard?: boolean }) {
  const [activeView, setActiveView] = useState<LeftView>('today');
  const contextRef = useRef<CommandContext>({
    hasCurrentPage: true,
    canUseAi: true,
    createDailyPage: vi.fn(),
    quickCapture: vi.fn(),
    setLeftView: setActiveView,
    setWorkspaceView: vi.fn(),
    openAi: vi.fn(),
    summarizeCurrentPage: vi.fn(),
    saveDocument: vi.fn(),
    exportDocument: vi.fn(),
    openSettings: vi.fn(),
    toggleFocus: vi.fn(),
    togglePanel: vi.fn(),
  });
  contextRef.current.setLeftView = setActiveView;

  useEffect(() => {
    if (!keyboard) return;
    return bindCommandKeyboard(createCommandRegistry(), () => contextRef.current);
  }, [keyboard]);

  const props: WorkspaceSidebarProps = {
    pages: [dailyPage, projectPage],
    dailyPages: [dailyPage],
    currentPage: dailyPage,
    currentPageIndex: 'daily',
    activeView,
    onViewChange: setActiveView,
    selectedDate: new Date(2026, 7, 16),
    datesWithPages: ['2026-08-16'],
    ...handlers,
  };
  return <WorkspaceSidebar {...props} />;
}

describe('WorkspaceSidebar', () => {
  it('defaults to Today and renders all six workspace views', () => {
    renderWithProviders(<SidebarHarness />);
    expect(screen.queryByRole('button', { name: '왼쪽 패널 닫기' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: '오늘' })).toHaveAttribute('aria-current', 'page');
    const viewNavigation = screen.getByRole('navigation', { name: '작업 공간 보기' });
    expect(within(viewNavigation).getAllByRole('button')).toHaveLength(6);
    expect(screen.getByRole('heading', { name: '오늘의 문서' })).toBeVisible();
  });

  it('switches views through the shared Alt+1..6 command binding', async () => {
    renderWithProviders(<SidebarHarness keyboard />);
    await userEvent.keyboard('{Alt>}2{/Alt}');
    expect(screen.getByRole('button', { name: '데일리' })).toHaveAttribute('aria-current', 'page');
    expect(screen.getByRole('region', { name: '미니 캘린더' })).toBeVisible();

    await userEvent.keyboard('{Alt>}3{/Alt}');
    expect(screen.getByRole('button', { name: '프로젝트' })).toHaveAttribute('aria-current', 'page');
    expect(screen.queryByRole('region', { name: '미니 캘린더' })).not.toBeInTheDocument();
  });

  it('keeps guarded project navigation and never renders the removed wide layout', async () => {
    handlers.onPageSelect.mockClear();
    const { container } = renderWithProviders(<SidebarHarness />);
    await userEvent.click(screen.getByRole('button', { name: '프로젝트' }));
    await userEvent.click(screen.getByText('GA 출시'));
    expect(handlers.onPageSelect).toHaveBeenCalledWith(projectPage, 'project');
    expect(container.querySelector('[data-sidebar-wide-layout]')).not.toBeInTheDocument();
  });
});
