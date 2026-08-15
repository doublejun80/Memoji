use super::Migration;
use rusqlite::Connection;

pub const MIGRATION: Migration = Migration {
    version: 1,
    name: "baseline_pages_settings",
    checksum: "sha256:87e9c0328ef055fdfbcfda1f24cbc9343f510f216e5283f93bb43c90c74f30d8",
    apply,
};

fn apply(connection: &Connection) -> rusqlite::Result<()> {
    connection.execute_batch(
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
        );
        CREATE TABLE IF NOT EXISTS settings (
            key TEXT PRIMARY KEY,
            value TEXT NOT NULL
        );",
    )?;

    ensure_column(connection, "pages", "project_parent_id", "TEXT")?;
    ensure_column(connection, "pages", "project_index", "INTEGER")?;
    ensure_column(connection, "pages", "date_key", "TEXT")?;
    connection.execute_batch(
        "UPDATE pages
         SET project_parent_id = parent_id
         WHERE project_parent_id IS NULL AND parent_id IS NOT NULL;
         UPDATE pages
         SET date_key = substr(created_at, 1, 10)
         WHERE date_key IS NULL AND created_at IS NOT NULL
           AND (project_index = 0 OR (project_index IS NULL AND project_parent_id IS NULL));
         UPDATE pages SET project_index = 1
         WHERE project_index IS NULL AND project_parent_id IS NOT NULL;
         UPDATE pages SET project_index = 0
         WHERE project_index IS NULL AND date_key IS NOT NULL;
         UPDATE pages SET project_index = 1 WHERE project_index IS NULL;",
    )?;
    Ok(())
}

pub(super) fn ensure_column(
    connection: &Connection,
    table: &str,
    column: &str,
    column_type: &str,
) -> rusqlite::Result<bool> {
    let mut statement = connection.prepare(&format!("PRAGMA table_info({table})"))?;
    let columns = statement.query_map([], |row| row.get::<_, String>(1))?;
    for existing in columns {
        if existing? == column {
            return Ok(false);
        }
    }
    connection.execute(
        &format!("ALTER TABLE {table} ADD COLUMN {column} {column_type}"),
        [],
    )?;
    Ok(true)
}
