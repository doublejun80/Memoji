import type { CalendarItemDto } from './eventTypes';
import { addDays, dateKey, itemsForDate } from './eventTypes';

interface WeekViewProps {
  date: Date;
  items: CalendarItemDto[];
  onDateSelect: (date: Date) => void;
  onItemOpen: (item: CalendarItemDto) => void;
}

export function WeekView({ date, items, onDateSelect, onItemOpen }: WeekViewProps) {
  const start = addDays(date, -date.getDay());
  return (
    <div className="calendar-week" role="grid" aria-label="주간 일정">
      {Array.from({ length: 7 }, (_, index) => addDays(start, index)).map((day) => (
        <section role="gridcell" key={dateKey(day)}>
          <button type="button" className="calendar-week-date" onClick={() => onDateSelect(day)}>
            <span>{day.toLocaleDateString('ko-KR', { weekday: 'short' })}</span><strong>{day.getDate()}</strong>
          </button>
          <div className="calendar-week-items">
            {itemsForDate(items, day).map((item) => (
              <button type="button" data-kind={item.kind} key={`${item.kind}-${item.id}`} onClick={() => onItemOpen(item)}>
                <span>{item.allDay ? '종일' : item.startAt.slice(11, 16)}</span><strong>{item.title}</strong>
              </button>
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}
