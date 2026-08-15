import type { CalendarItemDto } from './eventTypes';
import { addDays, dateKey, itemsForDate } from './eventTypes';

interface MonthViewProps {
  date: Date;
  selectedDate: Date;
  items: CalendarItemDto[];
  onDateSelect: (date: Date) => void;
  onItemOpen: (item: CalendarItemDto) => void;
}

const WEEKDAYS = ['일', '월', '화', '수', '목', '금', '토'];

export function MonthView({ date, selectedDate, items, onDateSelect, onItemOpen }: MonthViewProps) {
  const monthStart = new Date(date.getFullYear(), date.getMonth(), 1);
  const gridStart = addDays(monthStart, -monthStart.getDay());
  const days = Array.from({ length: 42 }, (_, index) => addDays(gridStart, index));
  return (
    <div className="calendar-month" role="grid" aria-label={`${date.getFullYear()}년 ${date.getMonth() + 1}월`}>
      {WEEKDAYS.map((weekday) => <div className="calendar-weekday" role="columnheader" key={weekday}>{weekday}</div>)}
      {days.map((day) => {
        const dayItems = itemsForDate(items, day);
        const key = dateKey(day);
        return (
          <div
            className="calendar-day-cell"
            data-outside={day.getMonth() !== date.getMonth() ? 'true' : 'false'}
            data-selected={key === dateKey(selectedDate) ? 'true' : 'false'}
            role="gridcell"
            key={key}
          >
            <button type="button" className="calendar-date-button" aria-label={`${key} 선택`} onClick={() => onDateSelect(day)}>{day.getDate()}</button>
            <div className="calendar-cell-items">
              {dayItems.slice(0, 3).map((item) => (
                <button type="button" data-kind={item.kind} key={`${item.kind}-${item.id}`} onClick={() => onItemOpen(item)}>
                  <span>{item.allDay ? '' : item.startAt.slice(11, 16)}</span>{item.title}
                </button>
              ))}
              {dayItems.length > 3 ? <small>+{dayItems.length - 3}</small> : null}
            </div>
          </div>
        );
      })}
    </div>
  );
}
