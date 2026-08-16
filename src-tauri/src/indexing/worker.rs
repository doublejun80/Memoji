use super::anchors::replace_page_anchors;
use super::fts::replace_page_fts;
use super::links::replace_page_links;
use super::markdown::parse_markdown;
use super::tags::replace_page_tags;
use super::IndexedTag;
use crate::tasks::service::TaskService;
use rusqlite::{params, Connection, OptionalExtension};
use serde::Serialize;
use std::time::Instant;

pub struct IndexWorker;

#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct ReindexReport {
    pub pages_indexed: usize,
    pub elapsed_ms: u128,
}

#[derive(Debug, Clone, Serialize, PartialEq, Eq, Default)]
#[serde(rename_all = "camelCase")]
pub struct JobDrainReport {
    pub completed: usize,
    pub failed: usize,
}

impl IndexWorker {
    pub fn enqueue_page(
        connection: &Connection,
        page_id: &str,
        revision: i64,
        created_at: &str,
    ) -> rusqlite::Result<()> {
        let id = format!("index_page:{page_id}:{revision}");
        connection.execute(
            "INSERT INTO jobs (id,kind,page_id,status,attempts,error,created_at,updated_at)
             VALUES (?1,'index_page',?2,'pending',0,NULL,?3,?3)
             ON CONFLICT(id) DO UPDATE SET status='pending',error=NULL,updated_at=excluded.updated_at",
            params![id, page_id, created_at],
        )?;
        Ok(())
    }

    pub fn drain_page_jobs(
        connection: &mut Connection,
        page_id: Option<&str>,
    ) -> rusqlite::Result<JobDrainReport> {
        let jobs = {
            let mut statement = connection.prepare(
                "SELECT id,page_id FROM jobs
                 WHERE kind='index_page'
                   AND status IN ('pending','failed','running')
                   AND attempts < 3
                   AND (?1 IS NULL OR page_id=?1)
                 ORDER BY created_at,id",
            )?;
            let rows = statement
                .query_map([page_id], |row| {
                    Ok((row.get::<_, String>(0)?, row.get::<_, Option<String>>(1)?))
                })?
                .collect::<Result<Vec<_>, _>>()?;
            rows
        };

        let mut report = JobDrainReport::default();
        for (job_id, queued_page_id) in jobs {
            let Some(queued_page_id) = queued_page_id else {
                mark_job_failed(connection, &job_id, "index_page job has no page_id")?;
                report.failed += 1;
                continue;
            };
            let result = process_page_job(connection, &job_id, &queued_page_id);
            match result {
                Ok(()) => report.completed += 1,
                Err(error) => {
                    mark_job_failed(connection, &job_id, &error)?;
                    report.failed += 1;
                }
            }
        }
        Ok(report)
    }

    pub fn reindex_workspace(connection: &mut Connection) -> rusqlite::Result<ReindexReport> {
        let started = Instant::now();
        let transaction = connection.transaction()?;
        let pages = {
            let mut statement = transaction.prepare(
                "SELECT id, title, content, tags FROM pages WHERE deleted_at IS NULL AND type='page' ORDER BY id",
            )?;
            let rows = statement
                .query_map([], |row| {
                    let tags_json: String = row.get(3)?;
                    Ok((
                        row.get::<_, String>(0)?,
                        row.get::<_, String>(1)?,
                        row.get::<_, String>(2)?,
                        serde_json::from_str::<Vec<String>>(&tags_json).unwrap_or_default(),
                    ))
                })?
                .collect::<Result<Vec<_>, _>>()?;
            rows
        };
        transaction.execute_batch(
            "DELETE FROM page_tags;
             DELETE FROM links;
             DELETE FROM anchors;
             DELETE FROM page_fts;",
        )?;
        for (id, title, body, tags) in &pages {
            Self::replace_page_index(&transaction, id, title, body, tags)?;
        }
        transaction.commit()?;
        Ok(ReindexReport {
            pages_indexed: pages.len(),
            elapsed_ms: started.elapsed().as_millis(),
        })
    }

    pub fn replace_page_index(
        connection: &Connection,
        page_id: &str,
        title: &str,
        body: &str,
        metadata_tags: &[String],
    ) -> rusqlite::Result<()> {
        let mut parsed = parse_markdown(body);
        for tag in metadata_tags {
            if !parsed
                .tags
                .iter()
                .any(|indexed| indexed.name.eq_ignore_ascii_case(tag))
            {
                parsed.tags.push(IndexedTag {
                    name: tag.clone(),
                    start: 0,
                    end: 0,
                });
            }
        }
        replace_page_tags(connection, page_id, &parsed.tags)?;
        replace_page_links(connection, page_id, &parsed.links)?;
        replace_page_anchors(connection, page_id, &parsed.headings)?;
        let tags = parsed
            .tags
            .iter()
            .map(|tag| tag.name.clone())
            .collect::<Vec<_>>();
        replace_page_fts(connection, page_id, title, &tags, body, &parsed.chunks)?;
        Ok(())
    }
}

fn process_page_job(
    connection: &mut Connection,
    job_id: &str,
    page_id: &str,
) -> Result<(), String> {
    let transaction = connection
        .transaction()
        .map_err(|error| error.to_string())?;
    let page = transaction
        .query_row(
            "SELECT title,content,tags,project_parent_id,updated_at,deleted_at,type
             FROM pages WHERE id=?1",
            [page_id],
            |row| {
                Ok((
                    row.get::<_, String>(0)?,
                    row.get::<_, String>(1)?,
                    row.get::<_, String>(2)?,
                    row.get::<_, Option<String>>(3)?,
                    row.get::<_, String>(4)?,
                    row.get::<_, Option<String>>(5)?,
                    row.get::<_, String>(6)?,
                ))
            },
        )
        .optional()
        .map_err(|error| error.to_string())?;

    if let Some((title, body, tags_json, project_id, updated_at, deleted_at, page_type)) = page {
        if deleted_at.is_none() && page_type == "page" {
            let tags = serde_json::from_str::<Vec<String>>(&tags_json).unwrap_or_default();
            IndexWorker::replace_page_index(&transaction, page_id, &title, &body, &tags)
                .map_err(|error| error.to_string())?;
            TaskService::replace_page_tasks(
                &transaction,
                page_id,
                &body,
                project_id.as_deref(),
                &updated_at,
            )
            .map_err(|error| error.to_string())?;
        }
    }
    transaction
        .execute(
            "UPDATE jobs
             SET status='complete',attempts=attempts+1,error=NULL,
                 updated_at=strftime('%Y-%m-%dT%H:%M:%fZ','now')
             WHERE id=?1",
            [job_id],
        )
        .map_err(|error| error.to_string())?;
    transaction.commit().map_err(|error| error.to_string())?;
    Ok(())
}

fn mark_job_failed(connection: &Connection, job_id: &str, error: &str) -> rusqlite::Result<()> {
    let error = error.chars().take(500).collect::<String>();
    connection.execute(
        "UPDATE jobs
         SET status='failed',attempts=attempts+1,error=?2,
             updated_at=strftime('%Y-%m-%dT%H:%M:%fZ','now')
         WHERE id=?1",
        params![job_id, error],
    )?;
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::db::connection::configure_connection;
    use crate::db::migrations::migrate_with_backup;
    use crate::domain::page::SavePageV2Request;
    use crate::services::page_service::PageService;

    #[test]
    fn derived_index_replacement_removes_stale_tags_links_and_anchors() {
        let mut connection = Connection::open_in_memory().expect("in-memory DB");
        configure_connection(&connection).expect("connection pragmas");
        migrate_with_backup(&mut connection, |_connection| Ok(())).expect("schema");
        let request = |body: &str, base_revision| SavePageV2Request {
            id: "indexed-page".to_string(),
            title: "인덱스".to_string(),
            icon: "📄".to_string(),
            parent_id: None,
            project_parent_id: None,
            project_index: false,
            date_key: None,
            body_markdown: body.to_string(),
            created_at: "2026-08-16T09:00:00Z".to_string(),
            updated_at: "2026-08-16T10:00:00Z".to_string(),
            page_type: "page".to_string(),
            tags: Vec::new(),
            order: 0,
            base_revision,
            source: "test".to_string(),
        };
        PageService::save(&mut connection, request("# 이전\n#old [[없는 문서]]", 0))
            .expect("first index");
        PageService::save(&mut connection, request("# 신규\n#new", 1)).expect("replacement index");

        let old_tags: i64 = connection
            .query_row(
                "SELECT COUNT(*) FROM page_tags pt JOIN tags t ON t.id=pt.tag_id WHERE t.name='old'",
                [],
                |row| row.get(0),
            )
            .expect("old tags");
        let links: i64 = connection
            .query_row(
                "SELECT COUNT(*) FROM links WHERE source_page_id='indexed-page'",
                [],
                |row| row.get(0),
            )
            .expect("links");
        let anchor: String = connection
            .query_row(
                "SELECT slug FROM anchors WHERE page_id='indexed-page'",
                [],
                |row| row.get(0),
            )
            .expect("anchor");
        assert_eq!(old_tags, 0);
        assert_eq!(links, 0);
        assert_eq!(anchor, "신규");
    }

    #[test]
    fn full_reindex_rebuilds_all_active_pages_and_reports_counts() {
        let mut connection = Connection::open_in_memory().expect("in-memory DB");
        configure_connection(&connection).expect("connection pragmas");
        migrate_with_backup(&mut connection, |_connection| Ok(())).expect("schema");
        let request = SavePageV2Request {
            id: "page-1".into(),
            title: "검색 문서".into(),
            icon: "📄".into(),
            parent_id: None,
            project_parent_id: None,
            project_index: false,
            date_key: None,
            body_markdown: "# 복구\n#reindex".into(),
            created_at: "2026-08-16T09:00:00Z".into(),
            updated_at: "2026-08-16T10:00:00Z".into(),
            page_type: "page".into(),
            tags: vec!["GA".into()],
            order: 0,
            base_revision: 0,
            source: "test".into(),
        };
        PageService::save(&mut connection, request).expect("page");
        connection
            .execute("DELETE FROM anchors", [])
            .expect("damage index");
        let report = IndexWorker::reindex_workspace(&mut connection).expect("reindex");
        assert_eq!(report.pages_indexed, 1);
        assert_eq!(
            connection
                .query_row("SELECT COUNT(*) FROM anchors", [], |row| row
                    .get::<_, i64>(0))
                .unwrap(),
            1
        );
    }
}
