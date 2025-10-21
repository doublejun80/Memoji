use rusqlite::{Connection, Result, params};
use serde::{Deserialize, Serialize};
use std::path::PathBuf;

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct Page {
    pub id: String,
    pub title: String,
    pub icon: String,
    pub parent_id: Option<String>,
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

impl Database {
    pub fn new(db_path: PathBuf) -> Result<Self> {
        let conn = Connection::open(db_path)?;
        Ok(Database { conn })
    }

    pub fn init(&self) -> Result<()> {
        self.conn.execute(
            "CREATE TABLE IF NOT EXISTS pages (
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
            )",
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

        Ok(())
    }

    pub fn save_page(&self, page: &Page) -> Result<()> {
        let tags_json = serde_json::to_string(&page.tags).unwrap_or_else(|_| "[]".to_string());
        
        self.conn.execute(
            "INSERT OR REPLACE INTO pages (id, title, icon, parent_id, content, created_at, updated_at, type, tags, page_order)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10)",
            params![
                &page.id,
                &page.title,
                &page.icon,
                &page.parent_id,
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
            "SELECT id, title, icon, parent_id, content, created_at, updated_at, type, tags, page_order FROM pages ORDER BY created_at DESC"
        )?;

        let pages = stmt.query_map([], |row| {
            let tags_str: String = row.get(8)?;
            let tags: Vec<String> = serde_json::from_str(&tags_str).unwrap_or_else(|_| vec![]);

            Ok(Page {
                id: row.get(0)?,
                title: row.get(1)?,
                icon: row.get(2)?,
                parent_id: row.get(3)?,
                content: row.get(4)?,
                created_at: row.get(5)?,
                updated_at: row.get(6)?,
                page_type: row.get(7)?,
                tags,
                order: row.get(9)?,
            })
        })?;

        let mut result = Vec::new();
        for page in pages {
            result.push(page?);
        }
        Ok(result)
    }

    pub fn delete_page(&self, page_id: &str) -> Result<()> {
        // 자식 페이지들도 함께 삭제
        let child_ids = self.get_child_page_ids(page_id)?;
        
        for child_id in child_ids {
            self.conn.execute("DELETE FROM pages WHERE id = ?1", params![child_id])?;
        }
        
        self.conn.execute("DELETE FROM pages WHERE id = ?1", params![page_id])?;
        Ok(())
    }

    fn get_child_page_ids(&self, parent_id: &str) -> Result<Vec<String>> {
        let mut stmt = self.conn.prepare("SELECT id FROM pages WHERE parent_id = ?1")?;
        let mut ids = Vec::new();
        
        let rows = stmt.query_map(params![parent_id], |row| {
            row.get(0)
        })?;

        for id_result in rows {
            let id: String = id_result?;
            ids.push(id.clone());
            // 재귀적으로 자식의 자식도 가져오기
            let child_ids = self.get_child_page_ids(&id)?;
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
        let mut stmt = self.conn.prepare("SELECT value FROM settings WHERE key = ?1")?;
        let mut rows = stmt.query(params![key])?;

        if let Some(row) = rows.next()? {
            let value: String = row.get(0)?;
            Ok(Some(value))
        } else {
            Ok(None)
        }
    }
}

