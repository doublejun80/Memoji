use super::{
    create_backup, migrate_with_backup, validate_quick_check_value, MigrationError, MIGRATIONS,
};
use rusqlite::Connection;
use std::cell::Cell;
use std::path::PathBuf;

fn has_table(connection: &Connection, name: &str) -> bool {
    connection
        .query_row(
            "SELECT EXISTS(SELECT 1 FROM sqlite_master WHERE type='table' AND name=?1)",
            [name],
            |row| row.get::<_, i64>(0),
        )
        .expect("schema query")
        == 1
}

#[test]
fn migrates_empty_database_to_current_schema() {
    let mut connection = Connection::open_in_memory().expect("in-memory DB");
    migrate_with_backup(&mut connection, |_connection| Ok(())).expect("empty migration");

    assert!(has_table(&connection, "pages"));
    assert!(has_table(&connection, "nodes"));
    assert!(has_table(&connection, "page_revisions"));
    assert!(has_table(&connection, "ai_runs"));
    assert!(has_table(&connection, "ai_run_sources"));
    assert!(has_table(&connection, "ai_proposals"));
    let count: i64 = connection
        .query_row("SELECT COUNT(*) FROM schema_migrations", [], |row| {
            row.get(0)
        })
        .expect("migration count");
    assert_eq!(count, MIGRATIONS.len() as i64);
}

#[test]
fn upgrades_legacy_pages_and_settings_without_losing_rows() {
    let mut connection = Connection::open_in_memory().expect("in-memory DB");
    connection
        .execute_batch(include_str!("../../../tests/fixtures/legacy_pages.sql"))
        .expect("legacy fixture");

    migrate_with_backup(&mut connection, |_connection| Ok(())).expect("legacy migration");

    let title: String = connection
        .query_row("SELECT title FROM pages WHERE id='legacy-1'", [], |row| {
            row.get(0)
        })
        .expect("legacy page remains");
    let node_title: String = connection
        .query_row("SELECT title FROM nodes WHERE id='legacy-1'", [], |row| {
            row.get(0)
        })
        .expect("legacy node backfilled");
    assert_eq!(title, "기존 메모");
    assert_eq!(node_title, title);
}

#[test]
fn records_each_migration_once() {
    let mut connection = Connection::open_in_memory().expect("in-memory DB");
    let backups = Cell::new(0);
    migrate_with_backup(&mut connection, |_connection| {
        backups.set(backups.get() + 1);
        Ok(())
    })
    .expect("first migration");
    migrate_with_backup(&mut connection, |_connection| {
        backups.set(backups.get() + 1);
        Ok(())
    })
    .expect("second migration is no-op");

    assert_eq!(backups.get(), 1);
    let count: i64 = connection
        .query_row("SELECT COUNT(*) FROM schema_migrations", [], |row| {
            row.get(0)
        })
        .expect("migration count");
    assert_eq!(count, MIGRATIONS.len() as i64);
}

#[test]
fn checksum_mismatch_fails_closed() {
    let mut connection = Connection::open_in_memory().expect("in-memory DB");
    migrate_with_backup(&mut connection, |_connection| Ok(())).expect("first migration");
    connection
        .execute(
            "UPDATE schema_migrations SET checksum='tampered' WHERE version=1",
            [],
        )
        .expect("tamper checksum");

    let error = migrate_with_backup(&mut connection, |_connection| Ok(()))
        .expect_err("checksum mismatch must fail");
    assert!(matches!(
        error,
        MigrationError::ChecksumMismatch { version: 1, .. }
    ));
}

#[test]
fn quick_check_failure_is_rejected() {
    let error = validate_quick_check_value("*** in database main ***\nPage 3 is never used")
        .expect_err("corrupt result must fail");
    assert!(matches!(error, MigrationError::QuickCheckFailed(_)));
}

#[test]
fn pre_migration_backup_callback_runs_before_schema_changes() {
    let mut connection = Connection::open_in_memory().expect("in-memory DB");
    connection
        .execute_batch(include_str!("../../../tests/fixtures/legacy_pages.sql"))
        .expect("legacy fixture");
    let saw_schema_migrations = Cell::new(true);

    migrate_with_backup(&mut connection, |connection| {
        saw_schema_migrations.set(has_table(connection, "schema_migrations"));
        Ok(())
    })
    .expect("migration with backup callback");

    assert!(!saw_schema_migrations.get());
}

#[test]
fn vacuum_backup_records_sha256_and_preserves_data() {
    let database_path = unique_temp_path("source.db");
    let backup_path = unique_temp_path("backup.db");
    let connection = Connection::open(&database_path).expect("source DB");
    connection
        .execute_batch("CREATE TABLE sample(value TEXT); INSERT INTO sample VALUES ('보존');")
        .expect("source fixture");

    let artifact = create_backup(&connection, &backup_path).expect("backup artifact");
    assert_eq!(artifact.path, backup_path);
    assert_eq!(artifact.sha256.len(), 64);
    assert_eq!(
        artifact.bytes,
        std::fs::metadata(&artifact.path)
            .expect("backup metadata")
            .len()
    );
    assert!(artifact.bytes > 0);
    assert!(artifact
        .sha256
        .chars()
        .all(|character| character.is_ascii_hexdigit()));
    let backup = Connection::open(&artifact.path).expect("open backup");
    let value: String = backup
        .query_row("SELECT value FROM sample", [], |row| row.get(0))
        .expect("backup row");
    assert_eq!(value, "보존");

    drop(backup);
    drop(connection);
    let _ = std::fs::remove_file(database_path);
    let _ = std::fs::remove_file(backup_path);
}

fn unique_temp_path(suffix: &str) -> PathBuf {
    std::env::temp_dir().join(format!(
        "memoji-migration-{}-{}-{suffix}",
        std::process::id(),
        chrono::Utc::now().timestamp_nanos_opt().unwrap_or_default(),
    ))
}
