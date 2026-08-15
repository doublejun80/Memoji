use super::Migration;
use rusqlite::Connection;

pub const MIGRATION: Migration = Migration {
    version: 5,
    name: "grounded_ai_runs_and_proposals",
    checksum: "sha256:0b91e451ad3f2aedfd1151363cb221f8a8dcd89789eb163852280ad09432a448",
    apply,
};

fn apply(connection: &Connection) -> rusqlite::Result<()> {
    connection.execute_batch(
        "CREATE TABLE IF NOT EXISTS ai_runs (
            id TEXT PRIMARY KEY,
            page_id TEXT REFERENCES pages(id) ON DELETE SET NULL,
            status TEXT NOT NULL CHECK(status IN ('running', 'completed', 'failed', 'cancelled')),
            prompt_sha256 TEXT NOT NULL,
            prompt_char_count INTEGER NOT NULL,
            object_type TEXT NOT NULL DEFAULT 'page',
            runtime_family TEXT,
            prompt_tokens INTEGER,
            generated_tokens INTEGER,
            error_code TEXT,
            created_at TEXT NOT NULL,
            finished_at TEXT
         );
         CREATE INDEX IF NOT EXISTS idx_ai_runs_page_created
            ON ai_runs(page_id, created_at DESC);
         CREATE TABLE IF NOT EXISTS ai_run_sources (
            run_id TEXT NOT NULL REFERENCES ai_runs(id) ON DELETE CASCADE,
            rank INTEGER NOT NULL,
            page_id TEXT NOT NULL REFERENCES pages(id) ON DELETE CASCADE,
            anchor_slug TEXT,
            heading_path_json TEXT NOT NULL DEFAULT '[]',
            snippet TEXT NOT NULL,
            score REAL NOT NULL,
            source_start INTEGER,
            source_end INTEGER,
            text_hash TEXT,
            PRIMARY KEY(run_id, rank)
         );
         CREATE INDEX IF NOT EXISTS idx_ai_run_sources_page
            ON ai_run_sources(page_id, run_id);
         CREATE TABLE IF NOT EXISTS ai_proposals (
            id TEXT PRIMARY KEY,
            run_id TEXT NOT NULL REFERENCES ai_runs(id) ON DELETE CASCADE,
            page_id TEXT NOT NULL REFERENCES pages(id) ON DELETE CASCADE,
            base_revision INTEGER NOT NULL,
            proposal_type TEXT NOT NULL,
            title TEXT NOT NULL,
            summary TEXT NOT NULL,
            patch_json TEXT NOT NULL,
            sources_json TEXT NOT NULL DEFAULT '[]',
            status TEXT NOT NULL CHECK(status IN ('pending', 'applied', 'rejected', 'conflicted')),
            applied_revision INTEGER,
            created_at TEXT NOT NULL,
            updated_at TEXT NOT NULL
         );
         CREATE INDEX IF NOT EXISTS idx_ai_proposals_page_status
            ON ai_proposals(page_id, status, created_at DESC);",
    )?;
    Ok(())
}
