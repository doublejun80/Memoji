use crate::db::repositories::node_repository::NodeRepository;
use crate::db::repositories::page_repository::PageRepository;
use crate::db::repositories::revision_repository::RevisionRepository;
use crate::domain::node::NodeRecord;
use crate::domain::page::{
    PageBody, PageRevision, PageSummary, SavePageV2Request, SavePageV2Response,
};
use crate::indexing::worker::IndexWorker;
use crate::tasks::parser::ensure_task_markers;
use crate::tasks::service::TaskService;
use rusqlite::Connection;
use std::fmt;

#[derive(Debug)]
pub enum PageServiceError {
    Sqlite(rusqlite::Error),
    Conflict { expected: i64, actual: i64 },
}

impl fmt::Display for PageServiceError {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            Self::Sqlite(error) => write!(formatter, "Page storage failed: {error}"),
            Self::Conflict { expected, actual } => write!(
                formatter,
                "Page revision conflict: expected base {expected}, current revision is {actual}",
            ),
        }
    }
}

impl std::error::Error for PageServiceError {}

impl From<rusqlite::Error> for PageServiceError {
    fn from(error: rusqlite::Error) -> Self {
        Self::Sqlite(error)
    }
}

pub struct PageService;

impl PageService {
    pub fn list_summaries(connection: &Connection) -> Result<Vec<PageSummary>, PageServiceError> {
        Ok(PageRepository::list_summaries(connection)?)
    }

    pub fn get_body(connection: &Connection, page_id: &str) -> Result<PageBody, PageServiceError> {
        Ok(PageRepository::get_body(connection, page_id)?)
    }

    pub fn save(
        connection: &mut Connection,
        mut request: SavePageV2Request,
    ) -> Result<SavePageV2Response, PageServiceError> {
        request.body_markdown = ensure_task_markers(&request.body_markdown, &request.id);
        let transaction = connection.transaction()?;
        let actual_revision =
            PageRepository::current_revision(&transaction, &request.id)?.unwrap_or(0);
        if actual_revision != request.base_revision {
            return Err(PageServiceError::Conflict {
                expected: request.base_revision,
                actual: actual_revision,
            });
        }
        let next_revision = actual_revision + 1;
        let node = NodeRecord {
            id: request.id.clone(),
            workspace_id: "default".to_string(),
            parent_id: request
                .project_parent_id
                .clone()
                .or_else(|| request.parent_id.clone()),
            kind: if request.page_type == "folder" {
                "folder".to_string()
            } else {
                "page".to_string()
            },
            title: request.title.clone(),
            sort_order: request.order,
            created_at: request.created_at.clone(),
            updated_at: request.updated_at.clone(),
            deleted_at: None,
        };
        NodeRepository::upsert(&transaction, &node)?;
        PageRepository::upsert(&transaction, &request, next_revision)?;
        IndexWorker::replace_page_index(
            &transaction,
            &request.id,
            &request.title,
            &request.body_markdown,
            &request.tags,
        )?;
        TaskService::replace_page_tasks(
            &transaction,
            &request.id,
            &request.body_markdown,
            request.project_parent_id.as_deref(),
            &request.updated_at,
        )
        .map_err(|error| {
            PageServiceError::Sqlite(rusqlite::Error::ToSqlConversionFailure(Box::new(error)))
        })?;
        RevisionRepository::insert(
            &transaction,
            &request.id,
            next_revision,
            &request.body_markdown,
            &request.updated_at,
            &request.source,
        )?;
        transaction.commit()?;

        Ok(SavePageV2Response {
            summary: PageRepository::get_summary(connection, &request.id)?,
            body: PageRepository::get_body(connection, &request.id)?,
        })
    }

    pub fn trash(connection: &mut Connection, page_id: &str) -> Result<(), PageServiceError> {
        let transaction = connection.transaction()?;
        let deleted_at = chrono::Utc::now().to_rfc3339();
        PageRepository::set_deleted_at(&transaction, page_id, Some(&deleted_at))?;
        transaction.commit()?;
        Ok(())
    }

    pub fn restore(connection: &mut Connection, page_id: &str) -> Result<(), PageServiceError> {
        let transaction = connection.transaction()?;
        PageRepository::set_deleted_at(&transaction, page_id, None)?;
        transaction.commit()?;
        Ok(())
    }

    pub fn list_revisions(
        connection: &Connection,
        page_id: &str,
    ) -> Result<Vec<PageRevision>, PageServiceError> {
        Ok(RevisionRepository::list(connection, page_id)?)
    }

    pub fn restore_revision(
        connection: &mut Connection,
        page_id: &str,
        revision: i64,
        base_revision: i64,
    ) -> Result<PageBody, PageServiceError> {
        let transaction = connection.transaction()?;
        let actual_revision = PageRepository::current_revision(&transaction, page_id)?.unwrap_or(0);
        if actual_revision != base_revision {
            return Err(PageServiceError::Conflict {
                expected: base_revision,
                actual: actual_revision,
            });
        }
        let body = ensure_task_markers(
            &RevisionRepository::get_body(&transaction, page_id, revision)?,
            page_id,
        );
        let (title, tags_json): (String, String) = transaction.query_row(
            "SELECT title, tags FROM pages WHERE id=?1",
            [page_id],
            |row| Ok((row.get(0)?, row.get(1)?)),
        )?;
        let tags: Vec<String> = serde_json::from_str(&tags_json).unwrap_or_default();
        let next_revision = actual_revision + 1;
        let created_at = chrono::Utc::now().to_rfc3339();
        transaction.execute(
            "UPDATE pages SET content=?2, revision=?3, updated_at=?4 WHERE id=?1",
            rusqlite::params![page_id, body, next_revision, created_at],
        )?;
        RevisionRepository::insert(
            &transaction,
            page_id,
            next_revision,
            &body,
            &created_at,
            "revision_restore",
        )?;
        IndexWorker::replace_page_index(&transaction, page_id, &title, &body, &tags)?;
        let project_id: Option<String> = transaction.query_row(
            "SELECT project_parent_id FROM pages WHERE id=?1",
            [page_id],
            |row| row.get(0),
        )?;
        TaskService::replace_page_tasks(
            &transaction,
            page_id,
            &body,
            project_id.as_deref(),
            &created_at,
        )
        .map_err(|error| {
            PageServiceError::Sqlite(rusqlite::Error::ToSqlConversionFailure(Box::new(error)))
        })?;
        transaction.commit()?;
        Ok(PageRepository::get_body(connection, page_id)?)
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::db::connection::configure_connection;
    use crate::db::migrations::migrate_with_backup;

    fn connection() -> Connection {
        let mut connection = Connection::open_in_memory().expect("in-memory DB");
        configure_connection(&connection).expect("connection pragmas");
        migrate_with_backup(&mut connection, |_connection| Ok(())).expect("schema");
        connection
    }

    fn request(body: &str, base_revision: i64) -> SavePageV2Request {
        SavePageV2Request {
            id: "page-1".to_string(),
            title: "출시 계획".to_string(),
            icon: "🚀".to_string(),
            parent_id: None,
            project_parent_id: None,
            project_index: false,
            date_key: Some("2026-08-16".to_string()),
            body_markdown: body.to_string(),
            created_at: "2026-08-16T09:00:00Z".to_string(),
            updated_at: "2026-08-16T10:00:00Z".to_string(),
            page_type: "page".to_string(),
            tags: vec!["GA".to_string()],
            order: 0,
            base_revision,
            source: "user".to_string(),
        }
    }

    #[test]
    fn creates_node_page_and_revision_then_lists_body_free_summaries() {
        let mut connection = connection();
        let saved = PageService::save(&mut connection, request("# 첫 문서", 0)).expect("save");

        assert_eq!(saved.body.revision, 1);
        assert_eq!(
            PageService::get_body(&connection, "page-1")
                .unwrap()
                .body_markdown,
            "# 첫 문서"
        );
        let summaries = PageService::list_summaries(&connection).expect("summaries");
        assert_eq!(summaries.len(), 1);
        let serialized = serde_json::to_value(&summaries[0]).expect("serialize summary");
        assert!(serialized.get("bodyMarkdown").is_none());
        let node_count: i64 = connection
            .query_row("SELECT COUNT(*) FROM nodes WHERE id='page-1'", [], |row| {
                row.get(0)
            })
            .expect("node count");
        assert_eq!(node_count, 1);
    }

    #[test]
    fn saves_with_base_revision_and_rejects_conflicts() {
        let mut connection = connection();
        PageService::save(&mut connection, request("v1", 0)).expect("first save");
        let saved = PageService::save(&mut connection, request("v2", 1)).expect("second save");
        assert_eq!(saved.body.revision, 2);

        let error = PageService::save(&mut connection, request("stale", 1))
            .expect_err("stale save must conflict");
        assert!(matches!(
            error,
            PageServiceError::Conflict {
                expected: 1,
                actual: 2
            }
        ));
        assert_eq!(
            PageService::list_revisions(&connection, "page-1")
                .unwrap()
                .len(),
            2
        );
    }

    #[test]
    fn soft_deletes_restores_and_restores_a_prior_revision() {
        let mut connection = connection();
        PageService::save(&mut connection, request("v1", 0)).expect("first save");
        PageService::save(&mut connection, request("v2", 1)).expect("second save");

        PageService::trash(&mut connection, "page-1").expect("trash");
        assert!(PageService::list_summaries(&connection).unwrap().is_empty());
        PageService::restore(&mut connection, "page-1").expect("restore");
        assert_eq!(PageService::list_summaries(&connection).unwrap().len(), 1);

        let restored = PageService::restore_revision(&mut connection, "page-1", 1, 2)
            .expect("restore revision");
        assert_eq!(restored.body_markdown, "v1");
        assert_eq!(restored.revision, 3);
        assert_eq!(
            PageService::list_revisions(&connection, "page-1")
                .unwrap()
                .len(),
            3
        );
    }
}
