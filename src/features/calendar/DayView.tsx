import { CalendarClock, CheckSquare2, FileText, Trash2 } from 'lucide-react';
import type { CalendarItemDto } from './eventTypes';
import { itemsForDate } from './eventTypes';

interface DayViewProps {
  date: Date;
  items: CalendarItemDto[];
  onItemOpen: (item: CalendarItemDto) => void;
  onDelete: (item: CalendarItemDto) => void;
}

export function DayView({ date, items, onItemOpen, onDelete }: DayViewProps) {
  const dayItems = itemsForDate(items, date);
  if (dayItems.length === 0) return <div className="calendar-day-empty" role="status">이 날짜에는 일정이나 마감 작업이 없습니다.</div>;
  return (
    <div className="calendar-agenda" role="list" aria-label="일간 일정">
      {dayItems.map((item) => (
        <article role="listitem" data-kind={item.kind} key={`${item.kind}-${item.id}`}>
          {item.kind === 'task' ? <CheckSquare2 aria-hidden="true" /> : <CalendarClock aria-hidden="true" />}
          <button type="button" className="calendar-agenda-main" onClick={() => onItemOpen(item)}>
            <strong>{item.title}</strong>
            <span>{item.allDay ? '종일' : item.startAt.slice(11, 16)} · {item.kind === 'task' ? '작업 마감' : item.timezone}</span>
          </button>
          {item.pageTitle ? <span className="calendar-linked-page"><FileText aria-hidden="true" />{item.pageTitle}</span> : null}
          {item.kind === 'event' ? <button type="button" className="calendar-delete" aria-label={`${item.title} 삭제`} onClick={() => onDelete(item)}><Trash2 aria-hidden="true" /></button> : null}
        </article>
      ))}
    </div>
  );
}
