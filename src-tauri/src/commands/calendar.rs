use crate::calendar::service::CalendarService;
use crate::domain::event::{CalendarItem, CalendarRangeRequest, EventRecord, UpsertEventRequest};
use crate::AppState;
use tauri::State;

#[tauri::command]
pub fn list_calendar_items(
    request: CalendarRangeRequest,
    state: State<'_, AppState>,
) -> Result<Vec<CalendarItem>, String> {
    let database = state.db.lock().map_err(|error| error.to_string())?;
    CalendarService::list_items(database.connection(), &request).map_err(|error| error.to_string())
}

#[tauri::command]
pub fn save_calendar_event(
    request: UpsertEventRequest,
    state: State<'_, AppState>,
) -> Result<EventRecord, String> {
    let database = state.db.lock().map_err(|error| error.to_string())?;
    CalendarService::save(database.connection(), &request).map_err(|error| error.to_string())
}

#[tauri::command]
pub fn delete_calendar_event(id: String, state: State<'_, AppState>) -> Result<(), String> {
    let database = state.db.lock().map_err(|error| error.to_string())?;
    CalendarService::delete(database.connection(), &id).map_err(|error| error.to_string())
}

#[tauri::command]
pub fn export_calendar_ics(
    request: CalendarRangeRequest,
    state: State<'_, AppState>,
) -> Result<String, String> {
    let database = state.db.lock().map_err(|error| error.to_string())?;
    CalendarService::export_range(database.connection(), &request)
        .map_err(|error| error.to_string())
}

#[tauri::command]
pub fn import_calendar_ics(
    source: String,
    state: State<'_, AppState>,
) -> Result<Vec<EventRecord>, String> {
    let database = state.db.lock().map_err(|error| error.to_string())?;
    CalendarService::import(database.connection(), &source).map_err(|error| error.to_string())
}
