import type { ReactNode } from 'react';
import { CalendarDays, CheckSquare2, Network, Search } from 'lucide-react';
import type { WorkspaceView } from '../app/workspaceState';

interface WorkspaceCanvasProps {
  view: WorkspaceView;
  editor: ReactNode;
}

const EMPTY_VIEWS = {
  tasks: {
    label: '작업 공간',
    title: '작업을 한곳에서 관리하세요',
    body: '문서의 Markdown 작업을 인덱싱하면 상태와 마감일별 보기가 활성화됩니다.',
    icon: CheckSquare2,
  },
  calendar: {
    label: '캘린더 공간',
    title: '일정과 데일리 노트를 연결하세요',
    body: 'V3 이벤트 저장소가 연결되면 일·주·월 일정과 관련 문서를 함께 표시합니다.',
    icon: CalendarDays,
  },
  knowledge: {
    label: '지식 공간',
    title: '문서 사이의 연결을 탐색하세요',
    body: '링크와 태그 인덱스가 준비되면 백링크, 고립 문서, 관계 지도를 제공합니다.',
    icon: Network,
  },
  search: {
    label: '검색 공간',
    title: '작업 공간 전체 검색',
    body: 'Ctrl+K로 문서, 작업, 명령을 즉시 찾을 수 있습니다.',
    icon: Search,
  },
} as const;

export function WorkspaceCanvas({ view, editor }: WorkspaceCanvasProps) {
  if (view === 'editor') return <>{editor}</>;
  const empty = EMPTY_VIEWS[view];
  const Icon = empty.icon;
  return (
    <section className="workspace-canvas-empty" role="region" aria-label={empty.label}>
      <Icon aria-hidden="true" />
      <h2>{empty.title}</h2>
      <p>{empty.body}</p>
      {view === 'search' ? <kbd>Ctrl K</kbd> : null}
    </section>
  );
}
