use crate::domain::page::PageRevision;
use rusqlite::{params, Connection};

pub struct RevisionRepository;

impl RevisionRepository {
    pub fn insert(
        connection: &Connection,
        page_id: &str,
        revision: i64,
        body_markdown: &str,
        created_at: &str,
        source: &str,
    ) -> rusqlite::Result<()> {
        connection.execute(
            "INSERT INTO page_revisions (
                page_id, revision, body_markdown, created_at, source
             ) VALUES (?1, ?2, ?3, ?4, ?5)",
            params![page_id, revision, body_markdown, created_at, source],
        )?;
        Ok(())
    }

    pub fn list(connection: &Connection, page_id: &str) -> rusqlite::Result<Vec<PageRevision>> {
        let mut statement = connection.prepare(
            "SELECT id, page_id, revision, body_markdown, created_at, source
             FROM page_revisions WHERE page_id=?1 ORDER BY revision DESC",
        )?;
        let revisions = statement
            .query_map([page_id], |row| {
                Ok(PageRevision {
                    id: row.get(0)?,
                    page_id: row.get(1)?,
                    revision: row.get(2)?,
                    body_markdown: row.get(3)?,
                    created_at: row.get(4)?,
                    source: row.get(5)?,
                })
            })?
            .collect();
        revisions
    }

    pub fn get_body(
        connection: &Connection,
        page_id: &str,
        revision: i64,
    ) -> rusqlite::Result<String> {
        connection.query_row(
            "SELECT body_markdown FROM page_revisions WHERE page_id=?1 AND revision=?2",
            params![page_id, revision],
            |row| row.get(0),
        )
    }
}
