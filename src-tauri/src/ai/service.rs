use crate::ai::prompts::{
    build_prompt, PromptBuildRequest, DEFAULT_GENERATION_PREFIX, DEFAULT_OUTPUT_SCHEMA,
    DEFAULT_SYSTEM_PROMPT,
};
use crate::ai::retrieval::{retrieve, RetrievalRequest, RetrievalSource};
use rusqlite::{params, Connection};
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};

fn default_context_chars() -> usize {
    12_000
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AiRunRequest {
    pub id: String,
    pub page_id: Option<String>,
    pub prompt: String,
    pub current_page_context: Option<String>,
    pub current_project_id: Option<String>,
    pub object_type: Option<String>,
    pub context_scope: Option<String>,
    #[serde(default = "default_context_chars")]
    pub max_context_chars: usize,
}

#[derive(Debug, Clone, Serialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct PreparedAiRun {
    pub run_id: String,
    pub prompt: String,
    pub prompt_sha256: String,
    pub sources: Vec<RetrievalSource>,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct FinishAiRunRequest {
    pub id: String,
    pub status: String,
    pub runtime_family: Option<String>,
    pub prompt_tokens: Option<usize>,
    pub generated_tokens: Option<usize>,
    pub error_code: Option<String>,
}

pub struct AiService;

impl AiService {
    pub fn prepare_run(
        connection: &mut Connection,
        request: AiRunRequest,
    ) -> Result<PreparedAiRun, String> {
        if request.id.trim().is_empty() || request.prompt.trim().is_empty() {
            return Err("AI run requires a request id and prompt".to_string());
        }
        let context_scope = request.context_scope.as_deref().unwrap_or("workspace");
        if !matches!(
            context_scope,
            "none" | "page" | "project" | "linked" | "workspace"
        ) {
            return Err(format!("Invalid AI context scope: {context_scope}"));
        }
        let sources = retrieve(
            connection,
            &RetrievalRequest {
                query: request.prompt.clone(),
                current_page_id: request.page_id.clone(),
                current_project_id: request.current_project_id.clone(),
                object_type: request.object_type.clone(),
                context_scope: Some(context_scope.to_string()),
                limit: 6,
            },
        )
        .map_err(|error| error.to_string())?;
        let current_page = (context_scope != "none")
            .then_some(request.current_page_context)
            .flatten()
            .or_else(|| {
                if context_scope == "none" {
                    return None;
                }
                request.page_id.as_deref().and_then(|page_id| {
                    connection
                        .query_row(
                            "SELECT content FROM pages WHERE id=?1 AND deleted_at IS NULL",
                            [page_id],
                            |row| row.get(0),
                        )
                        .ok()
                })
            });
        let prompt = build_prompt(&PromptBuildRequest {
            system: DEFAULT_SYSTEM_PROMPT,
            schema: DEFAULT_OUTPUT_SCHEMA,
            current_page: current_page.as_deref(),
            sources: &sources,
            user: request.prompt.trim(),
            generation_prefix: DEFAULT_GENERATION_PREFIX,
            max_chars: request.max_context_chars.clamp(1_000, 64_000),
        });
        let prompt_sha256 = format!("{:x}", Sha256::digest(prompt.as_bytes()));
        let prompt_char_count = prompt.chars().count();
        let created_at = chrono::Utc::now().to_rfc3339();
        let transaction = connection
            .transaction()
            .map_err(|error| error.to_string())?;
        transaction
            .execute(
                "INSERT INTO ai_runs (
                    id,page_id,status,prompt_sha256,prompt_char_count,object_type,created_at
                 ) VALUES (?1,?2,'running',?3,?4,?5,?6)",
                params![
                    request.id,
                    request.page_id,
                    prompt_sha256,
                    prompt_char_count,
                    request.object_type.unwrap_or_else(|| "page".to_string()),
                    created_at,
                ],
            )
            .map_err(|error| error.to_string())?;
        for (rank, source) in sources.iter().enumerate() {
            transaction
                .execute(
                    "INSERT INTO ai_run_sources (
                        run_id,rank,page_id,anchor_slug,heading_path_json,snippet,score,
                        source_start,source_end,text_hash
                     ) VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9,?10)",
                    params![
                        request.id,
                        rank as i64 + 1,
                        source.page_id,
                        source.anchor,
                        serde_json::to_string(&source.heading_path)
                            .map_err(|error| error.to_string())?,
                        source.snippet,
                        source.score,
                        source.start.map(|value| value as i64),
                        source.end.map(|value| value as i64),
                        source.text_hash,
                    ],
                )
                .map_err(|error| error.to_string())?;
        }
        transaction.commit().map_err(|error| error.to_string())?;

        Ok(PreparedAiRun {
            run_id: request.id,
            prompt,
            prompt_sha256,
            sources,
        })
    }

    pub fn finish_run(connection: &Connection, request: FinishAiRunRequest) -> Result<(), String> {
        if !matches!(
            request.status.as_str(),
            "completed" | "failed" | "cancelled"
        ) {
            return Err(format!("Invalid AI run status: {}", request.status));
        }
        let updated = connection
            .execute(
                "UPDATE ai_runs
                 SET status=?2,runtime_family=?3,prompt_tokens=?4,generated_tokens=?5,
                     error_code=?6,finished_at=?7
                 WHERE id=?1 AND status='running'",
                params![
                    request.id,
                    request.status,
                    request.runtime_family,
                    request.prompt_tokens.map(|value| value as i64),
                    request.generated_tokens.map(|value| value as i64),
                    request
                        .error_code
                        .map(|value| value.chars().take(80).collect::<String>()),
                    chrono::Utc::now().to_rfc3339(),
                ],
            )
            .map_err(|error| error.to_string())?;
        if updated == 0 {
            return Err("AI run was not found or already finished".to_string());
        }
        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::db::connection::configure_connection;
    use crate::db::migrations::migrate_with_backup;
    use crate::indexing::worker::IndexWorker;

    fn connection() -> Connection {
        let mut connection = Connection::open_in_memory().expect("in-memory DB");
        configure_connection(&connection).expect("connection pragmas");
        migrate_with_backup(&mut connection, |_connection| Ok(())).expect("schema");
        connection
    }

    fn insert_page(connection: &Connection, id: &str, body: &str) {
        connection
            .execute(
                "INSERT INTO pages (
                id,title,icon,parent_id,project_parent_id,project_index,date_key,content,
                created_at,updated_at,type,tags,page_order,workspace_id,revision,deleted_at
             ) VALUES (?1,'근거','📄',NULL,NULL,0,NULL,?2,
                '2026-08-16T00:00:00Z','2026-08-16T00:00:00Z','page','[]',0,'default',1,NULL)",
                params![id, body],
            )
            .expect("insert page");
        IndexWorker::replace_page_index(connection, id, "근거", body, &[]).expect("index");
    }

    #[test]
    fn run_records_prompt_hash_and_ranked_sources_but_never_prompt_body() {
        let mut connection = connection();
        insert_page(&connection, "source", "# 출시\n비밀검색어 배포 근거");
        let prepared = AiService::prepare_run(
            &mut connection,
            AiRunRequest {
                id: "run-1".to_string(),
                page_id: None,
                prompt: "비밀검색어".to_string(),
                current_page_context: None,
                current_project_id: None,
                object_type: Some("page".to_string()),
                context_scope: Some("workspace".to_string()),
                max_context_chars: 2_000,
            },
        )
        .expect("prepare");

        assert_eq!(prepared.prompt_sha256.len(), 64);
        let stored: (String, i64) = connection
            .query_row(
                "SELECT prompt_sha256,prompt_char_count FROM ai_runs WHERE id='run-1'",
                [],
                |row| Ok((row.get(0)?, row.get(1)?)),
            )
            .expect("run row");
        assert_eq!(stored.0, prepared.prompt_sha256);
        assert!(stored.1 > 0);
        let columns = connection
            .prepare("PRAGMA table_info(ai_runs)")
            .unwrap()
            .query_map([], |row| row.get::<_, String>(1))
            .unwrap()
            .collect::<rusqlite::Result<Vec<_>>>()
            .unwrap();
        assert!(!columns
            .iter()
            .any(|column| column == "prompt" || column == "prompt_body"));
        let ranks = connection
            .prepare("SELECT rank FROM ai_run_sources WHERE run_id='run-1' ORDER BY rank")
            .unwrap()
            .query_map([], |row| row.get::<_, i64>(0))
            .unwrap()
            .collect::<rusqlite::Result<Vec<_>>>()
            .unwrap();
        assert_eq!(ranks, (1..=ranks.len() as i64).collect::<Vec<_>>());
    }
}
