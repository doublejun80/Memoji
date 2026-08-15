import { CheckCircle2, Circle } from 'lucide-react';
import type { Page } from '../types';

interface MarkdownTask {
  line: number;
  done: boolean;
  title: string;
}

export function parseMarkdownTasks(markdown: string): MarkdownTask[] {
  return markdown.split(/\r?\n/).flatMap((line, index) => {
    const match = line.match(/^\s*[-*+]\s+\[([ xX])\]\s+(.+)$/);
    if (!match) return [];
    return [{ line: index + 1, done: match[1].toLowerCase() === 'x', title: match[2].trim() }];
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
          <span>{task.title}</span>
          <small>L{task.line}</small>
        </div>
      ))}
    </div>
  );
}
