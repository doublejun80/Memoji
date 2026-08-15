use crate::search::{
    list_page_anchors as list_anchors, list_page_links as list_links, search, PageAnchorView,
    PageLinkView, SearchRequest, SearchResult,
};
use crate::AppState;
use tauri::State;

#[tauri::command]
pub fn search_workspace(
    request: SearchRequest,
    state: State<'_, AppState>,
) -> Result<Vec<SearchResult>, String> {
    let database = state.db.lock().map_err(|error| error.to_string())?;
    search(database.connection(), &request).map_err(|error| error.to_string())
}

#[tauri::command]
pub fn get_page_anchors(
    page_id: String,
    state: State<'_, AppState>,
) -> Result<Vec<PageAnchorView>, String> {
    let database = state.db.lock().map_err(|error| error.to_string())?;
    list_anchors(database.connection(), &page_id).map_err(|error| error.to_string())
}

#[tauri::command]
pub fn get_page_links(
    page_id: String,
    state: State<'_, AppState>,
) -> Result<Vec<PageLinkView>, String> {
    let database = state.db.lock().map_err(|error| error.to_string())?;
    list_links(database.connection(), &page_id).map_err(|error| error.to_string())
}
