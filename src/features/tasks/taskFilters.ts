import type { MarkdownTaskDto, TaskGroup, TaskSort } from './taskTypes';

export function sortTasks(tasks: MarkdownTaskDto[], sort: TaskSort): MarkdownTaskDto[] {
  return [...tasks].sort((left, right) => {
    if (left.completed !== right.completed) return Number(left.completed) - Number(right.completed);
    if (sort === 'priority') {
      return (left.priority ?? 9) - (right.priority ?? 9) || left.text.localeCompare(right.text, 'ko-KR');
    }
    if (sort === 'page') {
      return left.pageTitle.localeCompare(right.pageTitle, 'ko-KR') || left.line - right.line;
    }
    return (left.dueDate ?? '9999-12-31').localeCompare(right.dueDate ?? '9999-12-31')
      || (left.priority ?? 9) - (right.priority ?? 9);
  });
}

export function groupLabel(task: MarkdownTaskDto, group: TaskGroup): string {
  if (group === 'page') return task.pageTitle;
  if (group === 'priority') return task.priority ? `우선순위 P${task.priority}` : '우선순위 없음';
  if (group === 'due') return task.dueDate ?? '마감일 없음';
  return '작업';
}

export function groupTasks(tasks: MarkdownTaskDto[], group: TaskGroup) {
  if (group === 'none') return [['작업', tasks]] as const;
  const grouped = new Map<string, MarkdownTaskDto[]>();
  for (const task of tasks) {
    const label = groupLabel(task, group);
    grouped.set(label, [...(grouped.get(label) ?? []), task]);
  }
  return [...grouped.entries()];
}
