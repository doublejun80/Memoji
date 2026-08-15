import { CheckSquare2, Filter, Layers3, ListFilter, RefreshCw } from 'lucide-react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import type { Page } from '../../types';
import { getEnvironment } from '../../utils/environment';
import { pageWithMarkdownMetadata } from '../../utils/markdownMetadata';
import { tauriTaskApi, type TaskApi } from '../../shared/api/taskApi';
import { groupTasks, sortTasks } from './taskFilters';
import { TaskList } from './TaskList';
import type {
  MarkdownTaskDto,
  TaskFilter,
  TaskGroup,
  TaskSort,
  UpdateTaskRequest,
} from './taskTypes';

interface TasksWorkspaceProps {
  pages: Page[];
  onPageSelect: (page: Page) => void;
  onPageUpdate?: (page: Page) => void | Promise<void>;
  onTasksUpdated?: () => void | Promise<void>;
  api?: TaskApi;
  today?: string;
}

const FILTERS: Array<{ id: TaskFilter; label: string }> = [
  { id: 'inbox', label: '인박스' },
  { id: 'today', label: '오늘' },
  { id: 'upcoming', label: '예정' },
  { id: 'overdue', label: '기한 지남' },
  { id: 'completed', label: '완료' },
  { id: 'all', label: '전체' },
];

function localTasks(pages: Page[], filter: TaskFilter, today: string): MarkdownTaskDto[] {
  const tasks = pages.flatMap((page) => {
    let offset = 0;
    return page.content.split(/\r?\n/).flatMap((line, lineIndex) => {
      const start = offset;
      offset += line.length + 1;
      const match = line.match(/^\s*[-*+]\s+\[([ xX])\]\s+(.+)$/);
      if (!match || line.trimStart().startsWith('>')) return [];
      const dueDate = match[2].match(/@due\((\d{4}-\d{2}-\d{2})\)/)?.[1] ?? null;
      const priority = Number(match[2].match(/!p([1-3])/i)?.[1] ?? 0) || null;
      const text = match[2]
        .replace(/@due\(\d{4}-\d{2}-\d{2}\)/g, '')
        .replace(/!p[1-3]/gi, '')
        .replace(/<!--\s*memoji-task:[^>]+-->/g, '')
        .trim();
      return [{
        id: `${page.id}:${lineIndex + 1}`,
        pageId: page.id,
        pageTitle: page.title,
        projectId: page.projectParentId,
        text,
        completed: match[1].toLowerCase() === 'x',
        dueDate,
        priority,
        line: lineIndex + 1,
        sourceStart: start,
        sourceEnd: start + line.length,
        sourceHash: line,
        updatedAt: page.updatedAt,
      } satisfies MarkdownTaskDto];
    });
  });
  return tasks.filter((task) => {
    if (filter === 'today') return !task.completed && task.dueDate === today;
    if (filter === 'upcoming') return !task.completed && Boolean(task.dueDate && task.dueDate > today);
    if (filter === 'overdue') return !task.completed && Boolean(task.dueDate && task.dueDate < today);
    if (filter === 'completed') return task.completed;
    if (filter === 'all') return true;
    return !task.completed && !task.dueDate;
  });
}

export function TasksWorkspace({
  pages,
  onPageSelect,
  onPageUpdate,
  onTasksUpdated,
  api = tauriTaskApi,
  today = new Date().toLocaleDateString('sv-SE'),
}: TasksWorkspaceProps) {
  const [filter, setFilter] = useState<TaskFilter>('inbox');
  const [sort, setSort] = useState<TaskSort>('due');
  const [group, setGroup] = useState<TaskGroup>('none');
  const [tasks, setTasks] = useState<MarkdownTaskDto[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const native = Boolean(getEnvironment().isTauri) || api !== tauriTaskApi;

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setTasks(native
        ? await api.list({ filter, referenceDate: today })
        : localTasks(pages, filter, today));
    } catch (error) {
      toast.error(`작업을 불러오지 못했습니다: ${String(error)}`);
      setTasks([]);
    } finally {
      setLoading(false);
    }
  }, [api, filter, native, pages, today]);

  useEffect(() => { void load(); }, [load]);
  useEffect(() => {
    const selectFilter = (event: Event) => {
      const next = (event as CustomEvent<TaskFilter>).detail;
      if (FILTERS.some(({ id }) => id === next)) setFilter(next);
    };
    window.addEventListener('memoji:task-filter', selectFilter);
    return () => window.removeEventListener('memoji:task-filter', selectFilter);
  }, []);

  const update = async (task: MarkdownTaskDto, values: Partial<UpdateTaskRequest>) => {
    setBusyId(task.id);
    try {
      if (native) {
        await api.update({
          id: task.id,
          completed: values.completed ?? task.completed,
          dueDate: values.dueDate === undefined ? task.dueDate : values.dueDate,
          priority: values.priority === undefined ? task.priority : values.priority,
          expectedHash: task.sourceHash,
        });
        await onTasksUpdated?.();
      } else {
        const page = pages.find((candidate) => candidate.id === task.pageId);
        if (!page) return;
        const lines = page.content.split(/\r?\n/);
        let line = lines[task.line - 1];
        line = line.replace(/\[([ xX])\]/, values.completed ?? task.completed ? '[x]' : '[ ]');
        line = line.replace(/\s+@due\(\d{4}-\d{2}-\d{2}\)/g, '').replace(/\s+!p[1-3]/gi, '');
        const markerAt = line.indexOf(' <!-- memoji-task:');
        const marker = markerAt >= 0 ? line.slice(markerAt) : '';
        if (marker) line = line.slice(0, markerAt);
        const due = values.dueDate === undefined ? task.dueDate : values.dueDate;
        const priority = values.priority === undefined ? task.priority : values.priority;
        if (due) line += ` @due(${due})`;
        if (priority) line += ` !p${priority}`;
        lines[task.line - 1] = line + marker;
        await onPageUpdate?.(pageWithMarkdownMetadata(page, lines.join('\n')));
      }
      await load();
    } catch (error) {
      toast.error(`작업을 변경하지 못했습니다: ${String(error)}`);
    } finally {
      setBusyId(null);
    }
  };

  const ordered = useMemo(() => sortTasks(tasks, sort), [sort, tasks]);
  const groups = useMemo(() => groupTasks(ordered, group), [group, ordered]);

  return (
    <section className="tasks-workspace" aria-label="작업 공간">
      <header className="tasks-workspace-header">
        <div><span>MARKDOWN TASKS</span><h2>작업</h2></div>
        <button type="button" aria-label="작업 새로 고침" onClick={() => void load()}><RefreshCw aria-hidden="true" /></button>
      </header>
      <div className="tasks-toolbar">
        <label><Filter aria-hidden="true" /><span>필터</span>
          <select value={filter} onChange={(event) => setFilter(event.target.value as TaskFilter)}>
            {FILTERS.map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}
          </select>
        </label>
        <label><ListFilter aria-hidden="true" /><span>정렬</span>
          <select value={sort} onChange={(event) => setSort(event.target.value as TaskSort)}>
            <option value="due">마감일</option><option value="priority">우선순위</option><option value="page">문서</option>
          </select>
        </label>
        <label><Layers3 aria-hidden="true" /><span>그룹</span>
          <select value={group} onChange={(event) => setGroup(event.target.value as TaskGroup)}>
            <option value="none">없음</option><option value="due">마감일</option><option value="page">문서</option><option value="priority">우선순위</option>
          </select>
        </label>
        <span className="tasks-count">{tasks.length}개</span>
      </div>
      <div className="tasks-workspace-body">
        {loading ? <div className="tasks-zero" role="status">작업을 불러오는 중…</div> : null}
        {!loading && tasks.length === 0 ? (
          <div className="tasks-zero" role="status"><CheckSquare2 aria-hidden="true" /><strong>이 보기에 작업이 없습니다</strong><p>문서에 <code>- [ ] 할 일</code>을 추가하면 자동으로 나타납니다.</p></div>
        ) : null}
        {!loading ? groups.map(([label, grouped]) => (
          <section className="task-group" key={label} aria-label={label}>
            {group !== 'none' ? <h3>{label}<span>{grouped.length}</span></h3> : null}
            <TaskList
              tasks={grouped}
              busyId={busyId}
              onToggle={(task) => void update(task, { completed: !task.completed })}
              onDueChange={(task, dueDate) => void update(task, { dueDate })}
              onPriorityChange={(task, priority) => void update(task, { priority })}
              onOpenPage={(task) => {
                const page = pages.find((candidate) => candidate.id === task.pageId);
                if (page) onPageSelect(page);
              }}
            />
          </section>
        )) : null}
      </div>
    </section>
  );
}
