import { CalendarPlus, ChevronLeft, ChevronRight, Plus, X } from 'lucide-react';
import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react';
import { toast } from 'sonner';
import type { CalendarApi } from '../../shared/api/calendarApi';
import { tauriCalendarApi } from '../../shared/api/calendarApi';
import type { Page } from '../../types';
import { getEnvironment } from '../../utils/environment';
import { DayView } from './DayView';
import type { CalendarItemDto, CalendarMode, UpsertCalendarEvent } from './eventTypes';
import { addDays, dateKey } from './eventTypes';
import { MonthView } from './MonthView';
import { WeekView } from './WeekView';

interface CalendarWorkspaceProps {
  pages: Page[];
  selectedDate: Date;
  onDateSelect: (date: Date) => void;
  onPageOpen: (page: Page) => void | Promise<void>;
  api?: CalendarApi;
}

function visibleRange(date: Date, mode: CalendarMode) {
  if (mode === 'day') return { startDate: dateKey(date), endDate: dateKey(date) };
  if (mode === 'week') {
    const start = addDays(date, -date.getDay());
    return { startDate: dateKey(start), endDate: dateKey(addDays(start, 6)) };
  }
  const first = new Date(date.getFullYear(), date.getMonth(), 1);
  const last = new Date(date.getFullYear(), date.getMonth() + 1, 0);
  return { startDate: dateKey(addDays(first, -first.getDay())), endDate: dateKey(addDays(last, 6 - last.getDay())) };
}

function projectedLocalTasks(pages: Page[], range: { startDate: string; endDate: string }): CalendarItemDto[] {
  return pages.flatMap((page) => page.content.split(/\r?\n/).flatMap((line, index) => {
    const match = line.match(/^\s*[-*+]\s+\[([ xX])\]\s+(.+?)\s+@due\((\d{4}-\d{2}-\d{2})\)(?:\s+!p([1-3]))?/);
    if (!match || match[3] < range.startDate || match[3] > range.endDate) return [];
    return [{
      kind: 'task', id: `${page.id}:${index + 1}`, title: match[2], startAt: match[3], endAt: null,
      allDay: true, timezone: 'local', pageId: page.id, pageTitle: page.title,
      completed: match[1].toLowerCase() === 'x', priority: Number(match[4] ?? 0) || null,
    } satisfies CalendarItemDto];
  }));
}

export function CalendarWorkspace({ pages, selectedDate, onDateSelect, onPageOpen, api = tauriCalendarApi }: CalendarWorkspaceProps) {
  const [mode, setMode] = useState<CalendarMode>('month');
  const [cursor, setCursor] = useState(() => new Date(selectedDate));
  const [items, setItems] = useState<CalendarItemDto[]>([]);
  const [localEvents, setLocalEvents] = useState<CalendarItemDto[]>([]);
  const [formOpen, setFormOpen] = useState(false);
  const [title, setTitle] = useState('');
  const [eventDate, setEventDate] = useState(dateKey(selectedDate));
  const [time, setTime] = useState('09:00');
  const [allDay, setAllDay] = useState(true);
  const [pageId, setPageId] = useState('');
  const native = Boolean(getEnvironment().isTauri) || api !== tauriCalendarApi;
  const range = useMemo(() => visibleRange(cursor, mode), [cursor, mode]);

  const load = useCallback(async () => {
    try {
      setItems(native
        ? await api.list(range)
        : [...projectedLocalTasks(pages, range), ...localEvents.filter((item) => item.startAt.slice(0, 10) >= range.startDate && item.startAt.slice(0, 10) <= range.endDate)]);
    } catch (error) {
      toast.error(`캘린더를 불러오지 못했습니다: ${String(error)}`);
      setItems([]);
    }
  }, [api, localEvents, native, pages, range]);

  useEffect(() => { void load(); }, [load]);
  useEffect(() => {
    setCursor(new Date(selectedDate));
    setEventDate(dateKey(selectedDate));
  }, [selectedDate]);

  const selectDate = (date: Date) => {
    setCursor(date);
    setEventDate(dateKey(date));
    onDateSelect(date);
  };
  const openItem = (item: CalendarItemDto) => {
    if (!item.pageId) return;
    const page = pages.find((candidate) => candidate.id === item.pageId);
    if (page) void onPageOpen(page);
  };
  const move = (direction: -1 | 1) => {
    const next = new Date(cursor);
    if (mode === 'month') next.setMonth(next.getMonth() + direction);
    else next.setDate(next.getDate() + direction * (mode === 'week' ? 7 : 1));
    setCursor(next);
  };
  const saveEvent = async (event: FormEvent) => {
    event.preventDefault();
    if (!title.trim()) return;
    const request: UpsertCalendarEvent = {
      id: `event-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      title: title.trim(),
      startAt: allDay ? eventDate : `${eventDate}T${time}:00`,
      endAt: null,
      allDay,
      timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || 'local',
      pageId: pageId || null,
      notes: '',
    };
    try {
      if (native) await api.save(request);
      else setLocalEvents((current) => [...current, { ...request, kind: 'event', pageTitle: pages.find((page) => page.id === pageId)?.title, completed: null, priority: null }]);
      setTitle('');
      setFormOpen(false);
      await load();
    } catch (error) {
      toast.error(`일정을 저장하지 못했습니다: ${String(error)}`);
    }
  };
  const deleteItem = async (item: CalendarItemDto) => {
    try {
      if (native) await api.delete(item.id);
      else setLocalEvents((current) => current.filter((candidate) => candidate.id !== item.id));
      await load();
    } catch (error) {
      toast.error(`일정을 삭제하지 못했습니다: ${String(error)}`);
    }
  };

  return (
    <section className="calendar-workspace" aria-label="캘린더 공간">
      <header className="calendar-workspace-header">
        <div className="calendar-title"><span>OFFLINE CALENDAR</span><h2>{cursor.getFullYear()}년 {cursor.getMonth() + 1}월</h2></div>
        <div className="calendar-navigation">
          <button type="button" aria-label="이전 기간" onClick={() => move(-1)}><ChevronLeft aria-hidden="true" /></button>
          <button type="button" onClick={() => selectDate(new Date())}>오늘</button>
          <button type="button" aria-label="다음 기간" onClick={() => move(1)}><ChevronRight aria-hidden="true" /></button>
        </div>
        <div className="calendar-mode" aria-label="캘린더 보기">
          {(['month', 'week', 'day'] as const).map((value) => <button type="button" data-active={mode === value ? 'true' : 'false'} key={value} onClick={() => setMode(value)}>{value === 'month' ? '월' : value === 'week' ? '주' : '일'}</button>)}
        </div>
        <button type="button" className="calendar-add" onClick={() => setFormOpen(true)}><Plus aria-hidden="true" />새 일정</button>
      </header>
      {formOpen ? (
        <form className="calendar-event-form" onSubmit={saveEvent}>
          <CalendarPlus aria-hidden="true" /><input aria-label="일정 제목" value={title} onChange={(event) => setTitle(event.target.value)} placeholder="일정 제목" autoFocus />
          <input aria-label="일정 날짜" type="date" value={eventDate} onChange={(event) => setEventDate(event.target.value)} />
          {!allDay ? <input aria-label="시작 시간" type="time" value={time} onChange={(event) => setTime(event.target.value)} /> : null}
          <label><input type="checkbox" checked={allDay} onChange={(event) => setAllDay(event.target.checked)} />종일</label>
          <select aria-label="연결 문서" value={pageId} onChange={(event) => setPageId(event.target.value)}><option value="">문서 연결 없음</option>{pages.filter((page) => page.type === 'page').map((page) => <option key={page.id} value={page.id}>{page.title}</option>)}</select>
          <button type="submit">저장</button><button type="button" aria-label="일정 입력 닫기" onClick={() => setFormOpen(false)}><X aria-hidden="true" /></button>
        </form>
      ) : null}
      <div className="calendar-workspace-body">
        {mode === 'month' ? <MonthView date={cursor} selectedDate={selectedDate} items={items} onDateSelect={selectDate} onItemOpen={openItem} /> : null}
        {mode === 'week' ? <WeekView date={cursor} items={items} onDateSelect={selectDate} onItemOpen={openItem} /> : null}
        {mode === 'day' ? <DayView date={cursor} items={items} onItemOpen={openItem} onDelete={(item) => void deleteItem(item)} /> : null}
      </div>
    </section>
  );
}
