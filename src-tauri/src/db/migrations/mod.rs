mod v001_baseline;
mod v002_nodes_revisions;
mod v003_tags_links_fts;
mod v004_tasks_events;
mod v005_ai_runs_proposals;

use rusqlite::{params, Connection, OptionalExtension};
use sha2::{Digest, Sha256};
use std::fmt;
use std::path::{Path, PathBuf};

#[cfg(test)]
mod tests;

pub struct Migration {
    pub version: i64,
    pub name: &'static str,
    pub checksum: &'static str,
    pub apply: fn(&Connection) -> rusqlite::Result<()>,
}

pub const MIGRATIONS: &[Migration] = &[
    v001_baseline::MIGRATION,
    v002_nodes_revisions::MIGRATION,
    v003_tags_links_fts::MIGRATION,
    v004_tasks_events::MIGRATION,
    v005_ai_runs_proposals::MIGRATION,
];

#[derive(Debug)]
pub enum MigrationError {
    Sqlite(rusqlite::Error),
    Io(std::io::Error),
    QuickCheckFailed(String),
    ChecksumMismatch {
        version: i64,
        expected: String,
        actual: String,
    },
    UnknownAppliedVersion(i64),
    Backup(String),
}

impl fmt::Display for MigrationError {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            Self::Sqlite(error) => write!(formatter, "SQLite migration failed: {error}"),
            Self::Io(error) => write!(formatter, "SQLite backup I/O failed: {error}"),
            Self::QuickCheckFailed(message) => {
                write!(formatter, "SQLite quick_check failed: {message}")
            }
            Self::ChecksumMismatch {
                version,
                expected,
                actual,
            } => write!(
                formatter,
                "Migration {version} checksum mismatch: expected {expected}, found {actual}",
            ),
            Self::UnknownAppliedVersion(version) => {
                write!(
                    formatter,
                    "Database contains unknown migration version {version}"
                )
            }
            Self::Backup(message) => write!(formatter, "SQLite backup failed: {message}"),
        }
    }
}

impl std::error::Error for MigrationError {}

impl From<rusqlite::Error> for MigrationError {
    fn from(error: rusqlite::Error) -> Self {
        Self::Sqlite(error)
    }
}

impl From<std::io::Error> for MigrationError {
    fn from(error: std::io::Error) -> Self {
        Self::Io(error)
    }
}

pub fn validate_quick_check(connection: &Connection) -> Result<(), MigrationError> {
    let value: String = connection.query_row("PRAGMA quick_check", [], |row| row.get(0))?;
    validate_quick_check_value(&value)
}

pub fn validate_quick_check_value(value: &str) -> Result<(), MigrationError> {
    if value.eq_ignore_ascii_case("ok") {
        Ok(())
    } else {
        Err(MigrationError::QuickCheckFailed(value.to_string()))
    }
}

pub fn migrate_with_backup<F>(
    connection: &mut Connection,
    mut before_migration: F,
) -> Result<(), MigrationError>
where
    F: FnMut(&Connection) -> Result<(), MigrationError>,
{
    validate_quick_check(connection)?;
    let migration_table_exists = table_exists(connection, "schema_migrations")?;
    let applied = if migration_table_exists {
        read_applied_migrations(connection)?
    } else {
        Vec::new()
    };
    validate_applied_migrations(&applied)?;

    let pending = MIGRATIONS
        .iter()
        .filter(|migration| {
            !applied
                .iter()
                .any(|(version, _)| *version == migration.version)
        })
        .collect::<Vec<_>>();
    if pending.is_empty() {
        return Ok(());
    }

    before_migration(connection)?;
    connection.execute_batch(
        "CREATE TABLE IF NOT EXISTS schema_migrations (
            version INTEGER PRIMARY KEY,
            name TEXT NOT NULL,
            checksum TEXT NOT NULL,
            applied_at TEXT NOT NULL
        );",
    )?;

    for migration in pending {
        connection.execute_batch("BEGIN IMMEDIATE")?;
        let result = (|| -> Result<(), MigrationError> {
            (migration.apply)(connection)?;
            connection.execute(
                "INSERT INTO schema_migrations (version, name, checksum, applied_at)
                 VALUES (?1, ?2, ?3, strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))",
                params![migration.version, migration.name, migration.checksum],
            )?;
            Ok(())
        })();

        match result {
            Ok(()) => connection.execute_batch("COMMIT")?,
            Err(error) => {
                let _ = connection.execute_batch("ROLLBACK");
                return Err(error);
            }
        }
    }

    validate_quick_check(connection)
}

fn table_exists(connection: &Connection, name: &str) -> rusqlite::Result<bool> {
    connection
        .query_row(
            "SELECT 1 FROM sqlite_master WHERE type='table' AND name=?1",
            [name],
            |_row| Ok(true),
        )
        .optional()
        .map(|value| value.unwrap_or(false))
}

fn read_applied_migrations(connection: &Connection) -> rusqlite::Result<Vec<(i64, String)>> {
    let mut statement =
        connection.prepare("SELECT version, checksum FROM schema_migrations ORDER BY version")?;
    let migrations = statement
        .query_map([], |row| Ok((row.get(0)?, row.get(1)?)))?
        .collect();
    migrations
}

fn validate_applied_migrations(applied: &[(i64, String)]) -> Result<(), MigrationError> {
    for (version, actual_checksum) in applied {
        let Some(migration) = MIGRATIONS
            .iter()
            .find(|migration| migration.version == *version)
        else {
            return Err(MigrationError::UnknownAppliedVersion(*version));
        };
        if actual_checksum != migration.checksum {
            return Err(MigrationError::ChecksumMismatch {
                version: *version,
                expected: migration.checksum.to_string(),
                actual: actual_checksum.clone(),
            });
        }
    }
    Ok(())
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct BackupArtifact {
    pub path: PathBuf,
    pub sha256: String,
    pub bytes: u64,
}

pub fn create_backup(
    connection: &Connection,
    backup_path: &Path,
) -> Result<BackupArtifact, MigrationError> {
    if backup_path.exists() {
        return Err(MigrationError::Backup(format!(
            "backup target already exists: {}",
            backup_path.display(),
        )));
    }
    connection
        .execute(
            "VACUUM main INTO ?1",
            [backup_path.to_string_lossy().as_ref()],
        )
        .map_err(MigrationError::Sqlite)?;
    let bytes = std::fs::read(backup_path)?;
    let byte_count = bytes.len() as u64;
    let sha256 = format!("{:x}", Sha256::digest(bytes));
    Ok(BackupArtifact {
        path: backup_path.to_path_buf(),
        sha256,
        bytes: byte_count,
    })
}
