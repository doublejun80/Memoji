import { Clock3, FileText, FolderKanban, Sparkles } from 'lucide-react';
import type { Page } from '../../types';
import { getProjectIndexPages } from '../../utils/pageModel';

interface TodaySidebarViewProps {
  dailyPages: Page[];
  pages: Page[];
  currentPage: Page | null;
  onPageSelect: (page: Page, source?: 'daily' | 'project' | 'global') => void;
  onDailyPageCreate: (title: string) => void;
}

function EmptySection({ children }: { children: string }) {
  return <p className="workspace-sidebar-empty">{children}</p>;
}

export function TodaySidebarView({
  dailyPages,
  pages,
  currentPage,
  onPageSelect,
  onDailyPageCreate,
}: TodaySidebarViewProps) {
  const recentProjects = getProjectIndexPages(pages)
    .filter((page) => page.type === 'page')
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
    .slice(0, 4);

  return (
    <div className="workspace-sidebar-scroll" data-sidebar-view="today">
      <header className="workspace-sidebar-view-header">
        <div>
          <span className="workspace-sidebar-eyebrow">TODAY</span>
          <h2>오늘</h2>
        </div>
        <button type="button" className="workspace-sidebar-primary" onClick={() => onDailyPageCreate('새 페이지')}>
          새 문서
        </button>
      </header>

      <section className="workspace-sidebar-section">
        <h3><FileText aria-hidden="true" /> 오늘의 문서</h3>
        {dailyPages.length > 0 ? (
          <div className="workspace-sidebar-list">
            {dailyPages.map((page) => (
              <button
                type="button"
                key={page.id}
                className="workspace-sidebar-row"
                data-active={currentPage?.id === page.id ? 'true' : 'false'}
                onClick={() => onPageSelect(page, 'daily')}
              >
                <span aria-hidden="true">{page.icon || '📄'}</span>
                <span>{page.title}</span>
              </button>
            ))}
          </div>
        ) : <EmptySection>오늘 작성한 문서가 없습니다.</EmptySection>}
      </section>

      <section className="workspace-sidebar-section">
        <h3><Clock3 aria-hidden="true" /> 오늘의 일정과 작업</h3>
        <EmptySection>연결된 일정과 미완료 작업이 없습니다.</EmptySection>
      </section>

      <section className="workspace-sidebar-section">
        <h3><FolderKanban aria-hidden="true" /> 최근 프로젝트</h3>
        {recentProjects.length > 0 ? (
          <div className="workspace-sidebar-list">
            {recentProjects.map((page) => (
              <button
                type="button"
                key={page.id}
                className="workspace-sidebar-row"
                onClick={() => onPageSelect(page, 'project')}
              >
                <span aria-hidden="true">{page.icon || '📄'}</span>
                <span>{page.title}</span>
              </button>
            ))}
          </div>
        ) : <EmptySection>최근 프로젝트가 없습니다.</EmptySection>}
      </section>

      <section className="workspace-sidebar-section">
        <h3><Sparkles aria-hidden="true" /> 검토 대기</h3>
        <EmptySection>대기 중인 AI 제안이 없습니다.</EmptySection>
      </section>
    </div>
  );
}
