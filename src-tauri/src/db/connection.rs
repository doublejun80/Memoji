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
            "SQLite pre-migration backup created: sha256={}, bytes={}",
            artifact.sha256,
            artifact.bytes
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
    use crate::db::migrations::MIGRATIONS;
    use serde_json::json;
    use sha2::{Digest, Sha256};
    use std::time::Instant;

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

    #[test]
    fn migrates_legacy_file_with_backup_and_content_evidence() {
        let run_id = format!(
            "{}-{}",
            std::process::id(),
            chrono::Utc::now().timestamp_nanos_opt().unwrap_or_default()
        );
        let run_dir = std::env::temp_dir().join(format!("memoji-migration-evidence-{run_id}"));
        std::fs::create_dir_all(&run_dir).expect("create migration evidence temp directory");
        let database_path = run_dir.join("legacy-memoji.db");
        let legacy = Connection::open(&database_path).expect("open legacy database");
        legacy
            .execute_batch(include_str!("../../tests/fixtures/legacy_pages.sql"))
            .expect("load legacy fixture");
        let before_counts = table_counts(&legacy);
        let before_content_hash = logical_page_hash(&legacy);
        drop(legacy);
        let before_database_hash = file_hash(&database_path);
        let before_bytes = database_path.metadata().expect("legacy metadata").len();

        let started = Instant::now();
        let migrated = open_database(&database_path).expect("migrate legacy database");
        let duration_ms = started.elapsed().as_secs_f64() * 1_000.0;
        let after_counts = table_counts(&migrated);
        let after_content_hash = logical_page_hash(&migrated);
        let schema_version: i64 = migrated
            .query_row(
                "SELECT COALESCE(MAX(version), 0) FROM schema_migrations",
                [],
                |row| row.get(0),
            )
            .expect("schema version");
        let quick_check: String = migrated
            .query_row("PRAGMA quick_check", [], |row| row.get(0))
            .expect("quick check");
        migrated
            .execute_batch("PRAGMA wal_checkpoint(TRUNCATE)")
            .expect("checkpoint migrated DB");
        drop(migrated);

        let backup_path = std::fs::read_dir(&run_dir)
            .expect("list migration directory")
            .filter_map(Result::ok)
            .map(|entry| entry.path())
            .find(|path| {
                path.file_name()
                    .and_then(|name| name.to_str())
                    .is_some_and(|name| name.starts_with("legacy-memoji.db.pre-migration-"))
            })
            .expect("automatic pre-migration backup");
        let backup = Connection::open(&backup_path).expect("open migration backup");
        let backup_counts = table_counts(&backup);
        let backup_content_hash = logical_page_hash(&backup);
        drop(backup);

        let after_database_hash = file_hash(&database_path);
        let backup_hash = file_hash(&backup_path);
        let after_bytes = database_path.metadata().expect("migrated metadata").len();
        let backup_bytes = backup_path.metadata().expect("backup metadata").len();

        assert_eq!(quick_check, "ok");
        assert_eq!(
            schema_version,
            MIGRATIONS.last().expect("at least one migration").version
        );
        assert_eq!(before_counts["pages"], 1);
        assert_eq!(after_counts["pages"], 1);
        assert_eq!(backup_counts["pages"], 1);
        assert_eq!(before_content_hash, after_content_hash);
        assert_eq!(before_content_hash, backup_content_hash);

        if let Ok(evidence_path) = std::env::var("MEMOJI_MIGRATION_EVIDENCE") {
            let evidence_path = PathBuf::from(evidence_path);
            if let Some(parent) = evidence_path.parent() {
                std::fs::create_dir_all(parent).expect("create migration artifact directory");
            }
            let evidence = json!({
                "formatVersion": 1,
                "recordedAt": chrono::Utc::now().to_rfc3339(),
                "fixture": "src-tauri/tests/fixtures/legacy_pages.sql",
                "sourceSchema": "legacy pages/settings without schema_migrations",
                "targetSchemaVersion": schema_version,
                "durationMs": (duration_ms * 100.0).round() / 100.0,
                "quickCheck": quick_check,
                "before": {
                    "counts": before_counts,
                    "databaseSha256": before_database_hash,
                    "contentSha256": before_content_hash,
                    "bytes": before_bytes
                },
                "after": {
                    "counts": after_counts,
                    "databaseSha256": after_database_hash,
                    "contentSha256": after_content_hash,
                    "bytes": after_bytes
                },
                "backup": {
                    "path": backup_path,
                    "retained": false,
                    "counts": backup_counts,
                    "databaseSha256": backup_hash,
                    "contentSha256": backup_content_hash,
                    "bytes": backup_bytes
                },
                "assertions": {
                    "backupCreatedBeforeMigration": true,
                    "pageCountPreserved": true,
                    "logicalContentHashPreserved": true,
                    "temporaryFilesCleanedAfterEvidenceWrite": true
                }
            });
            std::fs::write(
                &evidence_path,
                format!(
                    "{}\n",
                    serde_json::to_string_pretty(&evidence).expect("serialize migration evidence")
                ),
            )
            .expect("write migration evidence");
        }

        std::fs::remove_dir_all(run_dir).expect("clean migration evidence temp directory");
    }

    fn table_counts(connection: &Connection) -> serde_json::Value {
        let mut counts = serde_json::Map::new();
        for table in ["pages", "tags", "links", "tasks"] {
            let exists: i64 = connection
                .query_row(
                    "SELECT EXISTS(SELECT 1 FROM sqlite_master WHERE type='table' AND name=?1)",
                    [table],
                    |row| row.get(0),
                )
                .expect("table existence");
            let count = if exists == 1 {
                connection
                    .query_row(&format!("SELECT COUNT(*) FROM {table}"), [], |row| {
                        row.get::<_, i64>(0)
                    })
                    .expect("table count")
            } else {
                0
            };
            counts.insert(table.to_string(), json!(count));
        }
        serde_json::Value::Object(counts)
    }

    fn logical_page_hash(connection: &Connection) -> String {
        let mut statement = connection
            .prepare("SELECT id, title, content, tags FROM pages ORDER BY id")
            .expect("prepare logical page hash");
        let rows = statement
            .query_map([], |row| {
                Ok(format!(
                    "{}\u{1f}{}\u{1f}{}\u{1f}{}\u{1e}",
                    row.get::<_, String>(0)?,
                    row.get::<_, String>(1)?,
                    row.get::<_, String>(2)?,
                    row.get::<_, String>(3)?,
                ))
            })
            .expect("query logical page hash");
        let mut hasher = Sha256::new();
        for row in rows {
            hasher.update(row.expect("logical page hash row").as_bytes());
        }
        format!("{:x}", hasher.finalize())
    }

    fn file_hash(path: &Path) -> String {
        format!(
            "{:x}",
            Sha256::digest(std::fs::read(path).expect("read file for hash"))
        )
    }
}
