use super::Migration;
use rusqlite::Connection;

pub const MIGRATION: Migration = Migration {
    version: 3,
    name: "tags_links_anchors_fts",
    checksum: "sha256:bea6b4909ce955e58019964182e587fbcfba6f40462ac79abf8fa72cfcf9b502",
    apply,
};

fn apply(connection: &Connection) -> rusqlite::Result<()> {
    connection.execute_batch(
        "CREATE TABLE IF NOT EXISTS tags (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL COLLATE NOCASE UNIQUE
         );
         CREATE TABLE IF NOT EXISTS page_tags (
            page_id TEXT NOT NULL REFERENCES pages(id) ON DELETE CASCADE,
            tag_id INTEGER NOT NULL REFERENCES tags(id) ON DELETE CASCADE,
            PRIMARY KEY(page_id, tag_id)
         );
         CREATE TABLE IF NOT EXISTS links (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            source_page_id TEXT NOT NULL REFERENCES pages(id) ON DELETE CASCADE,
            target_title TEXT NOT NULL,
            target_page_id TEXT,
            target_anchor TEXT,
            label TEXT,
            source_start INTEGER NOT NULL,
            source_end INTEGER NOT NULL
         );
         CREATE INDEX IF NOT EXISTS idx_links_target_page ON links(target_page_id);
         CREATE INDEX IF NOT EXISTS idx_links_target_title ON links(target_title);
         CREATE TABLE IF NOT EXISTS anchors (
            page_id TEXT NOT NULL REFERENCES pages(id) ON DELETE CASCADE,
            slug TEXT NOT NULL,
            heading TEXT NOT NULL,
            level INTEGER NOT NULL,
            line INTEGER NOT NULL,
            PRIMARY KEY(page_id, slug)
         );
         CREATE TABLE IF NOT EXISTS page_chunks (
            page_id TEXT NOT NULL REFERENCES pages(id) ON DELETE CASCADE,
            chunk_index INTEGER NOT NULL,
            anchor TEXT,
            text TEXT NOT NULL,
            PRIMARY KEY(page_id, chunk_index)
         );
         CREATE VIRTUAL TABLE IF NOT EXISTS page_fts USING fts5(
            page_id UNINDEXED,
            title,
            tags,
            body,
            tokenize='unicode61 remove_diacritics 0'
         );
         INSERT INTO page_fts (page_id, title, tags, body)
         SELECT id, title, tags, content FROM pages
         WHERE deleted_at IS NULL
           AND NOT EXISTS (SELECT 1 FROM page_fts WHERE page_fts.page_id = pages.id);",
    )?;
    Ok(())
}
