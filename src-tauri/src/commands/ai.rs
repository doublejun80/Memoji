use crate::ai::proposals::{self, AiProposal, ApplyProposalResult};
use crate::ai::service::{AiRunRequest, AiService, FinishAiRunRequest, PreparedAiRun};
use crate::AppState;
use tauri::State;

#[tauri::command]
pub fn create_ai_run(
    request: AiRunRequest,
    state: State<'_, AppState>,
) -> Result<PreparedAiRun, String> {
    let mut database = state.db.lock().map_err(|error| error.to_string())?;
    AiService::prepare_run(database.connection_mut(), request)
}

#[tauri::command]
pub fn finish_ai_run(
    request: FinishAiRunRequest,
    state: State<'_, AppState>,
) -> Result<(), String> {
    let database = state.db.lock().map_err(|error| error.to_string())?;
    AiService::finish_run(database.connection(), request)
}

#[tauri::command]
pub fn create_ai_proposal(
    proposal: AiProposal,
    state: State<'_, AppState>,
) -> Result<AiProposal, String> {
    let database = state.db.lock().map_err(|error| error.to_string())?;
    proposals::create(database.connection(), proposal).map_err(|error| error.to_string())
}

#[tauri::command]
pub fn get_ai_proposal(id: String, state: State<'_, AppState>) -> Result<AiProposal, String> {
    let database = state.db.lock().map_err(|error| error.to_string())?;
    proposals::get(database.connection(), &id).map_err(|error| error.to_string())
}

#[tauri::command]
pub fn list_ai_proposals(
    page_id: String,
    state: State<'_, AppState>,
) -> Result<Vec<AiProposal>, String> {
    let database = state.db.lock().map_err(|error| error.to_string())?;
    proposals::list_for_page(database.connection(), &page_id).map_err(|error| error.to_string())
}

#[tauri::command]
pub fn apply_ai_proposal(
    id: String,
    state: State<'_, AppState>,
) -> Result<ApplyProposalResult, String> {
    let mut database = state.db.lock().map_err(|error| error.to_string())?;
    proposals::apply(database.connection_mut(), &id).map_err(|error| error.to_string())
}

#[tauri::command]
pub fn reject_ai_proposal(id: String, state: State<'_, AppState>) -> Result<AiProposal, String> {
    let database = state.db.lock().map_err(|error| error.to_string())?;
    proposals::reject(database.connection(), &id).map_err(|error| error.to_string())
}
