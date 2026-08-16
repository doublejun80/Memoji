use super::Migration;
use rusqlite::Connection;

pub const MIGRATION: Migration = Migration {
    version: 6,
    name: "task_start_and_assignee",
    checksum: "sha256:13bcc56090d10c8f76d870b46bcda375cb9a58f30dac21652106637e0aa23f62",
    apply,
};

fn apply(connection: &Connection) -> rusqlite::Result<()> {
    connection.execute_batch(
        "ALTER TABLE tasks ADD COLUMN start_date TEXT;
         ALTER TABLE tasks ADD COLUMN assignee TEXT;
         CREATE INDEX IF NOT EXISTS idx_tasks_start ON tasks(completed, start_date);
         CREATE INDEX IF NOT EXISTS idx_tasks_assignee ON tasks(assignee, completed);",
    )?;
    Ok(())
}
