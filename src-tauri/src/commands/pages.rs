use crate::domain::page::{
    PageBody, PageRevision, PageSummary, SavePageV2Request, SavePageV2Response,
};
use crate::services::page_service::PageService;
use crate::AppState;
use tauri::State;

#[tauri::command]
pub fn list_page_summaries(state: State<'_, AppState>) -> Result<Vec<PageSummary>, String> {
    let database = state.db.lock().map_err(|error| error.to_string())?;
    PageService::list_summaries(database.connection()).map_err(|error| error.to_string())
}

#[tauri::command]
pub fn get_page_body(page_id: String, state: State<'_, AppState>) -> Result<PageBody, String> {
    let database = state.db.lock().map_err(|error| error.to_string())?;
    PageService::get_body(database.connection(), &page_id).map_err(|error| error.to_string())
}

#[tauri::command]
pub fn save_page_v2(
    request: SavePageV2Request,
    state: State<'_, AppState>,
) -> Result<SavePageV2Response, String> {
    let mut database = state.db.lock().map_err(|error| error.to_string())?;
    PageService::save(database.connection_mut(), request).map_err(|error| error.to_string())
}

#[tauri::command]
pub fn trash_page(page_id: String, state: State<'_, AppState>) -> Result<(), String> {
    let mut database = state.db.lock().map_err(|error| error.to_string())?;
    PageService::trash(database.connection_mut(), &page_id).map_err(|error| error.to_string())
}

#[tauri::command]
pub fn restore_page(page_id: String, state: State<'_, AppState>) -> Result<(), String> {
    let mut database = state.db.lock().map_err(|error| error.to_string())?;
    PageService::restore(database.connection_mut(), &page_id).map_err(|error| error.to_string())
}

#[tauri::command]
pub fn list_page_revisions(
    page_id: String,
    state: State<'_, AppState>,
) -> Result<Vec<PageRevision>, String> {
    let database = state.db.lock().map_err(|error| error.to_string())?;
    PageService::list_revisions(database.connection(), &page_id).map_err(|error| error.to_string())
}

#[tauri::command]
pub fn restore_page_revision(
    page_id: String,
    revision: i64,
    base_revision: i64,
    state: State<'_, AppState>,
) -> Result<PageBody, String> {
    let mut database = state.db.lock().map_err(|error| error.to_string())?;
    PageService::restore_revision(database.connection_mut(), &page_id, revision, base_revision)
        .map_err(|error| error.to_string())
}
