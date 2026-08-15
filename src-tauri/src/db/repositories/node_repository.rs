use crate::domain::node::NodeRecord;
use rusqlite::{params, Connection};

pub struct NodeRepository;

impl NodeRepository {
    pub fn upsert(connection: &Connection, node: &NodeRecord) -> rusqlite::Result<()> {
        connection.execute(
            "INSERT INTO nodes (
                id, workspace_id, parent_id, kind, title, sort_order, created_at, updated_at, deleted_at
             ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9)
             ON CONFLICT(id) DO UPDATE SET
                workspace_id=excluded.workspace_id,
                parent_id=excluded.parent_id,
                kind=excluded.kind,
                title=excluded.title,
                sort_order=excluded.sort_order,
                updated_at=excluded.updated_at,
                deleted_at=excluded.deleted_at",
            params![
                node.id,
                node.workspace_id,
                node.parent_id,
                node.kind,
                node.title,
                node.sort_order,
                node.created_at,
                node.updated_at,
                node.deleted_at,
            ],
        )?;
        Ok(())
    }
}
