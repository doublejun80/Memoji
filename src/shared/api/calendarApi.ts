import { invoke } from '@tauri-apps/api/core';
import type {
  CalendarEventDto,
  CalendarItemDto,
  CalendarRange,
  UpsertCalendarEvent,
} from '../../features/calendar/eventTypes';
import { TAURI_COMMANDS } from './tauriCommands';

export interface CalendarApi {
  list(request: CalendarRange): Promise<CalendarItemDto[]>;
  save(request: UpsertCalendarEvent): Promise<CalendarEventDto>;
  delete(id: string): Promise<void>;
  exportIcs(request: CalendarRange): Promise<string>;
  importIcs(source: string): Promise<CalendarEventDto[]>;
}

export const tauriCalendarApi: CalendarApi = {
  list: (request) => invoke(TAURI_COMMANDS.listCalendarItems, { request }),
  save: (request) => invoke(TAURI_COMMANDS.saveCalendarEvent, { request }),
  delete: (id) => invoke(TAURI_COMMANDS.deleteCalendarEvent, { id }),
  exportIcs: (request) => invoke(TAURI_COMMANDS.exportCalendarIcs, { request }),
  importIcs: (source) => invoke(TAURI_COMMANDS.importCalendarIcs, { source }),
};
