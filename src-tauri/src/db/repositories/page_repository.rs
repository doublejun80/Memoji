use crate::domain::page::{PageBody, PageSummary, SavePageV2Request};
use rusqlite::{params, Connection, OptionalExtension};

pub struct PageRepository;

impl PageRepository {
    pub fn current_revision(
        connection: &Connection,
        page_id: &str,
    ) -> rusqlite::Result<Option<i64>> {
        connection
            .query_row("SELECT revision FROM pages WHERE id=?1", [page_id], |row| {
                row.get(0)
            })
            .optional()
    }

    pub fn upsert(
        connection: &Connection,
        request: &SavePageV2Request,
        revision: i64,
    ) -> rusqlite::Result<()> {
        let tags = serde_json::to_string(&request.tags).unwrap_or_else(|_| "[]".to_string());
        connection.execute(
            "INSERT INTO pages (
                id, title, icon, parent_id, project_parent_id, project_index, date_key,
                content, created_at, updated_at, type, tags, page_order, workspace_id, revision, deleted_at
             ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, 'default', ?14, NULL)
             ON CONFLICT(id) DO UPDATE SET
                title=excluded.title,
                icon=excluded.icon,
                parent_id=excluded.parent_id,
                project_parent_id=excluded.project_parent_id,
                project_index=excluded.project_index,
                date_key=excluded.date_key,
                content=excluded.content,
                updated_at=excluded.updated_at,
                type=excluded.type,
                tags=excluded.tags,
                page_order=excluded.page_order,
                revision=excluded.revision,
                deleted_at=NULL",
            params![
                request.id,
                request.title,
                request.icon,
                request.parent_id,
                request.project_parent_id,
                request.project_index,
                request.date_key,
                request.body_markdown,
                request.created_at,
                request.updated_at,
                request.page_type,
                tags,
                request.order,
                revision,
            ],
        )?;
        Ok(())
    }

    pub fn list_summaries(connection: &Connection) -> rusqlite::Result<Vec<PageSummary>> {
        let mut statement = connection.prepare(
            "SELECT id, title, icon, parent_id, project_parent_id, COALESCE(project_index, 0),
                    date_key, created_at, updated_at, type, tags, page_order, revision, deleted_at
             FROM pages WHERE deleted_at IS NULL ORDER BY created_at DESC",
        )?;
        let rows = statement.query_map([], read_summary)?;
        rows.collect()
    }

    pub fn get_summary(connection: &Connection, page_id: &str) -> rusqlite::Result<PageSummary> {
        connection.query_row(
            "SELECT id, title, icon, parent_id, project_parent_id, COALESCE(project_index, 0),
                    date_key, created_at, updated_at, type, tags, page_order, revision, deleted_at
             FROM pages WHERE id=?1",
            [page_id],
            read_summary,
        )
    }

    pub fn get_body(connection: &Connection, page_id: &str) -> rusqlite::Result<PageBody> {
        connection.query_row(
            "SELECT id, content, revision FROM pages WHERE id=?1 AND deleted_at IS NULL",
            [page_id],
            |row| {
                Ok(PageBody {
                    page_id: row.get(0)?,
                    body_markdown: row.get(1)?,
                    revision: row.get(2)?,
                })
            },
        )
    }

    pub fn set_deleted_at(
        connection: &Connection,
        page_id: &str,
        deleted_at: Option<&str>,
    ) -> rusqlite::Result<()> {
        connection.execute(
            "UPDATE pages SET deleted_at=?2 WHERE id=?1",
            params![page_id, deleted_at],
        )?;
        connection.execute(
            "UPDATE nodes SET deleted_at=?2 WHERE id=?1",
            params![page_id, deleted_at],
        )?;
        Ok(())
    }
}

fn read_summary(row: &rusqlite::Row<'_>) -> rusqlite::Result<PageSummary> {
    let tags_json: String = row.get(10)?;
    Ok(PageSummary {
        id: row.get(0)?,
        title: row.get(1)?,
        icon: row.get(2)?,
        parent_id: row.get(3)?,
        project_parent_id: row.get(4)?,
        project_index: row.get::<_, i64>(5)? != 0,
        date_key: row.get(6)?,
        created_at: row.get(7)?,
        updated_at: row.get(8)?,
        page_type: row.get(9)?,
        tags: serde_json::from_str(&tags_json).unwrap_or_default(),
        order: row.get(11)?,
        revision: row.get(12)?,
        deleted_at: row.get(13)?,
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::db::connection::configure_connection;
    use crate::db::migrations::migrate_with_backup;
    use crate::domain::page::SavePageV2Request;
    use crate::services::page_service::PageService;

    #[test]
    fn page_repository_lists_summaries_without_body_markdown() {
        let mut connection = Connection::open_in_memory().expect("in-memory DB");
        configure_connection(&connection).expect("connection pragmas");
        migrate_with_backup(&mut connection, |_connection| Ok(())).expect("schema");
        PageService::save(
            &mut connection,
            SavePageV2Request {
                id: "summary-only".to_string(),
                title: "요약".to_string(),
                icon: "📄".to_string(),
                parent_id: None,
                project_parent_id: None,
                project_index: false,
                date_key: None,
                body_markdown: "이 본문은 목록 응답에 포함되면 안 됩니다.".to_string(),
                created_at: "2026-08-16T09:00:00Z".to_string(),
                updated_at: "2026-08-16T09:00:00Z".to_string(),
                page_type: "page".to_string(),
                tags: Vec::new(),
                order: 0,
                base_revision: 0,
                source: "test".to_string(),
            },
        )
        .expect("save page");

        let summary = PageRepository::list_summaries(&connection)
            .expect("list summaries")
            .remove(0);
        let json = serde_json::to_value(summary).expect("serialize summary");
        assert!(json.get("bodyMarkdown").is_none());
        assert!(!json.to_string().contains("이 본문"));
    }
}
