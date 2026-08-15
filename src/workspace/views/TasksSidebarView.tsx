import { CalendarClock, CalendarRange, CheckCheck, Inbox, Siren } from 'lucide-react';
import { useState } from 'react';
import type { TaskFilter } from '../../features/tasks/taskTypes';

const FILTERS = [
  { id: 'inbox', label: '인박스', icon: Inbox },
  { id: 'today', label: '오늘', icon: CalendarClock },
  { id: 'upcoming', label: '예정', icon: CalendarRange },
  { id: 'overdue', label: '기한 지남', icon: Siren },
  { id: 'completed', label: '완료', icon: CheckCheck },
] satisfies Array<{ id: TaskFilter; label: string; icon: typeof Inbox }>;

export function TasksSidebarView() {
  const [active, setActive] = useState<TaskFilter>('inbox');
  return (
    <div className="workspace-sidebar-scroll" data-sidebar-view="tasks">
      <header className="workspace-sidebar-view-header"><h2>작업</h2></header>
      <nav className="task-sidebar-filters" aria-label="작업 필터">
        {FILTERS.map(({ id, label, icon: Icon }) => (
          <button
            type="button"
            key={id}
            data-active={active === id ? 'true' : 'false'}
            aria-current={active === id ? 'page' : undefined}
            onClick={() => {
              setActive(id);
              window.dispatchEvent(new CustomEvent<TaskFilter>('memoji:task-filter', { detail: id }));
            }}
          ><Icon aria-hidden="true" /><span>{label}</span></button>
        ))}
      </nav>
      <p className="task-sidebar-note">Markdown 체크박스가 원문과 양방향으로 동기화됩니다.</p>
    </div>
  );
}
