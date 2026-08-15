import { CalendarWidget } from '../../components/CalendarWidget';

interface CalendarSidebarViewProps {
  onDateSelect: (date: Date) => void;
  selectedDate: Date;
  datesWithPages: string[];
}

export function CalendarSidebarView(props: CalendarSidebarViewProps) {
  return (
    <div className="workspace-sidebar-scroll" data-sidebar-view="calendar">
      <header className="workspace-sidebar-view-header"><h2>캘린더</h2></header>
      <div className="workspace-sidebar-calendar">
        <CalendarWidget {...props} />
      </div>
      <section className="workspace-sidebar-section">
        <h3>선택한 날짜</h3>
        <p className="workspace-sidebar-calendar-date">{props.selectedDate.toLocaleDateString('ko-KR', { year: 'numeric', month: 'long', day: 'numeric', weekday: 'long' })}</p>
        <p className="workspace-sidebar-empty">중앙 캘린더에서 일정과 Markdown 작업 마감을 함께 확인합니다.</p>
      </section>
    </div>
  );
}
