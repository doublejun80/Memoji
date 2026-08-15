use crate::ai::retrieval::hash_text_anchor;
use crate::domain::page::{PageBody, SavePageV2Request};
use crate::services::page_service::{PageService, PageServiceError};
use crate::tasks::parser::ensure_task_markers;
use rusqlite::{params, Connection, Transaction};
use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::fmt;

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct TextAnchor {
    pub start: usize,
    pub end: usize,
    pub text_hash: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(
    tag = "kind",
    rename_all = "lowercase",
    rename_all_fields = "camelCase"
)]
pub enum AiPatch {
    Text {
        before: String,
        after: String,
        anchor: TextAnchor,
        context_before: String,
        context_after: String,
    },
    Structured {
        value: Value,
    },
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct AiSource {
    pub page_id: String,
    #[serde(default)]
    pub anchor: Option<String>,
    #[serde(default)]
    pub heading_path: Vec<String>,
    #[serde(default)]
    pub start: Option<usize>,
    #[serde(default)]
    pub end: Option<usize>,
    #[serde(default)]
    pub text_hash: Option<String>,
    #[serde(default)]
    pub label: Option<String>,
    #[serde(default)]
    pub score: Option<f64>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct AiProposal {
    pub id: String,
    pub request_id: String,
    pub page_id: String,
    pub base_revision: i64,
    #[serde(rename = "type")]
    pub proposal_type: String,
    pub title: String,
    pub summary: String,
    pub patch: AiPatch,
    pub sources: Vec<AiSource>,
    pub status: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct ApplyProposalResult {
    pub proposal: AiProposal,
    pub body: PageBody,
}

#[derive(Debug)]
pub enum ProposalError {
    Sqlite(rusqlite::Error),
    Json(serde_json::Error),
    Page(PageServiceError),
    InvalidStatus(String),
    UnsupportedPatch,
    RevisionConflict { expected: i64, actual: i64 },
    AnchorConflict,
}

impl fmt::Display for ProposalError {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            Self::Sqlite(error) => write!(formatter, "AI proposal storage failed: {error}"),
            Self::Json(error) => write!(formatter, "AI proposal JSON failed: {error}"),
            Self::Page(error) => write!(formatter, "AI proposal page update failed: {error}"),
            Self::InvalidStatus(status) => {
                write!(formatter, "AI proposal is not pending: {status}")
            }
            Self::UnsupportedPatch => {
                write!(formatter, "Structured proposal apply is not supported")
            }
            Self::RevisionConflict { expected, actual } => write!(
                formatter,
                "AI proposal revision conflict: expected {expected}, current {actual}",
            ),
            Self::AnchorConflict => write!(formatter, "AI proposal anchor no longer matches"),
        }
    }
}

impl std::error::Error for ProposalError {}

impl From<rusqlite::Error> for ProposalError {
    fn from(error: rusqlite::Error) -> Self {
        Self::Sqlite(error)
    }
}

impl From<serde_json::Error> for ProposalError {
    fn from(error: serde_json::Error) -> Self {
        Self::Json(error)
    }
}

impl From<PageServiceError> for ProposalError {
    fn from(error: PageServiceError) -> Self {
        Self::Page(error)
    }
}

pub fn create(
    connection: &Connection,
    mut proposal: AiProposal,
) -> Result<AiProposal, ProposalError> {
    proposal.status = "pending".to_string();
    let now = chrono::Utc::now().to_rfc3339();
    connection.execute(
        "INSERT INTO ai_proposals (
            id,run_id,page_id,base_revision,proposal_type,title,summary,patch_json,
            sources_json,status,created_at,updated_at
         ) VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9,'pending',?10,?10)",
        params![
            proposal.id,
            proposal.request_id,
            proposal.page_id,
            proposal.base_revision,
            proposal.proposal_type,
            proposal.title,
            proposal.summary,
            serde_json::to_string(&proposal.patch)?,
            serde_json::to_string(&proposal.sources)?,
            now,
        ],
    )?;
    get(connection, &proposal.id)
}

pub fn get(connection: &Connection, id: &str) -> Result<AiProposal, ProposalError> {
    load_proposal(connection, id)
}

pub fn list_for_page(
    connection: &Connection,
    page_id: &str,
) -> Result<Vec<AiProposal>, ProposalError> {
    let mut statement = connection.prepare(
        "SELECT id,run_id,page_id,base_revision,proposal_type,title,summary,
                patch_json,sources_json,status
         FROM ai_proposals WHERE page_id=?1 ORDER BY created_at",
    )?;
    let proposals = statement
        .query_map([page_id], row_to_proposal)?
        .collect::<rusqlite::Result<Vec<_>>>()
        .map_err(ProposalError::Sqlite)?;
    Ok(proposals)
}

pub fn reject(connection: &Connection, id: &str) -> Result<AiProposal, ProposalError> {
    let proposal = get(connection, id)?;
    if proposal.status != "pending" {
        return Err(ProposalError::InvalidStatus(proposal.status));
    }
    connection.execute(
        "UPDATE ai_proposals
         SET status='rejected', updated_at=?2
         WHERE id=?1 AND status='pending'",
        params![id, chrono::Utc::now().to_rfc3339()],
    )?;
    get(connection, id)
}

pub fn apply(connection: &mut Connection, id: &str) -> Result<ApplyProposalResult, ProposalError> {
    let transaction = connection.transaction()?;
    let mut proposal = load_proposal(&transaction, id)?;
    if proposal.status != "pending" {
        return Err(ProposalError::InvalidStatus(proposal.status));
    }
    let page = load_page_for_update(&transaction, &proposal.page_id)?;
    if page.revision != proposal.base_revision {
        mark_conflicted(&transaction, id)?;
        transaction.commit()?;
        return Err(ProposalError::RevisionConflict {
            expected: proposal.base_revision,
            actual: page.revision,
        });
    }
    let next_body = match &proposal.patch {
        AiPatch::Text {
            before,
            after,
            anchor,
            ..
        } => apply_text_patch(&page.body, before, after, anchor),
        AiPatch::Structured { .. } => Err(ProposalError::UnsupportedPatch),
    };
    let next_body = match next_body {
        Ok(body) => body,
        Err(error) => {
            mark_conflicted(&transaction, id)?;
            transaction.commit()?;
            return Err(error);
        }
    };
    let updated_at = chrono::Utc::now().to_rfc3339();
    let request = SavePageV2Request {
        id: proposal.page_id.clone(),
        title: page.title,
        icon: page.icon,
        parent_id: page.parent_id,
        project_parent_id: page.project_parent_id,
        project_index: page.project_index,
        date_key: page.date_key,
        body_markdown: ensure_task_markers(&next_body, &proposal.page_id),
        created_at: page.created_at,
        updated_at: updated_at.clone(),
        page_type: page.page_type,
        tags: page.tags,
        order: page.order,
        base_revision: proposal.base_revision,
        source: format!("ai_proposal:{}", proposal.id),
    };
    let applied_revision = PageService::save_in_transaction(&transaction, &request)?;
    transaction.execute(
        "UPDATE ai_proposals
         SET status='applied', applied_revision=?2, updated_at=?3
         WHERE id=?1 AND status='pending'",
        params![id, applied_revision, updated_at],
    )?;
    transaction.commit()?;

    proposal.status = "applied".to_string();
    Ok(ApplyProposalResult {
        proposal,
        body: PageService::get_body(connection, &request.id)?,
    })
}

fn mark_conflicted(transaction: &Transaction<'_>, id: &str) -> rusqlite::Result<()> {
    transaction.execute(
        "UPDATE ai_proposals SET status='conflicted', updated_at=?2 WHERE id=?1",
        params![id, chrono::Utc::now().to_rfc3339()],
    )?;
    Ok(())
}

fn apply_text_patch(
    body: &str,
    before: &str,
    after: &str,
    anchor: &TextAnchor,
) -> Result<String, ProposalError> {
    if anchor.end < anchor.start {
        return Err(ProposalError::AnchorConflict);
    }
    let byte_start =
        utf16_offset_to_byte_index(body, anchor.start).ok_or(ProposalError::AnchorConflict)?;
    let byte_end =
        utf16_offset_to_byte_index(body, anchor.end).ok_or(ProposalError::AnchorConflict)?;
    let selected = &body[byte_start..byte_end];
    if selected != before || hash_text_anchor(selected) != anchor.text_hash {
        return Err(ProposalError::AnchorConflict);
    }
    let mut result = String::with_capacity(body.len() - selected.len() + after.len());
    result.push_str(&body[..byte_start]);
    result.push_str(after);
    result.push_str(&body[byte_end..]);
    Ok(result)
}

fn utf16_offset_to_byte_index(value: &str, target: usize) -> Option<usize> {
    let mut utf16_offset = 0;
    for (byte_index, character) in value.char_indices() {
        if utf16_offset == target {
            return Some(byte_index);
        }
        utf16_offset += character.len_utf16();
        if utf16_offset > target {
            return None;
        }
    }
    (utf16_offset == target).then_some(value.len())
}

#[derive(Debug)]
struct PageForUpdate {
    title: String,
    icon: String,
    parent_id: Option<String>,
    project_parent_id: Option<String>,
    project_index: bool,
    date_key: Option<String>,
    body: String,
    created_at: String,
    page_type: String,
    tags: Vec<String>,
    order: i32,
    revision: i64,
}

fn load_page_for_update(
    transaction: &Transaction<'_>,
    page_id: &str,
) -> Result<PageForUpdate, ProposalError> {
    transaction
        .query_row(
            "SELECT title,icon,parent_id,project_parent_id,project_index,date_key,content,
                    created_at,type,tags,page_order,revision
             FROM pages WHERE id=?1 AND deleted_at IS NULL",
            [page_id],
            |row| {
                let tags_json: String = row.get(9)?;
                Ok(PageForUpdate {
                    title: row.get(0)?,
                    icon: row.get(1)?,
                    parent_id: row.get(2)?,
                    project_parent_id: row.get(3)?,
                    project_index: row.get(4)?,
                    date_key: row.get(5)?,
                    body: row.get(6)?,
                    created_at: row.get(7)?,
                    page_type: row.get(8)?,
                    tags: serde_json::from_str(&tags_json).unwrap_or_default(),
                    order: row.get(10)?,
                    revision: row.get(11)?,
                })
            },
        )
        .map_err(ProposalError::Sqlite)
}

fn load_proposal(connection: &Connection, id: &str) -> Result<AiProposal, ProposalError> {
    connection
        .query_row(
            "SELECT id,run_id,page_id,base_revision,proposal_type,title,summary,
                    patch_json,sources_json,status
             FROM ai_proposals WHERE id=?1",
            [id],
            row_to_proposal,
        )
        .map_err(ProposalError::Sqlite)
}

fn row_to_proposal(row: &rusqlite::Row<'_>) -> rusqlite::Result<AiProposal> {
    let patch_json: String = row.get(7)?;
    let sources_json: String = row.get(8)?;
    let patch = serde_json::from_str(&patch_json).map_err(json_from_sql_error)?;
    let sources = serde_json::from_str(&sources_json).map_err(json_from_sql_error)?;
    Ok(AiProposal {
        id: row.get(0)?,
        request_id: row.get(1)?,
        page_id: row.get(2)?,
        base_revision: row.get(3)?,
        proposal_type: row.get(4)?,
        title: row.get(5)?,
        summary: row.get(6)?,
        patch,
        sources,
        status: row.get(9)?,
    })
}

fn json_from_sql_error(error: serde_json::Error) -> rusqlite::Error {
    rusqlite::Error::FromSqlConversionFailure(0, rusqlite::types::Type::Text, Box::new(error))
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::ai::service::{AiRunRequest, AiService};
    use crate::db::connection::configure_connection;
    use crate::db::migrations::migrate_with_backup;
    use crate::domain::page::SavePageV2Request;

    fn connection() -> Connection {
        let mut connection = Connection::open_in_memory().expect("in-memory DB");
        configure_connection(&connection).expect("connection pragmas");
        migrate_with_backup(&mut connection, |_connection| Ok(())).expect("schema");
        connection
    }

    fn page_request(body: &str, base_revision: i64) -> SavePageV2Request {
        SavePageV2Request {
            id: "page-1".to_string(),
            title: "출시".to_string(),
            icon: "🚀".to_string(),
            parent_id: None,
            project_parent_id: None,
            project_index: false,
            date_key: None,
            body_markdown: body.to_string(),
            created_at: "2026-08-16T00:00:00Z".to_string(),
            updated_at: chrono::Utc::now().to_rfc3339(),
            page_type: "page".to_string(),
            tags: vec![],
            order: 0,
            base_revision,
            source: "test".to_string(),
        }
    }

    fn seed(connection: &mut Connection, body: &str) {
        PageService::save(connection, page_request(body, 0)).expect("page");
        AiService::prepare_run(
            connection,
            AiRunRequest {
                id: "run-1".to_string(),
                page_id: Some("page-1".to_string()),
                prompt: "다듬기".to_string(),
                current_page_context: Some(body.to_string()),
                current_project_id: None,
                object_type: Some("page".to_string()),
                max_context_chars: 1_000,
            },
        )
        .expect("run");
    }

    fn proposal(body: &str, start: usize, end: usize, after: &str) -> AiProposal {
        let before = body
            .encode_utf16()
            .skip(start)
            .take(end - start)
            .collect::<Vec<_>>();
        let before = String::from_utf16(&before).expect("valid selection");
        AiProposal {
            id: "proposal-1".to_string(),
            request_id: "run-1".to_string(),
            page_id: "page-1".to_string(),
            base_revision: 1,
            proposal_type: "replace".to_string(),
            title: "다듬기".to_string(),
            summary: "선택 변경".to_string(),
            patch: AiPatch::Text {
                before: before.clone(),
                after: after.to_string(),
                anchor: TextAnchor {
                    start,
                    end,
                    text_hash: hash_text_anchor(&before),
                },
                context_before: String::new(),
                context_after: String::new(),
            },
            sources: vec![],
            status: "pending".to_string(),
        }
    }

    #[test]
    fn proposal_is_pending_then_applies_through_a_new_revision() {
        let mut connection = connection();
        let body = "앞 😀 기존 문장 뒤";
        seed(&mut connection, body);
        let start = "앞 😀 ".encode_utf16().count();
        let end = start + "기존 문장".encode_utf16().count();
        let created = create(&connection, proposal(body, start, end, "개선 문장")).expect("create");
        assert_eq!(created.status, "pending");

        let applied = apply(&mut connection, &created.id).expect("apply");
        assert_eq!(applied.proposal.status, "applied");
        assert_eq!(applied.body.revision, 2);
        assert_eq!(applied.body.body_markdown, "앞 😀 개선 문장 뒤");
    }

    #[test]
    fn insertion_and_rejection_are_persisted() {
        let mut connection = connection();
        seed(&mut connection, "본문");
        let inserted = create(&connection, proposal("본문", 0, 0, "제목\n")).expect("insert");
        let result = apply(&mut connection, &inserted.id).expect("apply insertion");
        assert_eq!(result.body.body_markdown, "제목\n본문");

        AiService::prepare_run(
            &mut connection,
            AiRunRequest {
                id: "run-2".to_string(),
                page_id: Some("page-1".to_string()),
                prompt: "다시".to_string(),
                current_page_context: None,
                current_project_id: None,
                object_type: Some("page".to_string()),
                max_context_chars: 1_000,
            },
        )
        .expect("second run");
        let mut rejected_proposal = proposal("제목\n본문", 0, 2, "다른");
        rejected_proposal.id = "proposal-2".to_string();
        rejected_proposal.request_id = "run-2".to_string();
        rejected_proposal.base_revision = 2;
        create(&connection, rejected_proposal).expect("create rejected");
        assert_eq!(
            reject(&connection, "proposal-2").unwrap().status,
            "rejected"
        );
    }

    #[test]
    fn revision_or_anchor_changes_conflict_without_editing_the_page() {
        let mut connection = connection();
        seed(&mut connection, "기존 문장");
        create(&connection, proposal("기존 문장", 0, 5, "개선")).expect("create");
        PageService::save(&mut connection, page_request("사용자 변경", 1)).expect("user edit");
        let error = apply(&mut connection, "proposal-1").expect_err("revision conflict");
        assert!(matches!(error, ProposalError::RevisionConflict { .. }));
        assert_eq!(get(&connection, "proposal-1").unwrap().status, "conflicted");

        AiService::prepare_run(
            &mut connection,
            AiRunRequest {
                id: "run-2".to_string(),
                page_id: Some("page-1".to_string()),
                prompt: "anchor".to_string(),
                current_page_context: None,
                current_project_id: None,
                object_type: Some("page".to_string()),
                max_context_chars: 1_000,
            },
        )
        .expect("second run");
        let mut stale_anchor = proposal("사용자 변경", 0, 3, "대체");
        stale_anchor.id = "proposal-2".to_string();
        stale_anchor.request_id = "run-2".to_string();
        stale_anchor.base_revision = 2;
        if let AiPatch::Text { anchor, .. } = &mut stale_anchor.patch {
            anchor.text_hash = "tampered".to_string();
        }
        create(&connection, stale_anchor).expect("create stale anchor");
        assert!(matches!(
            apply(&mut connection, "proposal-2"),
            Err(ProposalError::AnchorConflict)
        ));
    }
}
