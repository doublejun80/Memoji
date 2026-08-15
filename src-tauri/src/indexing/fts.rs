use super::IndexedChunk;
use rusqlite::{params, Connection};

pub fn replace_page_fts(
    connection: &Connection,
    page_id: &str,
    title: &str,
    tags: &[String],
    body: &str,
    chunks: &[IndexedChunk],
) -> rusqlite::Result<()> {
    connection.execute("DELETE FROM page_chunks WHERE page_id=?1", [page_id])?;
    for (index, chunk) in chunks.iter().enumerate() {
        connection.execute(
            "INSERT INTO page_chunks (page_id, chunk_index, anchor, text) VALUES (?1, ?2, ?3, ?4)",
            params![page_id, index as i64, chunk.anchor, chunk.text],
        )?;
    }
    connection.execute("DELETE FROM page_fts WHERE page_id=?1", [page_id])?;
    connection.execute(
        "INSERT INTO page_fts (page_id, title, tags, body) VALUES (?1, ?2, ?3, ?4)",
        params![page_id, title, tags.join(" "), body],
    )?;
    Ok(())
}
