use super::Migration;
use rusqlite::Connection;

pub const MIGRATION: Migration = Migration {
    version: 4,
    name: "markdown_tasks_and_events",
    checksum: "sha256:1ed39f201012a0701600fefcc7f7ffbe51248889d720586e0db53b86fa18f70e",
    apply,
};

fn apply(connection: &Connection) -> rusqlite::Result<()> {
    connection.execute_batch(
        "CREATE TABLE IF NOT EXISTS tasks (
            id TEXT PRIMARY KEY,
            page_id TEXT NOT NULL REFERENCES pages(id) ON DELETE CASCADE,
            project_id TEXT,
            text TEXT NOT NULL,
            completed INTEGER NOT NULL DEFAULT 0,
            due_date TEXT,
            priority INTEGER,
            line INTEGER NOT NULL,
            source_start INTEGER NOT NULL,
            source_end INTEGER NOT NULL,
            source_hash TEXT NOT NULL,
            updated_at TEXT NOT NULL
         );
         CREATE INDEX IF NOT EXISTS idx_tasks_page ON tasks(page_id, line);
         CREATE INDEX IF NOT EXISTS idx_tasks_due ON tasks(completed, due_date);
         CREATE INDEX IF NOT EXISTS idx_tasks_project ON tasks(project_id, completed);
         CREATE TABLE IF NOT EXISTS events (
            id TEXT PRIMARY KEY,
            title TEXT NOT NULL,
            start_at TEXT NOT NULL,
            end_at TEXT,
            all_day INTEGER NOT NULL DEFAULT 0,
            timezone TEXT NOT NULL DEFAULT 'local',
            page_id TEXT REFERENCES pages(id) ON DELETE SET NULL,
            notes TEXT NOT NULL DEFAULT '',
            created_at TEXT NOT NULL,
            updated_at TEXT NOT NULL
         );
         CREATE INDEX IF NOT EXISTS idx_events_range ON events(start_at, end_at);",
    )?;
    Ok(())
}
