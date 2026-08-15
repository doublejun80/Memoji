import { invoke } from '@tauri-apps/api/core';
import type {
  CalendarEventDto,
  CalendarItemDto,
  CalendarRange,
  UpsertCalendarEvent,
} from '../../features/calendar/eventTypes';

export interface CalendarApi {
  list(request: CalendarRange): Promise<CalendarItemDto[]>;
  save(request: UpsertCalendarEvent): Promise<CalendarEventDto>;
  delete(id: string): Promise<void>;
  exportIcs(request: CalendarRange): Promise<string>;
  importIcs(source: string): Promise<CalendarEventDto[]>;
}

export const tauriCalendarApi: CalendarApi = {
  list: (request) => invoke('list_calendar_items', { request }),
  save: (request) => invoke('save_calendar_event', { request }),
  delete: (id) => invoke('delete_calendar_event', { id }),
  exportIcs: (request) => invoke('export_calendar_ics', { request }),
  importIcs: (source) => invoke('import_calendar_ics', { source }),
};
