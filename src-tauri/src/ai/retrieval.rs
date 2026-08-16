use crate::search::{list_page_anchors, search, SearchFilters, SearchRequest};
use chrono::{DateTime, Utc};
use rusqlite::{params, Connection, OptionalExtension};
use serde::{Deserialize, Serialize};

const DEFAULT_LIMIT: usize = 6;

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RetrievalRequest {
    pub query: String,
    pub current_page_id: Option<String>,
    pub current_project_id: Option<String>,
    pub object_type: Option<String>,
    pub context_scope: Option<String>,
    #[serde(default = "default_limit")]
    pub limit: usize,
}

fn default_limit() -> usize {
    DEFAULT_LIMIT
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct RetrievalSource {
    pub page_id: String,
    pub title: String,
    pub anchor: Option<String>,
    pub heading_path: Vec<String>,
    pub snippet: String,
    pub score: f64,
    pub start: Option<usize>,
    pub end: Option<usize>,
    pub text_hash: Option<String>,
}

#[derive(Debug)]
struct CandidatePage {
    body: String,
    project_id: Option<String>,
    page_type: String,
    updated_at: String,
}

pub fn retrieve(
    connection: &Connection,
    request: &RetrievalRequest,
) -> rusqlite::Result<Vec<RetrievalSource>> {
    let query = request.query.trim();
    let context_scope = request.context_scope.as_deref().unwrap_or("workspace");
    if query.is_empty() || context_scope == "none" || context_scope == "page" {
        return Ok(Vec::new());
    }
    let requested_limit = request.limit.clamp(1, 20);
    let candidates = search(
        connection,
        &SearchRequest {
            query: query.to_string(),
            filters: SearchFilters::default(),
            limit: (requested_limit * 4).clamp(8, 80),
        },
    )?;
    if candidates.is_empty() {
        return Ok(Vec::new());
    }

    let inferred_project = request.current_project_id.clone().or_else(|| {
        request.current_page_id.as_deref().and_then(|page_id| {
            connection
                .query_row(
                    "SELECT project_parent_id FROM pages WHERE id=?1",
                    [page_id],
                    |row| row.get(0),
                )
                .optional()
                .ok()
                .flatten()
                .flatten()
        })
    });
    let max_fts = candidates
        .iter()
        .map(|candidate| candidate.score.max(0.0))
        .fold(0.0_f64, f64::max);

    let mut ranked = Vec::new();
    for candidate in candidates {
        let page = connection.query_row(
            "SELECT content, project_parent_id, type, updated_at FROM pages WHERE id=?1",
            [&candidate.page_id],
            |row| {
                Ok(CandidatePage {
                    body: row.get(0)?,
                    project_id: row.get(1)?,
                    page_type: row.get(2)?,
                    updated_at: row.get(3)?,
                })
            },
        )?;
        let bm25_normalized = if max_fts > 0.0 {
            (candidate.score.max(0.0) / max_fts).clamp(0.0, 1.0)
        } else {
            1.0
        };
        let same_project = inferred_project
            .as_ref()
            .is_some_and(|project_id| page.project_id.as_ref() == Some(project_id));
        let explicitly_linked = request.current_page_id.as_deref().is_some_and(|current| {
            connection
                .query_row(
                    "SELECT EXISTS(
                        SELECT 1 FROM links
                        WHERE (source_page_id=?1 AND target_page_id=?2)
                           OR (source_page_id=?2 AND target_page_id=?1)
                     )",
                    params![current, candidate.page_id],
                    |row| row.get::<_, i64>(0),
                )
                .map(|value| value == 1)
                .unwrap_or(false)
        });
        if context_scope == "project" && !same_project {
            continue;
        }
        if context_scope == "linked" && !explicitly_linked {
            continue;
        }
        let recency = recency_score(&page.updated_at);
        let object_type_match = request
            .object_type
            .as_ref()
            .map_or(true, |object_type| object_type == &page.page_type);
        let score = 0.45 * bm25_normalized
            + 0.20 * f64::from(same_project)
            + 0.15 * f64::from(explicitly_linked)
            + 0.10 * recency
            + 0.10 * f64::from(object_type_match);

        let (start, end, text_hash, line) = find_query_anchor(&page.body, query);
        let heading_path = heading_path_at_line(connection, &candidate.page_id, line)?;
        let anchor = heading_path
            .last()
            .map(|(slug, _)| slug.clone())
            .or(candidate.anchor);
        ranked.push(RetrievalSource {
            page_id: candidate.page_id,
            title: candidate.title,
            anchor,
            heading_path: heading_path
                .into_iter()
                .map(|(_, heading)| heading)
                .collect(),
            snippet: candidate.snippet.replace(['[', ']'], ""),
            score,
            start,
            end,
            text_hash,
        });
    }
    ranked.sort_by(|left, right| {
        right
            .score
            .total_cmp(&left.score)
            .then_with(|| left.page_id.cmp(&right.page_id))
    });
    ranked.truncate(requested_limit);
    Ok(ranked)
}

fn recency_score(updated_at: &str) -> f64 {
    let Ok(updated) = DateTime::parse_from_rfc3339(updated_at) else {
        return 0.0;
    };
    let age_days = Utc::now()
        .signed_duration_since(updated.with_timezone(&Utc))
        .num_seconds()
        .max(0) as f64
        / 86_400.0;
    (1.0 / (1.0 + age_days / 30.0)).clamp(0.0, 1.0)
}

fn find_query_anchor(
    body: &str,
    query: &str,
) -> (Option<usize>, Option<usize>, Option<String>, usize) {
    let token = query.split_whitespace().next().unwrap_or(query);
    let lower_body = body.to_lowercase();
    let lower_token = token.to_lowercase();
    let Some(byte_start) = lower_body.find(&lower_token) else {
        return (None, None, None, 0);
    };
    let byte_end = byte_start + lower_token.len();
    if !body.is_char_boundary(byte_start) || !body.is_char_boundary(byte_end) {
        return (None, None, None, 0);
    }
    let selected = &body[byte_start..byte_end];
    let start = body[..byte_start].encode_utf16().count();
    let end = start + selected.encode_utf16().count();
    let line = body[..byte_start]
        .bytes()
        .filter(|byte| *byte == b'\n')
        .count();
    (
        Some(start),
        Some(end),
        Some(hash_text_anchor(selected)),
        line,
    )
}

fn heading_path_at_line(
    connection: &Connection,
    page_id: &str,
    line: usize,
) -> rusqlite::Result<Vec<(String, String)>> {
    let mut stack: Vec<(i64, String, String)> = Vec::new();
    for anchor in list_page_anchors(connection, page_id)? {
        if anchor.line as usize > line {
            break;
        }
        while stack
            .last()
            .is_some_and(|(level, _, _)| *level >= anchor.level)
        {
            stack.pop();
        }
        stack.push((anchor.level, anchor.slug, anchor.heading));
    }
    Ok(stack
        .into_iter()
        .map(|(_, slug, heading)| (slug, heading))
        .collect())
}

pub(crate) fn hash_text_anchor(value: &str) -> String {
    let mut hash = 2_166_136_261_u32;
    for unit in value.encode_utf16() {
        hash ^= u32::from(unit);
        hash = hash.wrapping_mul(16_777_619);
    }
    format!("{hash:08x}")
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

    fn insert_page(
        connection: &Connection,
        id: &str,
        project_id: Option<&str>,
        title: &str,
        body: &str,
    ) {
        connection
            .execute(
                "INSERT INTO pages (
                id,title,icon,parent_id,project_parent_id,project_index,date_key,content,
                created_at,updated_at,type,tags,page_order,workspace_id,revision,deleted_at
             ) VALUES (?1,?3,'📄',NULL,?2,0,NULL,?4,
                '2026-08-16T00:00:00Z','2026-08-16T00:00:00Z','page','[]',0,'default',1,NULL)",
                params![id, project_id, title, body],
            )
            .expect("insert page");
        IndexWorker::replace_page_index(connection, id, title, body, &[]).expect("index");
    }

    #[test]
    fn source_ranking_combines_fts_project_link_recency_and_object_type() {
        let connection = connection();
        insert_page(
            &connection,
            "current",
            Some("project-a"),
            "현재",
            "연결 문서",
        );
        insert_page(
            &connection,
            "same-linked",
            Some("project-a"),
            "로컬 출시",
            "# 배포\n로컬 우선 배포 체크리스트",
        );
        insert_page(
            &connection,
            "other",
            Some("project-b"),
            "로컬 기록",
            "로컬 우선 배포 참고",
        );
        connection.execute(
            "INSERT INTO links(source_page_id,target_page_id,target_title,target_anchor,source_start,source_end)
             VALUES ('current','same-linked','로컬 출시',NULL,0,2)",
            [],
        ).expect("link");

        let sources = retrieve(
            &connection,
            &RetrievalRequest {
                query: "로컬 우선".to_string(),
                current_page_id: Some("current".to_string()),
                current_project_id: None,
                object_type: Some("page".to_string()),
                context_scope: Some("workspace".to_string()),
                limit: 4,
            },
        )
        .expect("retrieve");

        assert_eq!(sources[0].page_id, "same-linked");
        assert_eq!(sources[0].heading_path, vec!["배포"]);
        assert!(sources[0].score > sources[1].score);
        let expected_hash = hash_text_anchor("로컬");
        assert_eq!(
            sources[0].text_hash.as_deref(),
            Some(expected_hash.as_str())
        );
    }

    #[test]
    fn explicit_context_scope_filters_project_and_linked_sources() {
        let connection = connection();
        insert_page(
            &connection,
            "current",
            Some("project-a"),
            "현재",
            "기준 문서",
        );
        insert_page(
            &connection,
            "project",
            Some("project-a"),
            "같은 프로젝트",
            "범위검색 근거",
        );
        insert_page(
            &connection,
            "linked",
            Some("project-b"),
            "연결 문서",
            "범위검색 근거",
        );
        insert_page(
            &connection,
            "other",
            Some("project-b"),
            "다른 문서",
            "범위검색 근거",
        );
        connection.execute(
            "INSERT INTO links(source_page_id,target_page_id,target_title,target_anchor,source_start,source_end)
             VALUES ('current','linked','연결 문서',NULL,0,2)",
            [],
        ).expect("link");

        let scoped = |scope: &str| {
            retrieve(
                &connection,
                &RetrievalRequest {
                    query: "범위검색".to_string(),
                    current_page_id: Some("current".to_string()),
                    current_project_id: Some("project-a".to_string()),
                    object_type: Some("page".to_string()),
                    context_scope: Some(scope.to_string()),
                    limit: 8,
                },
            )
            .expect("scoped retrieve")
        };

        assert_eq!(
            scoped("project")
                .iter()
                .map(|source| source.page_id.as_str())
                .collect::<Vec<_>>(),
            vec!["project"]
        );
        assert_eq!(
            scoped("linked")
                .iter()
                .map(|source| source.page_id.as_str())
                .collect::<Vec<_>>(),
            vec!["linked"]
        );
        assert!(scoped("none").is_empty());
    }
}
