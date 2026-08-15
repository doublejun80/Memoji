import { CheckSquare2 } from 'lucide-react';

export function TasksSidebarView() {
  return (
    <div className="workspace-sidebar-scroll" data-sidebar-view="tasks">
      <header className="workspace-sidebar-view-header"><h2>작업</h2></header>
      <div className="workspace-sidebar-zero-state">
        <CheckSquare2 aria-hidden="true" />
        <strong>열린 작업이 없습니다</strong>
        <p>Markdown 작업 인덱스가 연결되면 문서별 할 일을 여기서 모아봅니다.</p>
      </div>
    </div>
  );
}
