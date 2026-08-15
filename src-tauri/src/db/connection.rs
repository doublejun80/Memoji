use super::migrations::{create_backup, migrate_with_backup, validate_quick_check, MigrationError};
use rusqlite::Connection;
use std::path::{Path, PathBuf};

pub fn configure_connection(connection: &Connection) -> Result<(), MigrationError> {
    connection.execute_batch(
        "PRAGMA foreign_keys = ON;
         PRAGMA busy_timeout = 5000;
         PRAGMA journal_mode = WAL;
         PRAGMA synchronous = NORMAL;",
    )?;
    Ok(())
}

pub fn open_database(path: &Path) -> Result<Connection, MigrationError> {
    let should_backup = path.exists()
        && std::fs::metadata(path)
            .map(|meta| meta.len() > 0)
            .unwrap_or(false);
    let mut connection = Connection::open(path)?;
    configure_connection(&connection)?;
    validate_quick_check(&connection)?;

    let backup_path = migration_backup_path(path);
    migrate_with_backup(&mut connection, |connection| {
        if !should_backup {
            return Ok(());
        }
        let artifact = create_backup(connection, &backup_path)?;
        log::info!(
            "SQLite pre-migration backup created: path={}, sha256={}",
            artifact.path.display(),
            artifact.sha256
        );
        Ok(())
    })?;
    Ok(connection)
}

fn migration_backup_path(database_path: &Path) -> PathBuf {
    let timestamp = chrono::Utc::now().format("%Y%m%dT%H%M%SZ");
    let file_name = database_path
        .file_name()
        .and_then(|name| name.to_str())
        .unwrap_or("memoji.db");
    database_path.with_file_name(format!("{file_name}.pre-migration-{timestamp}.bak"))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn configures_safety_pragmas_on_every_connection() {
        let connection = Connection::open_in_memory().expect("in-memory DB");
        configure_connection(&connection).expect("configure connection");

        let foreign_keys: i64 = connection
            .query_row("PRAGMA foreign_keys", [], |row| row.get(0))
            .expect("foreign key pragma");
        let busy_timeout: i64 = connection
            .query_row("PRAGMA busy_timeout", [], |row| row.get(0))
            .expect("busy timeout pragma");
        let synchronous: i64 = connection
            .query_row("PRAGMA synchronous", [], |row| row.get(0))
            .expect("synchronous pragma");

        assert_eq!(foreign_keys, 1);
        assert_eq!(busy_timeout, 5_000);
        assert_eq!(synchronous, 1);
    }
}
