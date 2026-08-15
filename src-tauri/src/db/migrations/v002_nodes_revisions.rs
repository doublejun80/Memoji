use super::v001_baseline::ensure_column;
use super::Migration;
use rusqlite::Connection;

pub const MIGRATION: Migration = Migration {
    version: 2,
    name: "nodes_revisions_jobs_workspaces",
    checksum: "sha256:22973ada846a020551699877dc58bd797cf4927e819704244221102d66767cba",
    apply,
};

fn apply(connection: &Connection) -> rusqlite::Result<()> {
    connection.execute_batch(
        "CREATE TABLE IF NOT EXISTS workspaces (
            id TEXT PRIMARY KEY,
            name TEXT NOT NULL,
            created_at TEXT NOT NULL,
            updated_at TEXT NOT NULL
        );
        INSERT INTO workspaces (id, name, created_at, updated_at)
        VALUES ('default', 'Memoji', strftime('%Y-%m-%dT%H:%M:%fZ', 'now'), strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
        ON CONFLICT(id) DO NOTHING;
        CREATE TABLE IF NOT EXISTS nodes (
            id TEXT PRIMARY KEY,
            workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
            parent_id TEXT,
            kind TEXT NOT NULL CHECK(kind IN ('page', 'folder')),
            title TEXT NOT NULL,
            sort_order INTEGER NOT NULL DEFAULT 0,
            created_at TEXT NOT NULL,
            updated_at TEXT NOT NULL,
            deleted_at TEXT
        );",
    )?;

    ensure_column(
        connection,
        "pages",
        "workspace_id",
        "TEXT NOT NULL DEFAULT 'default'",
    )?;
    ensure_column(
        connection,
        "pages",
        "revision",
        "INTEGER NOT NULL DEFAULT 0",
    )?;
    ensure_column(connection, "pages", "deleted_at", "TEXT")?;

    connection.execute_batch(
        "INSERT INTO nodes (
            id, workspace_id, parent_id, kind, title, sort_order, created_at, updated_at, deleted_at
         )
         SELECT id, workspace_id, COALESCE(project_parent_id, parent_id),
                CASE WHEN type = 'folder' THEN 'folder' ELSE 'page' END,
                title, page_order, created_at, updated_at, deleted_at
         FROM pages
         WHERE true
         ON CONFLICT(id) DO UPDATE SET
            parent_id=excluded.parent_id,
            kind=excluded.kind,
            title=excluded.title,
            sort_order=excluded.sort_order,
            updated_at=excluded.updated_at,
            deleted_at=excluded.deleted_at;
         CREATE TABLE IF NOT EXISTS page_revisions (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            page_id TEXT NOT NULL REFERENCES pages(id) ON DELETE CASCADE,
            revision INTEGER NOT NULL,
            body_markdown TEXT NOT NULL,
            created_at TEXT NOT NULL,
            source TEXT NOT NULL DEFAULT 'user',
            UNIQUE(page_id, revision)
         );
         CREATE TABLE IF NOT EXISTS jobs (
            id TEXT PRIMARY KEY,
            kind TEXT NOT NULL,
            page_id TEXT,
            status TEXT NOT NULL,
            attempts INTEGER NOT NULL DEFAULT 0,
            error TEXT,
            created_at TEXT NOT NULL,
            updated_at TEXT NOT NULL
         );",
    )?;
    Ok(())
}
