import type {
  SearchPageSummary,
  SearchTaskSummary,
} from '../shared/api/searchApi';
import type { AppCommand, CommandContext } from './types';

export type CommandSearchGroup = 'commands' | 'projects' | 'pages' | 'tasks';

export type CommandSearchResult =
  | {
    id: `project:${string}`;
    group: 'projects';
    label: string;
    description: string;
    page: SearchPageSummary;
    score: number;
  }
  | {
    id: `command:${string}`;
    group: 'commands';
    label: string;
    description?: string;
    shortcut?: string;
    command: AppCommand;
    score: number;
  }
  | {
    id: `page:${string}`;
    group: 'pages';
    label: string;
    description: string;
    page: SearchPageSummary;
    score: number;
  }
  | {
    id: `task:${string}`;
    group: 'tasks';
    label: string;
    description: string;
    task: SearchTaskSummary;
    score: number;
  };

interface SearchWorkspaceOptions {
  query: string;
  commands: AppCommand[];
  context: CommandContext;
  pages: SearchPageSummary[];
  tasks: SearchTaskSummary[];
  recentPageIds?: string[];
  limit?: number;
}

type SearchField = 'all' | 'title' | 'tag' | 'type' | 'due' | 'project' | 'is';

function normalize(value: string): string {
  return value.normalize('NFKC').toLocaleLowerCase('ko-KR').trim();
}

function parseQuery(query: string): { field: SearchField; term: string } {
  const normalized = normalize(query);
  for (const field of ['title', 'tag', 'type', 'due', 'project', 'is'] as const) {
    const prefix = `${field}:`;
    if (normalized.startsWith(prefix)) return { field, term: normalized.slice(prefix.length).trim() };
  }
  return { field: 'all', term: normalized };
}

function textScore(value: string, term: string, weight: number): number {
  const normalized = normalize(value);
  if (!normalized || !term) return 0;
  if (normalized === term) return weight + 30;
  if (normalized.startsWith(term)) return weight + 20;
  if (normalized.includes(term)) return weight + 10;
  return 0;
}

function tagScore(tags: string[], term: string): number {
  return Math.max(0, ...tags.map((tag) => textScore(tag, term, 70)));
}

function sortByScore<T extends { score: number; label: string }>(items: T[]): T[] {
  return items.sort((a, b) => (
    b.score - a.score || a.label.localeCompare(b.label, 'ko-KR')
  ));
}

function searchCommands(
  commands: AppCommand[],
  context: CommandContext,
  field: SearchField,
  term: string,
): CommandSearchResult[] {
  if (field !== 'all') return [];
  return sortByScore(commands.flatMap((command) => {
    if (!command.enabled(context)) return [];
    const score = term
      ? Math.max(
        textScore(command.label, term, 100),
        ...command.keywords.map((keyword) => textScore(keyword, term, 90)),
        textScore(command.description ?? '', term, 50),
      )
      : 1;
    if (score === 0) return [];
    return [{
      id: `command:${command.id}` as const,
      group: 'commands' as const,
      label: command.label,
      description: command.description,
      shortcut: command.shortcut,
      command,
      score,
    }];
  }));
}

function searchPages(
  pages: SearchPageSummary[],
  field: SearchField,
  term: string,
): CommandSearchResult[] {
  return sortByScore(pages.flatMap((page) => {
    if (page.pageType === 'folder' || page.projectIndex) return [];
    const score = field === 'tag'
      ? tagScore(page.tags, term)
      : field === 'title'
        ? textScore(page.title, term, 80)
        : field === 'type'
          ? (['page', '문서'].includes(term) && (page.pageType ?? 'page') === 'page' ? 90 : 0)
          : field === 'due'
            ? dueScore(page.dueDate, term)
            : field === 'project'
              ? textScore(page.projectTitle ?? page.projectId ?? '', term, 80)
              : field === 'is'
                ? Math.max(textScore(page.status ?? '', term, 80), term === (page.pageType ?? 'page') ? 80 : 0)
        : Math.max(
          textScore(page.title, term, 80),
          textScore(page.excerpt, term, 40),
          tagScore(page.tags, term),
        );
    if (score === 0) return [];
    return [{
      id: `page:${page.id}` as const,
      group: 'pages' as const,
      label: page.title,
      description: page.excerpt,
      page,
      score,
    }];
  }));
}

function dueScore(dueDate: string | null | undefined, term: string): number {
  if (!dueDate) return 0;
  const date = dueDate.slice(0, 10);
  const today = new Date().toISOString().slice(0, 10);
  if (term === 'today' || term === '오늘') return date === today ? 90 : 0;
  if (term === 'overdue' || term === '지연') return date < today ? 90 : 0;
  return textScore(date, term, 80);
}

function searchProjects(
  pages: SearchPageSummary[],
  field: SearchField,
  term: string,
): CommandSearchResult[] {
  return sortByScore(pages.flatMap((page) => {
    if (page.pageType !== 'folder' && !page.projectIndex) return [];
    const score = field === 'type'
      ? (['project', '프로젝트', 'folder', '폴더'].includes(term) ? 100 : 0)
      : field === 'tag'
        ? tagScore(page.tags, term)
        : field === 'title' || field === 'project'
          ? textScore(page.title, term, 90)
          : field === 'all'
            ? Math.max(textScore(page.title, term, 90), tagScore(page.tags, term))
            : 0;
    if (score === 0) return [];
    return [{
      id: `project:${page.id}` as const,
      group: 'projects' as const,
      label: page.title,
      description: page.excerpt || '프로젝트',
      page,
      score,
    }];
  }));
}

function searchTasks(
  tasks: SearchTaskSummary[],
  field: SearchField,
  term: string,
): CommandSearchResult[] {
  return sortByScore(tasks.flatMap((task) => {
    const score = field === 'tag'
      ? tagScore(task.tags, term)
      : field === 'type'
        ? (['task', '작업'].includes(term) ? 90 : 0)
        : field === 'due'
          ? dueScore(task.dueDate, term)
          : field === 'project'
            ? textScore(task.projectTitle ?? task.projectId ?? '', term, 80)
            : field === 'is'
              ? (normalize(task.status) === term ? 90 : 0)
              : textScore(task.title, term, 80);
    if (score === 0) return [];
    return [{
      id: `task:${task.id}` as const,
      group: 'tasks' as const,
      label: task.title,
      description: task.status === 'done' ? '완료된 작업' : '열린 작업',
      task,
      score,
    }];
  }));
}

function recentPages(
  pages: SearchPageSummary[],
  recentPageIds: string[],
): CommandSearchResult[] {
  const byId = new Map(pages.map((page) => [page.id, page]));
  const ordered = recentPageIds
    .map((id) => byId.get(id))
    .filter((page): page is SearchPageSummary => Boolean(page));

  if (ordered.length === 0) {
    ordered.push(...[...pages].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)).slice(0, 5));
  }

  return ordered.map((page, index) => ({
    id: `page:${page.id}` as const,
    group: 'pages' as const,
    label: page.title,
    description: page.excerpt,
    page,
    score: 100 - index,
  }));
}

export function searchWorkspace({
  query,
  commands,
  context,
  pages,
  tasks,
  recentPageIds = [],
  limit = 30,
}: SearchWorkspaceOptions): CommandSearchResult[] {
  const { field, term } = parseQuery(query);
  if (!term) {
    return [
      ...recentPages(pages, recentPageIds),
      ...searchCommands(commands, context, 'all', ''),
    ].slice(0, Math.max(0, limit));
  }

  return [
    ...searchCommands(commands, context, field, term),
    ...searchProjects(pages, field, term),
    ...searchPages(pages, field, term),
    ...searchTasks(tasks, field, term),
  ].slice(0, Math.max(0, limit));
}
