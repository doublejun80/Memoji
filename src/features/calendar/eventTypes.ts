export type CalendarMode = 'month' | 'week' | 'day';

export interface CalendarItemDto {
  kind: 'event' | 'task';
  id: string;
  title: string;
  startAt: string;
  endAt?: string | null;
  allDay: boolean;
  timezone: string;
  pageId?: string | null;
  pageTitle?: string | null;
  completed?: boolean | null;
  priority?: number | null;
}

export interface CalendarEventDto {
  id: string;
  title: string;
  startAt: string;
  endAt?: string | null;
  allDay: boolean;
  timezone: string;
  pageId?: string | null;
  pageTitle?: string | null;
  notes: string;
  createdAt: string;
  updatedAt: string;
}

export interface UpsertCalendarEvent {
  id: string;
  title: string;
  startAt: string;
  endAt?: string | null;
  allDay: boolean;
  timezone: string;
  pageId?: string | null;
  notes: string;
}

export interface CalendarRange {
  startDate: string;
  endDate: string;
}

export function dateKey(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export function addDays(date: Date, amount: number): Date {
  const next = new Date(date);
  next.setDate(next.getDate() + amount);
  return next;
}

export function itemsForDate(items: CalendarItemDto[], date: Date): CalendarItemDto[] {
  const key = dateKey(date);
  return items.filter((item) => item.startAt.slice(0, 10) === key);
}
