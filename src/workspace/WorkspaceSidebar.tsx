import {
  CalendarDays,
  CheckSquare2,
  FolderTree,
  Network,
  NotebookTabs,
  SunMedium,
} from 'lucide-react';
import type { SidebarProps } from '../components/Sidebar';
import type { LeftView } from '../app/workspaceState';
import { TodaySidebarView } from './views/TodaySidebarView';
import { DailySidebarView } from './views/DailySidebarView';
import { ProjectsSidebarView } from './views/ProjectsSidebarView';
import { TasksSidebarView } from './views/TasksSidebarView';
import { CalendarSidebarView } from './views/CalendarSidebarView';
import { KnowledgeSidebarView } from './views/KnowledgeSidebarView';

export interface WorkspaceSidebarProps extends SidebarProps {
  activeView: LeftView;
  onViewChange: (view: LeftView) => void;
}

const VIEW_ITEMS = [
  { id: 'today', label: '오늘', icon: SunMedium, shortcut: 'Alt+1' },
  { id: 'daily', label: '데일리', icon: NotebookTabs, shortcut: 'Alt+2' },
  { id: 'projects', label: '프로젝트', icon: FolderTree, shortcut: 'Alt+3' },
  { id: 'tasks', label: '작업', icon: CheckSquare2, shortcut: 'Alt+4' },
  { id: 'calendar', label: '캘린더', icon: CalendarDays, shortcut: 'Alt+5' },
  { id: 'knowledge', label: '지식', icon: Network, shortcut: 'Alt+6' },
] satisfies Array<{ id: LeftView; label: string; icon: typeof SunMedium; shortcut: string }>;

export function WorkspaceSidebar({
  activeView,
  onViewChange,
  onClose,
  ...sidebarProps
}: WorkspaceSidebarProps) {
  const selectView = (view: LeftView) => {
    onViewChange(view);
    if (view === 'daily') sidebarProps.onDailyIndexOpen();
  };

  return (
    <aside className="workspace-sidebar" aria-label="Workspace navigation">
      <div className="workspace-sidebar-topline">
        <span>작업 공간</span>
      </div>
      <nav className="workspace-sidebar-switcher" aria-label="작업 공간 보기">
        {VIEW_ITEMS.map(({ id, label, icon: Icon, shortcut }) => (
          <button
            type="button"
            key={id}
            aria-label={label}
            aria-current={activeView === id ? 'page' : undefined}
            data-active={activeView === id ? 'true' : 'false'}
            title={`${label} (${shortcut})`}
            onClick={() => selectView(id)}
          >
            <Icon aria-hidden="true" />
            <span>{label}</span>
          </button>
        ))}
      </nav>
      <div className="workspace-sidebar-content">
        {activeView === 'today' ? (
          <TodaySidebarView
            dailyPages={sidebarProps.dailyPages}
            pages={sidebarProps.pages}
            currentPage={sidebarProps.currentPage}
            onPageSelect={sidebarProps.onPageSelect}
            onDailyPageCreate={sidebarProps.onDailyPageCreate}
          />
        ) : null}
        {activeView === 'daily' ? <DailySidebarView {...sidebarProps} onClose={onClose} /> : null}
        {activeView === 'projects' ? <ProjectsSidebarView {...sidebarProps} onClose={onClose} /> : null}
        {activeView === 'tasks' ? <TasksSidebarView /> : null}
        {activeView === 'calendar' ? (
          <CalendarSidebarView
            onDateSelect={sidebarProps.onDateSelect}
            selectedDate={sidebarProps.selectedDate}
            datesWithPages={sidebarProps.datesWithPages}
          />
        ) : null}
        {activeView === 'knowledge' ? (
          <KnowledgeSidebarView pages={sidebarProps.pages} onPageSelect={sidebarProps.onPageSelect} />
        ) : null}
      </div>
    </aside>
  );
}
