export type TaskFilter = 'inbox' | 'today' | 'upcoming' | 'overdue' | 'completed' | 'project' | 'page' | 'all';
export type TaskSort = 'due' | 'priority' | 'page';
export type TaskGroup = 'none' | 'due' | 'page' | 'priority';

export interface MarkdownTaskDto {
  id: string;
  pageId: string;
  pageTitle: string;
  projectId?: string | null;
  text: string;
  completed: boolean;
  dueDate?: string | null;
  priority?: number | null;
  line: number;
  sourceStart: number;
  sourceEnd: number;
  sourceHash: string;
  updatedAt: string;
}

export interface TaskListRequest {
  filter: TaskFilter;
  pageId?: string;
  projectId?: string;
  referenceDate?: string;
}

export interface UpdateTaskRequest {
  id: string;
  completed: boolean;
  dueDate?: string | null;
  priority?: number | null;
  expectedHash: string;
}
