import { CalendarClock, Circle, CircleCheck, Flag, FileText } from 'lucide-react';
import type { MarkdownTaskDto } from './taskTypes';

interface TaskListProps {
  tasks: MarkdownTaskDto[];
  busyId?: string | null;
  onToggle: (task: MarkdownTaskDto) => void;
  onDueChange: (task: MarkdownTaskDto, dueDate: string | null) => void;
  onPriorityChange: (task: MarkdownTaskDto, priority: number | null) => void;
  onOpenPage: (task: MarkdownTaskDto) => void;
}

export function TaskList({
  tasks,
  busyId,
  onToggle,
  onDueChange,
  onPriorityChange,
  onOpenPage,
}: TaskListProps) {
  return (
    <div className="task-list" role="list">
      {tasks.map((task) => (
        <article className="task-row" data-completed={task.completed ? 'true' : 'false'} key={task.id} role="listitem">
          <button
            type="button"
            className="task-toggle"
            aria-label={`${task.text} ${task.completed ? '다시 열기' : '완료'}`}
            disabled={busyId === task.id}
            onClick={() => onToggle(task)}
          >
            {task.completed ? <CircleCheck aria-hidden="true" /> : <Circle aria-hidden="true" />}
          </button>
          <div className="task-row-copy">
            <strong>{task.text}</strong>
            <button type="button" className="task-page-link" onClick={() => onOpenPage(task)}>
              <FileText aria-hidden="true" /> {task.pageTitle} · L{task.line}
            </button>
          </div>
          <label className="task-field">
            <CalendarClock aria-hidden="true" />
            <span className="sr-only">{task.text} 마감일</span>
            <input
              type="date"
              value={task.dueDate ?? ''}
              disabled={busyId === task.id}
              onChange={(event) => onDueChange(task, event.target.value || null)}
            />
          </label>
          <label className="task-field task-priority-field">
            <Flag aria-hidden="true" />
            <span className="sr-only">{task.text} 우선순위</span>
            <select
              value={task.priority ?? ''}
              disabled={busyId === task.id}
              onChange={(event) => onPriorityChange(task, event.target.value ? Number(event.target.value) : null)}
            >
              <option value="">-</option>
              <option value="1">P1</option>
              <option value="2">P2</option>
              <option value="3">P3</option>
            </select>
          </label>
        </article>
      ))}
    </div>
  );
}
