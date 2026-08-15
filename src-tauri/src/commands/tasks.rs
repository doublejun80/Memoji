use crate::domain::task::{TaskListRequest, TaskRecord, UpdateTaskRequest};
use crate::tasks::service::TaskService;
use crate::AppState;
use tauri::State;

#[tauri::command]
pub fn list_tasks(
    request: TaskListRequest,
    state: State<'_, AppState>,
) -> Result<Vec<TaskRecord>, String> {
    let database = state.db.lock().map_err(|error| error.to_string())?;
    TaskService::list(database.connection(), &request).map_err(|error| error.to_string())
}

#[tauri::command]
pub fn update_task(
    request: UpdateTaskRequest,
    state: State<'_, AppState>,
) -> Result<TaskRecord, String> {
    let mut database = state.db.lock().map_err(|error| error.to_string())?;
    TaskService::update(database.connection_mut(), &request).map_err(|error| error.to_string())
}
