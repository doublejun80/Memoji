import { Command } from 'cmdk';
import { Search } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import {
  tauriIndexedSearchApi,
  type IndexedSearchApi,
  type SearchPageSummary,
  type SearchTaskSummary,
} from '../shared/api/searchApi';
import { tauriTaskApi, type TaskApi } from '../shared/api/taskApi';
import { searchWorkspace, type CommandSearchResult } from './commandSearch';
import type { AppCommand, CommandContext } from './types';

interface CommandPaletteProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  commands: AppCommand[];
  context: CommandContext;
  pages: SearchPageSummary[];
  tasks: SearchTaskSummary[];
  recentPageIds?: string[];
  onPageSelect: (page: SearchPageSummary) => void;
  onTaskSelect: (task: SearchTaskSummary) => void;
  searchApi?: IndexedSearchApi;
  taskApi?: TaskApi;
}

const GROUP_LABELS = {
  commands: '명령',
  projects: '프로젝트',
  pages: '문서',
  tasks: '작업',
} as const;

function byGroup(results: CommandSearchResult[], group: CommandSearchResult['group']) {
  return results.filter((result) => result.group === group);
}

export function CommandPalette({
  open,
  onOpenChange,
  commands,
  context,
  pages,
  tasks,
  recentPageIds,
  onPageSelect,
  onTaskSelect,
  searchApi = tauriIndexedSearchApi,
  taskApi = tauriTaskApi,
}: CommandPaletteProps) {
  const [query, setQuery] = useState('');
  const [indexedPages, setIndexedPages] = useState<SearchPageSummary[] | null>(null);
  const [backendTasks, setBackendTasks] = useState<SearchTaskSummary[]>([]);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.isComposing) return;
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault();
        onOpenChange(true);
      } else if (open && event.key === 'Escape') {
        event.preventDefault();
        onOpenChange(false);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [onOpenChange, open]);

  useEffect(() => {
    if (!open) {
      setQuery('');
      return;
    }
    const frame = requestAnimationFrame(() => inputRef.current?.focus());
    return () => cancelAnimationFrame(frame);
  }, [open]);

  useEffect(() => {
    const term = query.trim();
    if (!open || !term || /^(title|tag|type|due|project|is):/i.test(term)) {
      setIndexedPages(null);
      return;
    }
    let disposed = false;
    const timer = window.setTimeout(() => {
      void searchApi.search(term, {}, 30).then((matches) => {
        if (disposed) return;
        setIndexedPages(matches.map((match) => ({
          id: match.pageId,
          title: match.title,
          excerpt: match.snippet,
          tags: match.tags,
          updatedAt: match.updatedAt,
        })));
      }).catch(() => {
        if (!disposed) setIndexedPages(null);
      });
    }, 80);
    return () => {
      disposed = true;
      window.clearTimeout(timer);
    };
  }, [open, query, searchApi]);

  useEffect(() => {
    if (!open || tasks.length > 0) return;
    let disposed = false;
    void taskApi.list({ filter: 'all' }).then((items) => {
      if (disposed) return;
      setBackendTasks(items.map((task) => ({
        id: task.id,
        title: task.text,
        status: task.completed ? 'done' : 'open',
        pageId: task.pageId,
        tags: [],
        projectId: task.projectId,
        dueDate: task.dueDate,
        startDate: task.startDate,
        assignee: task.assignee,
      })));
    }).catch(() => {
      if (!disposed) setBackendTasks([]);
    });
    return () => { disposed = true; };
  }, [open, taskApi, tasks.length]);

  const searchableTasks = tasks.length > 0 ? tasks : backendTasks;

  const results = useMemo(() => searchWorkspace({
    query,
    commands,
    context,
    pages: indexedPages ?? pages,
    tasks: searchableTasks,
    recentPageIds,
    limit: 30,
  }), [commands, context, indexedPages, pages, query, recentPageIds, searchableTasks]);

  if (!open) return null;

  const choose = (result: CommandSearchResult) => {
    if (result.group === 'commands') {
      void result.command.run(context);
    } else if (result.group === 'pages' || result.group === 'projects') {
      onPageSelect(result.page);
    } else {
      onTaskSelect(result.task);
    }
    onOpenChange(false);
  };

  return (
    <div className="command-palette-layer" data-workspace-overlay>
      <button
        type="button"
        className="command-palette-backdrop"
        aria-label="명령 팔레트 닫기"
        onClick={() => onOpenChange(false)}
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-label="명령 또는 검색"
        className="command-palette-dialog"
      >
        <Command
          shouldFilter={false}
          loop
          label="명령 또는 검색"
          className="command-palette-command"
        >
          <div className="command-palette-input-row">
            <Search aria-hidden="true" size={17} />
            <Command.Input
              ref={inputRef}
              value={query}
              onValueChange={setQuery}
              aria-label="명령 또는 검색"
              placeholder="명령, 문서 또는 작업 검색…"
            />
            <kbd>Esc</kbd>
          </div>
          <Command.List className="command-palette-results">
            <Command.Empty>일치하는 명령, 문서 또는 작업이 없습니다.</Command.Empty>
            {(['commands', 'projects', 'pages', 'tasks'] as const).map((group) => {
              const items = byGroup(results, group);
              if (items.length === 0) return null;
              const label = group === 'pages' && query.trim() === ''
                ? '최근 문서'
                : GROUP_LABELS[group];
              return (
                <Command.Group key={group} heading={label}>
                  {items.map((result) => (
                    <Command.Item
                      key={result.id}
                      value={result.id}
                      onSelect={() => choose(result)}
                    >
                      <span className="command-palette-item-copy">
                        <span className="command-palette-item-label">{result.label}</span>
                        {result.description ? (
                          <span className="command-palette-item-description">{result.description}</span>
                        ) : null}
                      </span>
                      {result.group === 'commands' && result.shortcut ? <kbd>{result.shortcut}</kbd> : null}
                    </Command.Item>
                  ))}
                </Command.Group>
              );
            })}
          </Command.List>
          <footer className="command-palette-footer">
            <span><kbd>↑↓</kbd> 이동</span>
            <span><kbd>↵</kbd> 열기</span>
            <span><code>title:</code> · <code>tag:</code> · <code>type:</code> · <code>due:</code> · <code>project:</code> · <code>is:</code></span>
          </footer>
        </Command>
      </div>
    </div>
  );
}
