import { CheckCircle2, Circle } from 'lucide-react';
import type { Page } from '../types';

interface MarkdownTask {
  line: number;
  done: boolean;
  title: string;
  dueDate?: string;
  priority?: number;
}

export function parseMarkdownTasks(markdown: string): MarkdownTask[] {
  let inFence: '`' | '~' | null = null;
  return markdown.split(/\r?\n/).flatMap((line, index) => {
    const trimmed = line.trimStart();
    const fence = trimmed.startsWith('```') ? '`' : trimmed.startsWith('~~~') ? '~' : null;
    if (fence) {
      inFence = inFence === fence ? null : inFence ?? fence;
      return [];
    }
    if (inFence || trimmed.startsWith('>')) return [];
    const match = line.match(/^\s*[-*+]\s+\[([ xX])\]\s+(.+)$/);
    if (!match) return [];
    const dueDate = match[2].match(/@due\((\d{4}-\d{2}-\d{2})\)/)?.[1];
    const priority = Number(match[2].match(/!p([1-3])/i)?.[1] ?? 0) || undefined;
    const title = match[2]
      .replace(/@due\(\d{4}-\d{2}-\d{2}\)/g, '')
      .replace(/!p[1-3]/gi, '')
      .replace(/<!--\s*memoji-task:[^>]+-->/g, '')
      .trim();
    return [{ line: index + 1, done: match[1].toLowerCase() === 'x', title, dueDate, priority }];
  });
}

export function DocumentTasksPanel({ page }: { page: Page | null }) {
  if (!page) return <div className="context-empty" role="status">선택한 문서가 없습니다.</div>;
  const tasks = parseMarkdownTasks(page.content);
  if (tasks.length === 0) return <div className="context-empty" role="status">이 문서에는 Markdown 작업이 없습니다.</div>;
  return (
    <div className="context-task-list" aria-label="문서 작업">
      {tasks.map((task) => (
        <div className="context-task" key={`${task.line}-${task.title}`} data-done={task.done ? 'true' : 'false'}>
          {task.done ? <CheckCircle2 aria-hidden="true" /> : <Circle aria-hidden="true" />}
          <span>{task.title}<small>{[task.dueDate, task.priority ? `P${task.priority}` : null].filter(Boolean).join(' · ')}</small></span>
          <small>L{task.line}</small>
        </div>
      ))}
    </div>
  );
}
