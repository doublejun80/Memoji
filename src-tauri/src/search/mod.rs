use rusqlite::{params, Connection};
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Default, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SearchFilters {
    pub tag: Option<String>,
    pub page_type: Option<String>,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SearchRequest {
    pub query: String,
    #[serde(default)]
    pub filters: SearchFilters,
    #[serde(default = "default_limit")]
    pub limit: usize,
}

fn default_limit() -> usize {
    30
}

#[derive(Debug, Clone, Serialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct SearchResult {
    pub page_id: String,
    pub title: String,
    pub tags: Vec<String>,
    pub updated_at: String,
    pub field: String,
    pub snippet: String,
    pub score: f64,
    pub anchor: Option<String>,
}

#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct PageAnchorView {
    pub slug: String,
    pub heading: String,
    pub level: i64,
    pub line: i64,
}

#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct PageLinkView {
    pub direction: String,
    pub page_id: Option<String>,
    pub page_title: String,
    pub target_anchor: Option<String>,
    pub resolved: bool,
}

pub fn search(
    connection: &Connection,
    request: &SearchRequest,
) -> rusqlite::Result<Vec<SearchResult>> {
    let query = request.query.trim();
    if query.is_empty() {
        return Ok(Vec::new());
    }
    let limit = request.limit.clamp(1, 100) as i64;
    let tag_filter = request.filters.tag.as_ref().map(|tag| format!("%{tag}%"));
    let page_type = request.filters.page_type.as_deref();

    if query.chars().count() <= 2 {
        let like = format!("%{query}%");
        let mut statement = connection.prepare(
            "SELECT p.id, p.title, p.tags, p.updated_at, p.title, 1.0,
                    (SELECT slug FROM anchors WHERE page_id=p.id ORDER BY line LIMIT 1)
             FROM pages p
             WHERE p.deleted_at IS NULL
               AND (p.title LIKE ?1 ESCAPE '\\' OR p.tags LIKE ?1 ESCAPE '\\')
               AND (?2 IS NULL OR p.tags LIKE ?2)
               AND (?3 IS NULL OR p.type=?3)
             ORDER BY CASE WHEN p.title LIKE ?1 THEN 0 ELSE 1 END, p.updated_at DESC
             LIMIT ?4",
        )?;
        let rows = statement.query_map(params![like, tag_filter, page_type, limit], |row| {
            row_to_result(row, query, true)
        })?;
        return rows.collect();
    }

    let fts_query = to_fts_query(query);
    let mut statement = connection.prepare(
        "SELECT p.id, p.title, p.tags, p.updated_at,
                snippet(page_fts, 3, '[', ']', ' … ', 18),
                -bm25(page_fts, 0.0, 8.0, 5.0, 1.0),
                (SELECT slug FROM anchors WHERE page_id=p.id ORDER BY line LIMIT 1)
         FROM page_fts JOIN pages p ON p.id=page_fts.page_id
         WHERE page_fts MATCH ?1
           AND p.deleted_at IS NULL
           AND (?2 IS NULL OR p.tags LIKE ?2)
           AND (?3 IS NULL OR p.type=?3)
         ORDER BY bm25(page_fts, 0.0, 8.0, 5.0, 1.0), p.updated_at DESC
         LIMIT ?4",
    )?;
    let rows = statement.query_map(params![fts_query, tag_filter, page_type, limit], |row| {
        row_to_result(row, query, false)
    })?;
    rows.collect()
}

fn row_to_result(
    row: &rusqlite::Row<'_>,
    query: &str,
    short_query: bool,
) -> rusqlite::Result<SearchResult> {
    let title: String = row.get(1)?;
    let tags_json: String = row.get(2)?;
    let snippet: String = row.get(4)?;
    let field = if title.to_lowercase().contains(&query.to_lowercase()) {
        "title"
    } else if tags_json.to_lowercase().contains(&query.to_lowercase()) {
        "tags"
    } else {
        "body"
    };
    Ok(SearchResult {
        page_id: row.get(0)?,
        title,
        tags: serde_json::from_str(&tags_json).unwrap_or_default(),
        updated_at: row.get(3)?,
        field: field.to_string(),
        snippet,
        score: if short_query { 1.0 } else { row.get(5)? },
        anchor: row.get(6)?,
    })
}

fn to_fts_query(query: &str) -> String {
    query
        .split_whitespace()
        .take(8)
        .map(|token| format!("\"{}\"*", token.replace('"', "\"\"")))
        .collect::<Vec<_>>()
        .join(" AND ")
}

pub fn list_page_anchors(
    connection: &Connection,
    page_id: &str,
) -> rusqlite::Result<Vec<PageAnchorView>> {
    let mut statement = connection
        .prepare("SELECT slug, heading, level, line FROM anchors WHERE page_id=?1 ORDER BY line")?;
    let anchors = statement
        .query_map([page_id], |row| {
            Ok(PageAnchorView {
                slug: row.get(0)?,
                heading: row.get(1)?,
                level: row.get(2)?,
                line: row.get(3)?,
            })
        })?
        .collect();
    anchors
}

pub fn list_page_links(
    connection: &Connection,
    page_id: &str,
) -> rusqlite::Result<Vec<PageLinkView>> {
    let mut result = Vec::new();
    let mut outgoing = connection.prepare(
        "SELECT target_page_id, target_title, target_anchor FROM links WHERE source_page_id=?1 ORDER BY id",
    )?;
    result.extend(
        outgoing
            .query_map([page_id], |row| {
                let target_page_id: Option<String> = row.get(0)?;
                Ok(PageLinkView {
                    direction: "outgoing".to_string(),
                    resolved: target_page_id.is_some(),
                    page_id: target_page_id,
                    page_title: row.get(1)?,
                    target_anchor: row.get(2)?,
                })
            })?
            .collect::<rusqlite::Result<Vec<_>>>()?,
    );

    let mut incoming = connection.prepare(
        "SELECT p.id, p.title, l.target_anchor
         FROM links l JOIN pages p ON p.id=l.source_page_id
         WHERE l.target_page_id=?1 ORDER BY p.updated_at DESC",
    )?;
    result.extend(
        incoming
            .query_map([page_id], |row| {
                Ok(PageLinkView {
                    direction: "incoming".to_string(),
                    page_id: Some(row.get(0)?),
                    page_title: row.get(1)?,
                    target_anchor: row.get(2)?,
                    resolved: true,
                })
            })?
            .collect::<rusqlite::Result<Vec<_>>>()?,
    );
    Ok(result)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::db::connection::configure_connection;
    use crate::db::migrations::migrate_with_backup;
    use std::time::Instant;

    fn connection() -> Connection {
        let mut connection = Connection::open_in_memory().expect("in-memory DB");
        configure_connection(&connection).expect("connection pragmas");
        migrate_with_backup(&mut connection, |_connection| Ok(())).expect("schema");
        connection
    }

    fn insert_page(connection: &Connection, id: &str, title: &str, tags: &str, body: &str) {
        connection.execute(
            "INSERT INTO pages (
                id,title,icon,parent_id,project_parent_id,project_index,date_key,content,
                created_at,updated_at,type,tags,page_order,workspace_id,revision,deleted_at
             ) VALUES (?1,?2,'📄',NULL,NULL,0,NULL,?4,'2026-08-16','2026-08-16','page',?3,0,'default',1,NULL)",
            params![id, title, tags, body],
        ).expect("insert page");
        connection
            .execute(
                "INSERT INTO page_fts(page_id,title,tags,body) VALUES (?1,?2,?3,?4)",
                params![id, title, tags, body],
            )
            .expect("insert FTS");
    }

    #[test]
    fn searches_title_tags_and_korean_body_with_snippets() {
        let connection = connection();
        insert_page(
            &connection,
            "one",
            "출시 계획",
            "[\"GA\"]",
            "로컬 우선 배포를 완료합니다",
        );
        let body = search(
            &connection,
            &SearchRequest {
                query: "로컬 우선".to_string(),
                filters: SearchFilters::default(),
                limit: 10,
            },
        )
        .expect("body search");
        assert_eq!(body[0].page_id, "one");
        assert_eq!(body[0].field, "body");
        assert!(body[0].snippet.contains("[로컬]"));
    }

    #[test]
    fn korean_short_query_only_uses_title_or_tags() {
        let connection = connection();
        insert_page(&connection, "title", "가 계획", "[]", "본문");
        insert_page(&connection, "body", "다른 문서", "[]", "가 본문에만 있음");
        let results = search(
            &connection,
            &SearchRequest {
                query: "가".to_string(),
                filters: SearchFilters::default(),
                limit: 10,
            },
        )
        .expect("short search");
        assert_eq!(
            results
                .iter()
                .map(|result| result.page_id.as_str())
                .collect::<Vec<_>>(),
            vec!["title"]
        );
    }

    #[test]
    fn synthetic_10000_page_search_records_warm_p95() {
        let mut connection = connection();
        let transaction = connection.transaction().expect("benchmark transaction");
        for index in 0..10_000 {
            insert_page(
                &transaction,
                &format!("page-{index}"),
                &format!("문서 {index}"),
                "[\"벤치\"]",
                if index % 100 == 0 {
                    "희소검색어 출시 준비"
                } else {
                    "일반 메모 내용"
                },
            );
        }
        transaction.commit().expect("benchmark seed");
        let request = SearchRequest {
            query: "희소검색어".to_string(),
            filters: SearchFilters::default(),
            limit: 30,
        };
        let _ = search(&connection, &request).expect("warmup");
        let mut samples = Vec::new();
        for _ in 0..20 {
            let started = Instant::now();
            assert!(!search(&connection, &request).expect("search").is_empty());
            samples.push(started.elapsed().as_secs_f64() * 1_000.0);
        }
        samples.sort_by(f64::total_cmp);
        let p95 = samples[18];
        eprintln!("10k warm search p95={p95:.2}ms");
        assert!(p95 < 2_000.0, "warm p95 regression: {p95:.2}ms");
    }
}
