use rusqlite::{params, Connection, OpenFlags, OptionalExtension, Result};
use serde::{Deserialize, Serialize};
use std::collections::{HashMap, HashSet};
use std::io::Read;
use std::path::{Path, PathBuf};

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct Page {
    pub id: String,
    pub title: String,
    pub icon: String,
    pub parent_id: Option<String>,
    pub project_parent_id: Option<String>,
    pub project_index: Option<bool>,
    pub date_key: Option<String>,
    pub content: String,
    pub created_at: String,
    pub updated_at: String,
    #[serde(rename = "type")]
    pub page_type: String,
    pub tags: Vec<String>,
    pub order: i32,
}

pub struct Database {
    conn: Connection,
}

#[derive(Debug, Serialize, Clone, Default)]
pub struct ImportDatabaseSummary {
    pub imported: usize,
    pub duplicated: usize,
    pub skipped: usize,
    pub revisions_imported: usize,
    pub source_schema_version: Option<i64>,
}

#[derive(Debug, Clone)]
struct ImportedPageRevision {
    page_id: String,
    revision: i64,
    body_markdown: String,
    created_at: String,
    source: String,
}

impl Database {
    pub fn new(db_path: PathBuf) -> std::result::Result<Self, String> {
        let conn = crate::db::open_database(&db_path).map_err(|error| error.to_string())?;
        Ok(Database { conn })
    }

    pub fn init(&self) -> Result<()> {
        self.conn.execute(
            "CREATE TABLE IF NOT EXISTS pages (
                id TEXT PRIMARY KEY,
                title TEXT NOT NULL,
                icon TEXT NOT NULL,
                parent_id TEXT,
                project_parent_id TEXT,
                project_index INTEGER,
                date_key TEXT,
                content TEXT NOT NULL,
                created_at TEXT NOT NULL,
                updated_at TEXT NOT NULL,
                type TEXT NOT NULL,
                tags TEXT NOT NULL,
                page_order INTEGER NOT NULL
            )",
            [],
        )?;

        self.ensure_column("pages", "project_parent_id", "TEXT")?;
        self.ensure_column("pages", "project_index", "INTEGER")?;
        self.ensure_column("pages", "date_key", "TEXT")?;
        self.ensure_column("pages", "revision", "INTEGER NOT NULL DEFAULT 0")?;

        self.conn.execute(
            "UPDATE pages
             SET project_parent_id = parent_id
             WHERE project_parent_id IS NULL AND parent_id IS NOT NULL",
            [],
        )?;

        self.conn.execute(
            "UPDATE pages
             SET date_key = substr(created_at, 1, 10)
             WHERE date_key IS NULL
               AND created_at IS NOT NULL
               AND (
                 project_index = 0
                 OR (project_index IS NULL AND project_parent_id IS NULL)
               )",
            [],
        )?;

        self.conn.execute(
            "UPDATE pages
             SET project_index = 1
             WHERE project_index IS NULL AND project_parent_id IS NOT NULL",
            [],
        )?;

        self.conn.execute(
            "UPDATE pages
             SET project_index = 0
             WHERE project_index IS NULL AND date_key IS NOT NULL",
            [],
        )?;

        self.conn.execute(
            "UPDATE pages
             SET project_index = 1
             WHERE project_index IS NULL",
            [],
        )?;

        // 설정 테이블 생성
        self.conn.execute(
            "CREATE TABLE IF NOT EXISTS settings (
                key TEXT PRIMARY KEY,
                value TEXT NOT NULL
            )",
            [],
        )?;

        self.conn.execute(
            "CREATE TABLE IF NOT EXISTS page_revisions (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                page_id TEXT NOT NULL REFERENCES pages(id) ON DELETE CASCADE,
                revision INTEGER NOT NULL,
                body_markdown TEXT NOT NULL,
                created_at TEXT NOT NULL,
                source TEXT NOT NULL DEFAULT 'user',
                UNIQUE(page_id, revision)
            )",
            [],
        )?;

        Ok(())
    }

    pub(crate) fn connection(&self) -> &Connection {
        &self.conn
    }

    pub(crate) fn connection_mut(&mut self) -> &mut Connection {
        &mut self.conn
    }

    fn ensure_column(&self, table: &str, column: &str, column_type: &str) -> Result<bool> {
        let mut stmt = self
            .conn
            .prepare(&format!("PRAGMA table_info({})", table))?;
        let columns = stmt.query_map([], |row| row.get::<_, String>(1))?;

        for column_result in columns {
            if column_result? == column {
                return Ok(false);
            }
        }

        self.conn.execute(
            &format!(
                "ALTER TABLE {} ADD COLUMN {} {}",
                table, column, column_type
            ),
            [],
        )?;
        Ok(true)
    }

    pub fn save_page(&self, page: &Page) -> Result<()> {
        let tags_json = serde_json::to_string(&page.tags).unwrap_or_else(|_| "[]".to_string());

        self.conn.execute(
            "INSERT OR REPLACE INTO pages (id, title, icon, parent_id, project_parent_id, project_index, date_key, content, created_at, updated_at, type, tags, page_order)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13)",
            params![
                &page.id,
                &page.title,
                &page.icon,
                &page.parent_id,
                &page.project_parent_id,
                &page.project_index,
                &page.date_key,
                &page.content,
                &page.created_at,
                &page.updated_at,
                &page.page_type,
                &tags_json,
                &page.order,
            ],
        )?;
        Ok(())
    }

    pub fn get_pages(&self) -> Result<Vec<Page>> {
        let mut stmt = self.conn.prepare(
            "SELECT id, title, icon, parent_id, project_parent_id, project_index, date_key, content, created_at, updated_at, type, tags, page_order FROM pages ORDER BY created_at DESC"
        )?;

        let pages = stmt.query_map([], |row| {
            let tags_str: String = row.get(11)?;
            let tags: Vec<String> = serde_json::from_str(&tags_str).unwrap_or_else(|_| vec![]);

            Ok(Page {
                id: row.get(0)?,
                title: row.get(1)?,
                icon: row.get(2)?,
                parent_id: row.get(3)?,
                project_parent_id: row.get(4)?,
                project_index: row.get(5)?,
                date_key: row.get(6)?,
                content: row.get(7)?,
                created_at: row.get(8)?,
                updated_at: row.get(9)?,
                page_type: row.get(10)?,
                tags,
                order: row.get(12)?,
            })
        })?;

        let mut result = Vec::new();
        for page in pages {
            result.push(page?);
        }
        Ok(result)
    }

    pub fn backup_to(&self, backup_path: &Path) -> std::result::Result<(), String> {
        let backup_path_string = backup_path.to_string_lossy().to_string();
        self.conn
            .execute("VACUUM main INTO ?1", params![backup_path_string])
            .map_err(|error| format!("Failed to create database backup: {}", error))?;
        Ok(())
    }

    pub fn import_pages_from_path(
        &self,
        source_path: &Path,
        backup_path: &Path,
    ) -> std::result::Result<ImportDatabaseSummary, String> {
        const SQLITE_HEADER: &[u8; 16] = b"SQLite format 3\0";

        let canonical_source = source_path
            .canonicalize()
            .map_err(|error| format!("Failed to resolve imported database path: {error}"))?;
        let metadata = canonical_source
            .metadata()
            .map_err(|error| format!("Failed to inspect imported database: {error}"))?;
        if !metadata.is_file() {
            return Err("선택한 경로가 DB 파일이 아닙니다.".to_string());
        }

        let mut source_file = std::fs::File::open(&canonical_source)
            .map_err(|error| format!("Failed to open imported database: {error}"))?;
        let mut header = [0_u8; 16];
        source_file
            .read_exact(&mut header)
            .map_err(|_| "SQLite memoji.db 파일이 아닙니다.".to_string())?;
        if &header != SQLITE_HEADER {
            return Err("SQLite memoji.db 파일이 아닙니다.".to_string());
        }
        drop(source_file);

        let source =
            Connection::open_with_flags(&canonical_source, OpenFlags::SQLITE_OPEN_READ_ONLY)
                .map_err(|error| format!("Failed to open imported database read-only: {error}"))?;
        validate_source_database(&source)?;

        if let Some(parent) = backup_path.parent() {
            std::fs::create_dir_all(parent)
                .map_err(|error| format!("Failed to create backup directory: {error}"))?;
        }
        self.backup_to(backup_path)?;
        self.import_pages_from_connection(&source)
    }

    pub fn import_pages_from_connection(
        &self,
        source: &Connection,
    ) -> std::result::Result<ImportDatabaseSummary, String> {
        self.init()
            .map_err(|error| format!("Failed to initialize target database: {}", error))?;
        validate_source_database(source)?;

        let source_pages = read_source_pages(source)?;
        let source_revisions = read_source_revisions(source)?;
        let existing_pages = self
            .get_pages()
            .map_err(|error| format!("Failed to read current pages: {}", error))?;
        let existing_by_id: HashMap<String, Page> = existing_pages
            .into_iter()
            .map(|page| (page.id.clone(), page))
            .collect();
        let mut occupied_ids: HashSet<String> = existing_by_id.keys().cloned().collect();
        let import_stamp = chrono::Local::now().format("%Y%m%d%H%M%S").to_string();
        let mut id_map: HashMap<String, String> = HashMap::new();
        let mut pages_to_import: Vec<Page> = Vec::new();
        let mut summary = ImportDatabaseSummary {
            source_schema_version: read_source_schema_version(source)?,
            ..ImportDatabaseSummary::default()
        };

        for (index, source_page) in source_pages.iter().enumerate() {
            if let Some(existing_page) = existing_by_id.get(&source_page.id) {
                if pages_are_same_for_import(existing_page, source_page) {
                    id_map.insert(source_page.id.clone(), existing_page.id.clone());
                    summary.skipped += 1;
                    continue;
                }
            }

            let mut next_page = source_page.clone();
            if occupied_ids.contains(&source_page.id) {
                next_page.id =
                    unique_import_id(&source_page.id, &import_stamp, index, &occupied_ids);
                summary.duplicated += 1;
            } else {
                summary.imported += 1;
            }

            occupied_ids.insert(next_page.id.clone());
            id_map.insert(source_page.id.clone(), next_page.id.clone());
            pages_to_import.push(next_page);
        }

        if pages_to_import.is_empty() && source_revisions.is_empty() {
            return Ok(summary);
        }

        self.conn
            .execute_batch("BEGIN IMMEDIATE")
            .map_err(|error| format!("Failed to start import transaction: {}", error))?;

        let import_result = (|| -> std::result::Result<(), String> {
            for page in pages_to_import.iter_mut() {
                let original_parent_id = page
                    .project_parent_id
                    .clone()
                    .or_else(|| page.parent_id.clone());
                let mapped_parent_id =
                    original_parent_id.and_then(|parent_id| id_map.get(&parent_id).cloned());
                page.parent_id = mapped_parent_id.clone();
                page.project_parent_id = mapped_parent_id;
                self.save_page(page).map_err(|error| {
                    format!("Failed to import page '{}': {}", page.title, error)
                })?;
            }
            for revision in &source_revisions {
                let Some(target_page_id) = id_map.get(&revision.page_id) else {
                    continue;
                };
                if import_page_revision(&self.conn, target_page_id, revision)? {
                    summary.revisions_imported += 1;
                }
            }
            Ok(())
        })();

        if let Err(error) = import_result {
            let _ = self.conn.execute_batch("ROLLBACK");
            return Err(error);
        }

        self.conn
            .execute_batch("COMMIT")
            .map_err(|error| format!("Failed to commit imported pages: {}", error))?;

        Ok(summary)
    }

    pub fn delete_page(&self, page_id: &str) -> Result<()> {
        self.conn.execute_batch("BEGIN IMMEDIATE")?;

        let delete_result = (|| -> Result<()> {
            let mut visited = HashSet::new();
            visited.insert(page_id.to_string());
            let child_ids = self.get_child_page_ids(page_id, &mut visited)?;

            for child_id in child_ids {
                self.conn
                    .execute("DELETE FROM pages WHERE id = ?1", params![child_id])?;
            }

            self.conn
                .execute("DELETE FROM pages WHERE id = ?1", params![page_id])?;
            Ok(())
        })();

        if let Err(error) = delete_result {
            let _ = self.conn.execute_batch("ROLLBACK");
            return Err(error);
        }

        self.conn.execute_batch("COMMIT")?;
        Ok(())
    }

    fn get_child_page_ids(
        &self,
        parent_id: &str,
        visited: &mut HashSet<String>,
    ) -> Result<Vec<String>> {
        let mut stmt = self
            .conn
            .prepare("SELECT id FROM pages WHERE parent_id = ?1 OR project_parent_id = ?1")?;
        let mut ids = Vec::new();

        let rows = stmt.query_map(params![parent_id], |row| row.get(0))?;

        for id_result in rows {
            let id: String = id_result?;
            if !visited.insert(id.clone()) {
                continue;
            }
            ids.push(id.clone());
            // 재귀적으로 자식의 자식도 가져오기
            let child_ids = self.get_child_page_ids(&id, visited)?;
            ids.extend(child_ids);
        }

        Ok(ids)
    }

    pub fn save_setting(&self, key: &str, value: &str) -> Result<()> {
        self.conn.execute(
            "INSERT OR REPLACE INTO settings (key, value) VALUES (?1, ?2)",
            params![key, value],
        )?;
        Ok(())
    }

    pub fn get_setting(&self, key: &str) -> Result<Option<String>> {
        let mut stmt = self
            .conn
            .prepare("SELECT value FROM settings WHERE key = ?1")?;
        let mut rows = stmt.query(params![key])?;

        if let Some(row) = rows.next()? {
            let value: String = row.get(0)?;
            Ok(Some(value))
        } else {
            Ok(None)
        }
    }
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct PageExportEntry {
    pub page_id: String,
    pub path: String,
    pub content: String,
}

pub fn build_page_export_entries(pages: &[Page]) -> Vec<PageExportEntry> {
    let pages_by_id: HashMap<String, &Page> =
        pages.iter().map(|page| (page.id.clone(), page)).collect();

    let mut entries: Vec<PageExportEntry> = pages
        .iter()
        .filter(|page| page.page_type != "folder")
        .map(|page| PageExportEntry {
            page_id: page.id.clone(),
            path: page_export_path(page, &pages_by_id),
            content: page_export_content(page),
        })
        .collect();

    entries.sort_by(|a, b| a.path.cmp(&b.path));
    entries
}

fn page_export_path(page: &Page, pages_by_id: &HashMap<String, &Page>) -> String {
    let mut segments = Vec::new();
    let project_parent_id = page_project_parent_id(page);
    let is_project_page = page.project_index.unwrap_or(false)
        || project_parent_id.is_some()
        || page.date_key.is_none();

    if is_project_page {
        segments.push("projects".to_string());
        segments.extend(project_parent_segments(page, pages_by_id));
    } else if let Some(date_key) = page
        .date_key
        .as_deref()
        .filter(|date| !date.trim().is_empty())
    {
        segments.push("daily".to_string());
        segments.push(sanitize_export_segment(date_key));
    } else {
        segments.push("pages".to_string());
    }

    segments.push(format!(
        "{}__{}.md",
        sanitize_export_segment(&page.title),
        sanitize_export_segment(&page.id)
    ));
    segments.join("/")
}

fn project_parent_segments(page: &Page, pages_by_id: &HashMap<String, &Page>) -> Vec<String> {
    let mut segments = Vec::new();
    let mut visited = HashSet::new();
    let mut cursor = page_project_parent_id(page).map(str::to_string);

    while let Some(parent_id) = cursor {
        if !visited.insert(parent_id.clone()) {
            break;
        }

        let Some(parent) = pages_by_id.get(&parent_id) else {
            break;
        };

        segments.push(sanitize_export_segment(&parent.title));
        cursor = page_project_parent_id(parent).map(str::to_string);
    }

    segments.reverse();
    segments
}

fn page_project_parent_id(page: &Page) -> Option<&str> {
    page.project_parent_id
        .as_deref()
        .or(page.parent_id.as_deref())
        .map(str::trim)
        .filter(|parent_id| !parent_id.is_empty())
}

fn sanitize_export_segment(raw: &str) -> String {
    let mut sanitized = raw
        .trim()
        .chars()
        .map(|character| {
            if character.is_control()
                || matches!(
                    character,
                    '<' | '>' | ':' | '"' | '/' | '\\' | '|' | '?' | '*'
                )
            {
                '_'
            } else {
                character
            }
        })
        .collect::<String>();

    while sanitized.ends_with([' ', '.']) {
        sanitized.pop();
    }

    if sanitized.is_empty() {
        sanitized = "Untitled".to_string();
    }

    let upper = sanitized.to_ascii_uppercase();
    let is_reserved = matches!(
        upper.as_str(),
        "CON"
            | "PRN"
            | "AUX"
            | "NUL"
            | "COM1"
            | "COM2"
            | "COM3"
            | "COM4"
            | "COM5"
            | "COM6"
            | "COM7"
            | "COM8"
            | "COM9"
            | "LPT1"
            | "LPT2"
            | "LPT3"
            | "LPT4"
            | "LPT5"
            | "LPT6"
            | "LPT7"
            | "LPT8"
            | "LPT9"
    );

    if is_reserved {
        format!("_{sanitized}")
    } else {
        sanitized
    }
}

fn page_export_content(page: &Page) -> String {
    let tags_json = serde_json::to_string(&page.tags).unwrap_or_else(|_| "[]".to_string());
    let mut content = String::new();

    content.push_str("---\n");
    content.push_str(&format!("id: {}\n", yaml_string(&page.id)));
    content.push_str(&format!("title: {}\n", yaml_string(&page.title)));
    content.push_str(&format!("type: {}\n", yaml_string(&page.page_type)));
    if let Some(date_key) = page.date_key.as_deref() {
        content.push_str(&format!("date_key: {}\n", yaml_string(date_key)));
    }
    if let Some(parent_id) = page_project_parent_id(page) {
        content.push_str(&format!("project_parent_id: {}\n", yaml_string(parent_id)));
    }
    content.push_str(&format!("created_at: {}\n", yaml_string(&page.created_at)));
    content.push_str(&format!("updated_at: {}\n", yaml_string(&page.updated_at)));
    content.push_str(&format!("tags: {tags_json}\n"));
    content.push_str("---\n\n");
    content.push_str("# ");
    content.push_str(&page.title);
    content.push_str("\n\n");
    content.push_str(&page.content);
    if !content.ends_with('\n') {
        content.push('\n');
    }
    content
}

fn yaml_string(value: &str) -> String {
    serde_json::to_string(value).unwrap_or_else(|_| "\"\"".to_string())
}

fn validate_source_database(source: &Connection) -> std::result::Result<(), String> {
    let quick_check: String = source
        .query_row("PRAGMA quick_check", [], |row| row.get(0))
        .map_err(|error| format!("Failed to validate SQLite file: {}", error))?;
    if quick_check.to_lowercase() != "ok" {
        return Err(format!("SQLite quick_check failed: {}", quick_check));
    }

    let has_pages_table: Option<String> = source
        .query_row(
            "SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'pages'",
            [],
            |row| row.get(0),
        )
        .optional()
        .map_err(|error| format!("Failed to inspect imported database: {}", error))?;

    if has_pages_table.is_none() {
        return Err(
            "선택한 DB에 pages 테이블이 없습니다. memoji.db 파일을 선택해주세요.".to_string(),
        );
    }

    Ok(())
}

fn read_source_pages(source: &Connection) -> std::result::Result<Vec<Page>, String> {
    let columns = table_columns(source, "pages")?;
    for required_column in ["id", "title", "content", "created_at", "updated_at"] {
        if !columns.contains(required_column) {
            return Err(format!(
                "선택한 DB의 pages 테이블에 '{}' 컬럼이 없습니다.",
                required_column
            ));
        }
    }

    let order_expr = if columns.contains("page_order") {
        "page_order".to_string()
    } else if columns.contains("order") {
        "\"order\"".to_string()
    } else {
        "0".to_string()
    };

    let query = format!(
        "SELECT id, title, {}, {}, {}, {}, {}, content, created_at, updated_at, {}, {}, {} FROM pages ORDER BY {}, created_at",
        column_expr(&columns, "icon", "''"),
        column_expr(&columns, "parent_id", "NULL"),
        column_expr(&columns, "project_parent_id", "NULL"),
        column_expr(&columns, "project_index", "NULL"),
        column_expr(&columns, "date_key", "NULL"),
        column_expr(&columns, "type", "'page'"),
        column_expr(&columns, "tags", "'[]'"),
        order_expr,
        order_expr,
    );

    let mut stmt = source
        .prepare(&query)
        .map_err(|error| format!("Failed to prepare imported pages query: {}", error))?;
    let rows = stmt
        .query_map([], |row| {
            let raw_type: String = row.get(10)?;
            let page_type = if raw_type == "folder" {
                "folder"
            } else {
                "page"
            }
            .to_string();
            let raw_icon: String = row.get(2)?;
            let parent_id: Option<String> = normalize_optional_string(row.get(3)?);
            let project_parent_id: Option<String> =
                normalize_optional_string(row.get(4)?).or_else(|| parent_id.clone());
            let project_index_raw: Option<i64> = row.get(5)?;
            let date_key = normalize_optional_string(row.get(6)?);
            let created_at: String = row.get(8)?;
            let has_project_membership = project_parent_id.is_some()
                || matches!(project_index_raw, Some(value) if value != 0);
            let normalized_date_key = date_key.or_else(|| {
                if has_project_membership {
                    None
                } else {
                    date_key_from_created_at(&created_at)
                }
            });
            let project_index = project_index_raw
                .map(|value| value != 0)
                .unwrap_or_else(|| project_parent_id.is_some() || normalized_date_key.is_none());
            let tags_str: String = row.get(11)?;
            let tags: Vec<String> = serde_json::from_str(&tags_str).unwrap_or_else(|_| vec![]);

            Ok(Page {
                id: row.get(0)?,
                title: row.get(1)?,
                icon: if raw_icon.trim().is_empty() {
                    if page_type == "folder" {
                        "📁".to_string()
                    } else {
                        "📄".to_string()
                    }
                } else {
                    raw_icon
                },
                parent_id: project_parent_id.clone(),
                project_parent_id,
                project_index: Some(project_index),
                date_key: normalized_date_key,
                content: row.get(7)?,
                created_at,
                updated_at: row.get(9)?,
                page_type,
                tags,
                order: row.get(12)?,
            })
        })
        .map_err(|error| format!("Failed to read imported pages: {}", error))?;

    let mut pages = Vec::new();
    for page in rows {
        pages.push(page.map_err(|error| format!("Failed to decode imported page: {}", error))?);
    }

    Ok(pages)
}

fn read_source_revisions(
    source: &Connection,
) -> std::result::Result<Vec<ImportedPageRevision>, String> {
    if !table_exists(source, "page_revisions")? {
        return Ok(Vec::new());
    }
    let columns = table_columns(source, "page_revisions")?;
    for required_column in ["page_id", "revision", "body_markdown"] {
        if !columns.contains(required_column) {
            return Err(format!(
                "선택한 DB의 page_revisions 테이블에 '{}' 컬럼이 없습니다.",
                required_column
            ));
        }
    }
    let query = format!(
        "SELECT page_id, revision, body_markdown, {}, {} FROM page_revisions ORDER BY page_id, revision",
        column_expr(&columns, "created_at", "''"),
        column_expr(&columns, "source", "'import'"),
    );
    let mut statement = source
        .prepare(&query)
        .map_err(|error| format!("Failed to prepare imported revision query: {error}"))?;
    let rows = statement
        .query_map([], |row| {
            Ok(ImportedPageRevision {
                page_id: row.get(0)?,
                revision: row.get(1)?,
                body_markdown: row.get(2)?,
                created_at: row.get(3)?,
                source: row.get(4)?,
            })
        })
        .map_err(|error| format!("Failed to read imported revisions: {error}"))?;
    rows.collect::<Result<Vec<_>>>()
        .map_err(|error| format!("Failed to decode imported revision: {error}"))
}

fn import_page_revision(
    target: &Connection,
    target_page_id: &str,
    revision: &ImportedPageRevision,
) -> std::result::Result<bool, String> {
    let existing_body: Option<String> = target
        .query_row(
            "SELECT body_markdown FROM page_revisions WHERE page_id=?1 AND revision=?2",
            params![target_page_id, revision.revision],
            |row| row.get(0),
        )
        .optional()
        .map_err(|error| format!("Failed to inspect imported revision: {error}"))?;
    if existing_body.as_deref() == Some(revision.body_markdown.as_str()) {
        return Ok(false);
    }
    let target_revision = if existing_body.is_some() {
        target
            .query_row(
                "SELECT COALESCE(MAX(revision), 0) + 1 FROM page_revisions WHERE page_id=?1",
                [target_page_id],
                |row| row.get::<_, i64>(0),
            )
            .map_err(|error| format!("Failed to allocate imported revision: {error}"))?
    } else {
        revision.revision
    };
    let created_at = if revision.created_at.trim().is_empty() {
        chrono::Utc::now().to_rfc3339()
    } else {
        revision.created_at.clone()
    };
    target
        .execute(
            "INSERT INTO page_revisions(page_id, revision, body_markdown, created_at, source)
             VALUES (?1, ?2, ?3, ?4, ?5)",
            params![
                target_page_id,
                target_revision,
                revision.body_markdown,
                created_at,
                format!("import:{}", revision.source),
            ],
        )
        .map_err(|error| format!("Failed to import page revision: {error}"))?;
    target
        .execute(
            "UPDATE pages SET revision=MAX(revision, ?2) WHERE id=?1",
            params![target_page_id, target_revision],
        )
        .map_err(|error| format!("Failed to update imported page revision: {error}"))?;
    Ok(true)
}

fn table_exists(source: &Connection, table: &str) -> std::result::Result<bool, String> {
    source
        .query_row(
            "SELECT EXISTS(SELECT 1 FROM sqlite_master WHERE type='table' AND name=?1)",
            [table],
            |row| row.get(0),
        )
        .map_err(|error| format!("Failed to inspect table '{table}': {error}"))
}

fn read_source_schema_version(source: &Connection) -> std::result::Result<Option<i64>, String> {
    if !table_exists(source, "schema_migrations")? {
        return Ok(None);
    }
    source
        .query_row("SELECT MAX(version) FROM schema_migrations", [], |row| {
            row.get(0)
        })
        .map_err(|error| format!("Failed to read imported schema version: {error}"))
}

fn table_columns(source: &Connection, table: &str) -> std::result::Result<HashSet<String>, String> {
    let mut stmt = source
        .prepare(&format!("PRAGMA table_info({})", table))
        .map_err(|error| format!("Failed to read {} schema: {}", table, error))?;
    let rows = stmt
        .query_map([], |row| row.get::<_, String>(1))
        .map_err(|error| format!("Failed to query {} columns: {}", table, error))?;

    let mut columns = HashSet::new();
    for column in rows {
        columns.insert(column.map_err(|error| format!("Failed to decode column name: {}", error))?);
    }
    Ok(columns)
}

fn column_expr(columns: &HashSet<String>, column: &str, fallback: &str) -> String {
    if columns.contains(column) {
        column.to_string()
    } else {
        fallback.to_string()
    }
}

fn normalize_optional_string(value: Option<String>) -> Option<String> {
    value.and_then(|text| {
        let trimmed = text.trim();
        if trimmed.is_empty() {
            None
        } else {
            Some(trimmed.to_string())
        }
    })
}

fn date_key_from_created_at(created_at: &str) -> Option<String> {
    created_at.get(0..10).and_then(|date_key| {
        if date_key.len() == 10 {
            Some(date_key.to_string())
        } else {
            None
        }
    })
}

fn pages_are_same_for_import(existing: &Page, imported: &Page) -> bool {
    existing.title == imported.title
        && existing.icon == imported.icon
        && existing.project_parent_id == imported.project_parent_id
        && existing.project_index == imported.project_index
        && existing.date_key == imported.date_key
        && existing.content == imported.content
        && existing.page_type == imported.page_type
        && existing.tags == imported.tags
}

fn unique_import_id(
    base_id: &str,
    import_stamp: &str,
    index: usize,
    occupied_ids: &HashSet<String>,
) -> String {
    let prefix = if base_id.trim().is_empty() {
        "page"
    } else {
        base_id.trim()
    };
    let mut attempt = 0;
    loop {
        let candidate = format!("{}-import-{}-{}-{}", prefix, import_stamp, index, attempt);
        if !occupied_ids.contains(&candidate) {
            return candidate;
        }
        attempt += 1;
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::time::{SystemTime, UNIX_EPOCH};

    fn in_memory_database() -> Database {
        Database {
            conn: Connection::open_in_memory().unwrap(),
        }
    }

    fn import_test_directory(name: &str) -> PathBuf {
        let nonce = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .expect("clock")
            .as_nanos();
        let directory = std::env::temp_dir().join(format!(
            "memoji-import-{name}-{}-{nonce}",
            std::process::id()
        ));
        std::fs::create_dir_all(&directory).expect("create import test directory");
        directory
    }

    fn create_import_source(path: &Path, page_id: &str, content: &str) {
        let source = Connection::open(path).expect("open source database");
        source
            .execute_batch(
                "CREATE TABLE pages (
                    id TEXT PRIMARY KEY,
                    title TEXT NOT NULL,
                    icon TEXT NOT NULL,
                    parent_id TEXT,
                    content TEXT NOT NULL,
                    created_at TEXT NOT NULL,
                    updated_at TEXT NOT NULL,
                    type TEXT NOT NULL,
                    tags TEXT NOT NULL,
                    page_order INTEGER NOT NULL
                );",
            )
            .expect("create source schema");
        source
            .execute(
                "INSERT INTO pages
                    (id, title, icon, parent_id, content, created_at, updated_at, type, tags, page_order)
                 VALUES (?1, '가져온 메모', '📄', NULL, ?2,
                    '2026-08-16T00:00:00Z', '2026-08-16T00:00:00Z', 'page', '[]', 0)",
                params![page_id, content],
            )
            .expect("insert source page");
    }

    fn create_file_target(path: &Path) -> Database {
        let database = Database::new(path.to_path_buf()).expect("open target database");
        database.init().expect("init target database");
        database
    }

    fn export_test_page(
        id: &str,
        title: &str,
        page_type: &str,
        project_parent_id: Option<&str>,
        date_key: Option<&str>,
        order: i32,
    ) -> Page {
        Page {
            id: id.to_string(),
            title: title.to_string(),
            icon: if page_type == "folder" {
                "📁"
            } else {
                "📄"
            }
            .to_string(),
            parent_id: project_parent_id.map(str::to_string),
            project_parent_id: project_parent_id.map(str::to_string),
            project_index: Some(project_parent_id.is_some() || date_key.is_none()),
            date_key: date_key.map(str::to_string),
            content: format!("content for {title}"),
            created_at: "2026-05-01T09:00:00.000".to_string(),
            updated_at: "2026-05-01T09:00:00.000".to_string(),
            page_type: page_type.to_string(),
            tags: vec![],
            order,
        }
    }

    #[test]
    fn export_entries_put_repeated_folder_children_under_that_folder() {
        let pages = vec![
            export_test_page("folder-1", "저장", "folder", None, None, 0),
            export_test_page(
                "child-1",
                "하위 페이지 1",
                "page",
                Some("folder-1"),
                None,
                0,
            ),
            export_test_page(
                "child-2",
                "하위 페이지 2",
                "page",
                Some("folder-1"),
                None,
                1,
            ),
            export_test_page(
                "child-3",
                "하위 페이지 3",
                "page",
                Some("folder-1"),
                None,
                2,
            ),
            export_test_page(
                "child-4",
                "하위 페이지 4",
                "page",
                Some("folder-1"),
                None,
                3,
            ),
        ];

        let entries = build_page_export_entries(&pages);
        let paths: Vec<&str> = entries.iter().map(|entry| entry.path.as_str()).collect();

        assert_eq!(paths.len(), 4);
        assert!(paths.iter().all(|path| path.starts_with("projects/저장/")));
        assert!(paths
            .iter()
            .any(|path| path.contains("하위 페이지 4__child-4.md")));
    }

    #[test]
    fn export_entries_keep_daily_and_project_pages_separate_without_duplicates() {
        let pages = vec![
            export_test_page("daily-1", "새 페이지", "page", None, Some("2026-05-07"), 0),
            export_test_page("folder-1", "프로젝트", "folder", None, None, 0),
            export_test_page("project-1", "새 페이지", "page", Some("folder-1"), None, 0),
        ];

        let entries = build_page_export_entries(&pages);
        let paths: Vec<&str> = entries.iter().map(|entry| entry.path.as_str()).collect();

        assert_eq!(paths.len(), 2);
        assert!(paths.contains(&"daily/2026-05-07/새 페이지__daily-1.md"));
        assert!(paths.contains(&"projects/프로젝트/새 페이지__project-1.md"));
    }

    #[test]
    fn export_entries_sanitize_windows_unsafe_names() {
        let pages = vec![export_test_page(
            "daily:1",
            "A/B: C*?",
            "page",
            None,
            Some("2026-05-07"),
            0,
        )];

        let entries = build_page_export_entries(&pages);

        assert_eq!(entries[0].path, "daily/2026-05-07/A_B_ C____daily_1.md");
    }

    #[test]
    fn imports_legacy_pages_without_project_columns() {
        let target = in_memory_database();
        target.init().unwrap();

        let source = Connection::open_in_memory().unwrap();
        source
            .execute_batch(
                "CREATE TABLE pages (
                    id TEXT PRIMARY KEY,
                    title TEXT NOT NULL,
                    icon TEXT NOT NULL,
                    parent_id TEXT,
                    content TEXT NOT NULL,
                    created_at TEXT NOT NULL,
                    updated_at TEXT NOT NULL,
                    type TEXT NOT NULL,
                    tags TEXT NOT NULL,
                    page_order INTEGER NOT NULL
                );
                INSERT INTO pages
                    (id, title, icon, parent_id, content, created_at, updated_at, type, tags, page_order)
                VALUES
                    ('daily-1', '기존 메모', '📄', NULL, '내용', '2026-05-01T09:00:00.000', '2026-05-01T09:00:00.000', 'page', '[]', 3);",
            )
            .unwrap();

        let summary = target.import_pages_from_connection(&source).unwrap();
        let pages = target.get_pages().unwrap();

        assert_eq!(summary.imported, 1);
        assert_eq!(summary.duplicated, 0);
        assert_eq!(summary.skipped, 0);
        assert_eq!(pages.len(), 1);
        assert_eq!(pages[0].id, "daily-1");
        assert_eq!(pages[0].date_key.as_deref(), Some("2026-05-01"));
        assert_eq!(pages[0].project_index, Some(false));
    }

    #[test]
    fn imports_all_page_revisions_from_a_newer_database_without_hiding_history() {
        let target = in_memory_database();
        target.init().unwrap();

        let source = Connection::open_in_memory().unwrap();
        source
            .execute_batch(
                "CREATE TABLE schema_migrations (version INTEGER PRIMARY KEY);
                 INSERT INTO schema_migrations(version) VALUES (1), (2), (3), (4), (5), (6);
                 CREATE TABLE pages (
                    id TEXT PRIMARY KEY,
                    title TEXT NOT NULL,
                    icon TEXT NOT NULL,
                    parent_id TEXT,
                    project_parent_id TEXT,
                    project_index INTEGER,
                    date_key TEXT,
                    content TEXT NOT NULL,
                    created_at TEXT NOT NULL,
                    updated_at TEXT NOT NULL,
                    type TEXT NOT NULL,
                    tags TEXT NOT NULL,
                    page_order INTEGER NOT NULL,
                    revision INTEGER NOT NULL DEFAULT 0
                 );
                 CREATE TABLE page_revisions (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    page_id TEXT NOT NULL,
                    revision INTEGER NOT NULL,
                    body_markdown TEXT NOT NULL,
                    created_at TEXT NOT NULL,
                    source TEXT NOT NULL DEFAULT 'user',
                    UNIQUE(page_id, revision)
                 );
                 INSERT INTO pages
                    (id, title, icon, parent_id, project_parent_id, project_index, date_key, content, created_at, updated_at, type, tags, page_order, revision)
                 VALUES
                    ('history-1', '이력 메모', '📄', NULL, NULL, 0, '2026-08-16', '세 번째 내용', '2026-08-16T09:00:00Z', '2026-08-16T12:00:00Z', 'page', '[]', 0, 3);
                 INSERT INTO page_revisions(page_id, revision, body_markdown, created_at, source) VALUES
                    ('history-1', 1, '첫 번째 내용', '2026-08-16T10:00:00Z', 'user'),
                    ('history-1', 2, '두 번째 내용', '2026-08-16T11:00:00Z', 'user'),
                    ('history-1', 3, '세 번째 내용', '2026-08-16T12:00:00Z', 'user');",
            )
            .unwrap();

        let summary = target.import_pages_from_connection(&source).unwrap();
        let revisions: Vec<(i64, String)> = target
            .connection()
            .prepare("SELECT revision, body_markdown FROM page_revisions WHERE page_id='history-1' ORDER BY revision")
            .unwrap()
            .query_map([], |row| Ok((row.get(0)?, row.get(1)?)))
            .unwrap()
            .collect::<Result<Vec<_>>>()
            .unwrap();
        let current_revision: i64 = target
            .connection()
            .query_row(
                "SELECT revision FROM pages WHERE id='history-1'",
                [],
                |row| row.get(0),
            )
            .unwrap();

        assert_eq!(summary.source_schema_version, Some(6));
        assert_eq!(summary.revisions_imported, 3);
        assert_eq!(
            revisions,
            vec![
                (1, "첫 번째 내용".to_string()),
                (2, "두 번째 내용".to_string()),
                (3, "세 번째 내용".to_string()),
            ]
        );
        assert_eq!(current_revision, 3);
    }

    #[test]
    fn imports_legacy_parented_pages_as_project_only() {
        let target = in_memory_database();
        target.init().unwrap();

        let source = Connection::open_in_memory().unwrap();
        source
            .execute_batch(
                "CREATE TABLE pages (
                    id TEXT PRIMARY KEY,
                    title TEXT NOT NULL,
                    icon TEXT NOT NULL,
                    parent_id TEXT,
                    content TEXT NOT NULL,
                    created_at TEXT NOT NULL,
                    updated_at TEXT NOT NULL,
                    type TEXT NOT NULL,
                    tags TEXT NOT NULL,
                    page_order INTEGER NOT NULL
                );
                INSERT INTO pages
                    (id, title, icon, parent_id, content, created_at, updated_at, type, tags, page_order)
                VALUES
                    ('folder-1', '프로젝트', '📁', NULL, '', '2026-05-01T09:00:00.000', '2026-05-01T09:00:00.000', 'folder', '[]', 0),
                    ('child-1', '프로젝트 메모', '📄', 'folder-1', '내용', '2026-05-01T10:00:00.000', '2026-05-01T10:00:00.000', 'page', '[]', 1);",
            )
            .unwrap();

        let summary = target.import_pages_from_connection(&source).unwrap();
        let pages = target.get_pages().unwrap();
        let child = pages.iter().find(|page| page.id == "child-1").unwrap();

        assert_eq!(summary.imported, 2);
        assert_eq!(child.project_parent_id.as_deref(), Some("folder-1"));
        assert_eq!(child.date_key, None);
        assert_eq!(child.project_index, Some(true));
    }

    #[test]
    fn import_does_not_attach_dangling_parent_to_target_page() {
        let target = in_memory_database();
        target.init().unwrap();
        target
            .save_page(&Page {
                id: "missing-parent".to_string(),
                title: "기존 프로젝트".to_string(),
                icon: "📁".to_string(),
                parent_id: None,
                project_parent_id: None,
                project_index: Some(true),
                date_key: None,
                content: "".to_string(),
                created_at: "2026-05-01T09:00:00.000".to_string(),
                updated_at: "2026-05-01T09:00:00.000".to_string(),
                page_type: "folder".to_string(),
                tags: vec![],
                order: 0,
            })
            .unwrap();

        let source = Connection::open_in_memory().unwrap();
        source
            .execute_batch(
                "CREATE TABLE pages (
                    id TEXT PRIMARY KEY,
                    title TEXT NOT NULL,
                    icon TEXT NOT NULL,
                    parent_id TEXT,
                    project_parent_id TEXT,
                    project_index INTEGER,
                    date_key TEXT,
                    content TEXT NOT NULL,
                    created_at TEXT NOT NULL,
                    updated_at TEXT NOT NULL,
                    type TEXT NOT NULL,
                    tags TEXT NOT NULL,
                    page_order INTEGER NOT NULL
                );
                INSERT INTO pages
                    (id, title, icon, parent_id, project_parent_id, project_index, date_key, content, created_at, updated_at, type, tags, page_order)
                VALUES
                    ('orphan-child', '고아 메모', '📄', 'missing-parent', 'missing-parent', 1, NULL, '내용', '2026-05-02T09:00:00.000', '2026-05-02T09:00:00.000', 'page', '[]', 0);",
            )
            .unwrap();

        target.import_pages_from_connection(&source).unwrap();
        let pages = target.get_pages().unwrap();
        let imported = pages.iter().find(|page| page.id == "orphan-child").unwrap();

        assert_eq!(imported.project_parent_id, None);
        assert_eq!(imported.parent_id, None);
    }

    #[test]
    fn duplicates_conflicting_ids_without_overwriting_current_pages() {
        let target = in_memory_database();
        target.init().unwrap();
        target
            .save_page(&Page {
                id: "same-id".to_string(),
                title: "현재 메모".to_string(),
                icon: "📄".to_string(),
                parent_id: None,
                project_parent_id: None,
                project_index: Some(false),
                date_key: Some("2026-05-01".to_string()),
                content: "현재 내용".to_string(),
                created_at: "2026-05-01T09:00:00.000".to_string(),
                updated_at: "2026-05-01T09:00:00.000".to_string(),
                page_type: "page".to_string(),
                tags: vec![],
                order: 0,
            })
            .unwrap();

        let source = Connection::open_in_memory().unwrap();
        source
            .execute_batch(
                "CREATE TABLE pages (
                    id TEXT PRIMARY KEY,
                    title TEXT NOT NULL,
                    icon TEXT NOT NULL,
                    parent_id TEXT,
                    project_parent_id TEXT,
                    project_index INTEGER,
                    date_key TEXT,
                    content TEXT NOT NULL,
                    created_at TEXT NOT NULL,
                    updated_at TEXT NOT NULL,
                    type TEXT NOT NULL,
                    tags TEXT NOT NULL,
                    page_order INTEGER NOT NULL
                );
                INSERT INTO pages
                    (id, title, icon, parent_id, project_parent_id, project_index, date_key, content, created_at, updated_at, type, tags, page_order)
                VALUES
                    ('same-id', '가져온 메모', '📄', NULL, NULL, 0, '2026-05-02', '가져온 내용', '2026-05-02T09:00:00.000', '2026-05-02T09:00:00.000', 'page', '[]', 0);",
            )
            .unwrap();

        let summary = target.import_pages_from_connection(&source).unwrap();
        let pages = target.get_pages().unwrap();

        assert_eq!(summary.imported, 0);
        assert_eq!(summary.duplicated, 1);
        assert_eq!(summary.skipped, 0);
        assert_eq!(pages.len(), 2);
        assert!(pages
            .iter()
            .any(|page| page.id == "same-id" && page.content == "현재 내용"));
        assert!(pages
            .iter()
            .any(|page| page.id != "same-id" && page.content == "가져온 내용"));
    }

    #[test]
    fn path_import_rejects_non_sqlite_and_corrupt_databases_without_changing_target() {
        let directory = import_test_directory("reject");
        let target_path = directory.join("target.db");
        let target = create_file_target(&target_path);
        target
            .save_page(&export_test_page(
                "existing",
                "기존 메모",
                "page",
                None,
                Some("2026-08-16"),
                0,
            ))
            .expect("save existing page");

        let text_path = directory.join("not-sqlite.db");
        std::fs::write(&text_path, b"not a sqlite database").expect("write text fixture");
        let text_backup = directory.join("text-backup.db");
        let text_error = target
            .import_pages_from_path(&text_path, &text_backup)
            .expect_err("non-SQLite file must fail");
        assert!(text_error.contains("SQLite memoji.db"));
        assert!(!text_backup.exists());

        let corrupt_path = directory.join("corrupt.db");
        std::fs::write(&corrupt_path, b"SQLite format 3\0corrupt payload")
            .expect("write corrupt fixture");
        let corrupt_backup = directory.join("corrupt-backup.db");
        assert!(target
            .import_pages_from_path(&corrupt_path, &corrupt_backup)
            .is_err());
        assert!(!corrupt_backup.exists());

        let pages = target.get_pages().expect("read unchanged target");
        assert_eq!(pages.len(), 1);
        assert_eq!(pages[0].id, "existing");
        assert!(!directory.join("imports").exists());
        drop(target);
        std::fs::remove_dir_all(directory).expect("clean import test directory");
    }

    #[test]
    fn path_import_streams_large_database_creates_backup_and_merges_duplicates() {
        let directory = import_test_directory("large");
        let target_path = directory.join("target.db");
        let target = create_file_target(&target_path);
        target
            .save_page(&export_test_page(
                "same-id",
                "기존 메모",
                "page",
                None,
                Some("2026-08-16"),
                0,
            ))
            .expect("save existing page");

        let source_path = directory.join("large-source.db");
        create_import_source(&source_path, "same-id", "가져온 내용");
        {
            let source = Connection::open(&source_path).expect("reopen source");
            source
                .execute_batch("CREATE TABLE padding (payload BLOB NOT NULL);")
                .expect("create padding table");
            source
                .execute(
                    "INSERT INTO padding(payload) VALUES (zeroblob(?1))",
                    [33_i64 * 1024 * 1024],
                )
                .expect("pad source over legacy byte-array limit");
        }
        assert!(
            std::fs::metadata(&source_path)
                .expect("source metadata")
                .len()
                > 32 * 1024 * 1024
        );

        let backup_path = directory.join("backups/before-import.db");
        let summary = target
            .import_pages_from_path(&source_path, &backup_path)
            .expect("large path import");
        assert_eq!(summary.duplicated, 1);
        assert!(backup_path.exists());
        assert_eq!(target.get_pages().expect("merged pages").len(), 2);

        let backup = Connection::open_with_flags(&backup_path, OpenFlags::SQLITE_OPEN_READ_ONLY)
            .expect("open backup");
        let backup_count: i64 = backup
            .query_row("SELECT COUNT(*) FROM pages", [], |row| row.get(0))
            .expect("backup count");
        assert_eq!(backup_count, 1);
        drop(backup);
        drop(target);

        std::fs::remove_dir_all(directory).expect("clean import test directory");
    }
}
