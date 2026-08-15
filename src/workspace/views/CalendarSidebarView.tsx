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
        <p className="workspace-sidebar-empty">연결된 일정 데이터가 없습니다.</p>
      </section>
    </div>
  );
}
