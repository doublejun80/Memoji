use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct TaskRecord {
    pub id: String,
    pub page_id: String,
    pub page_title: String,
    pub project_id: Option<String>,
    pub text: String,
    pub completed: bool,
    pub due_date: Option<String>,
    pub start_date: Option<String>,
    pub assignee: Option<String>,
    pub priority: Option<u8>,
    pub line: usize,
    pub source_start: usize,
    pub source_end: usize,
    pub source_hash: String,
    pub updated_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct TaskListRequest {
    #[serde(default = "default_filter")]
    pub filter: String,
    pub page_id: Option<String>,
    pub project_id: Option<String>,
    pub reference_date: Option<String>,
}

fn default_filter() -> String {
    "inbox".to_string()
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct UpdateTaskRequest {
    pub id: String,
    pub completed: bool,
    pub due_date: Option<String>,
    pub start_date: Option<String>,
    pub assignee: Option<String>,
    pub priority: Option<u8>,
    pub expected_hash: String,
}
