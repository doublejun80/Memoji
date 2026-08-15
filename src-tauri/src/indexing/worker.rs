use super::anchors::replace_page_anchors;
use super::fts::replace_page_fts;
use super::links::replace_page_links;
use super::markdown::parse_markdown;
use super::tags::replace_page_tags;
use super::IndexedTag;
use rusqlite::Connection;

pub struct IndexWorker;

impl IndexWorker {
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
        connection.execute(
            "UPDATE jobs SET status='complete', updated_at=strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
             WHERE page_id=?1 AND kind='index_page'",
            [page_id],
        )?;
        Ok(())
    }
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
}
