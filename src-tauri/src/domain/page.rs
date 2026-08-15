use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct PageSummary {
    pub id: String,
    pub title: String,
    pub icon: String,
    pub parent_id: Option<String>,
    pub project_parent_id: Option<String>,
    pub project_index: bool,
    pub date_key: Option<String>,
    pub created_at: String,
    pub updated_at: String,
    #[serde(rename = "type")]
    pub page_type: String,
    pub tags: Vec<String>,
    pub order: i32,
    pub revision: i64,
    pub deleted_at: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct PageBody {
    pub page_id: String,
    pub body_markdown: String,
    pub revision: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct SavePageV2Request {
    pub id: String,
    pub title: String,
    pub icon: String,
    pub parent_id: Option<String>,
    pub project_parent_id: Option<String>,
    pub project_index: bool,
    pub date_key: Option<String>,
    pub body_markdown: String,
    pub created_at: String,
    pub updated_at: String,
    #[serde(rename = "type")]
    pub page_type: String,
    pub tags: Vec<String>,
    pub order: i32,
    pub base_revision: i64,
    #[serde(default = "default_source")]
    pub source: String,
}

fn default_source() -> String {
    "user".to_string()
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct SavePageV2Response {
    pub summary: PageSummary,
    pub body: PageBody,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct PageRevision {
    pub id: i64,
    pub page_id: String,
    pub revision: i64,
    pub body_markdown: String,
    pub created_at: String,
    pub source: String,
}
