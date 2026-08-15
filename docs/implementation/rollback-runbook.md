# Memoji 2.0 GA rollback runbook

This runbook is the release-operator procedure for recovering data or reverting an application rollout. Treat the path shown in **Settings → Data → storage location** as authoritative; do not guess it from the installer location.

## Recovery invariants

- Stop Memoji before copying or replacing `memoji.db`, `memoji.db-wal`, or `memoji.db-shm`.
- Preserve the failed data directory and installer before changing anything.
- Record SHA-256 hashes for the source, backup, and restored database.
- Never open a newer-schema database with an older Memoji binary. Restore the pre-upgrade database together with the older binary.
- Never delete the only usable backup. Copy first, validate second, and clean up only after user acceptance.

## Locate and preserve the active data

Memoji resolves storage in this order:

1. `MEMOJI_DATA_PATH`, when explicitly configured.
2. A writable `data` directory beside the executable.
3. The OS-local application data directory, ending in `Memoji/data` (for example `%LOCALAPPDATA%\Memoji\data` on Windows).

Open **Settings → Data** and record the exact path before closing the app. Copy the entire directory to a timestamped incident folder. Include `memoji.db`, any `-wal`/`-shm` companions, `backups/`, and `exports/`.

Windows hash command:

```powershell
Get-FileHash "<data-path>\memoji.db" -Algorithm SHA256
```

macOS/Linux hash command:

```bash
shasum -a 256 "<data-path>/memoji.db"
```

## Data rollback after a failed import

Every native DB import creates `backups/memoji-before-import-<timestamp>.db` before the merge transaction. A rejected non-SQLite or structurally invalid source does not create a backup and does not change the live DB.

1. Close Memoji and confirm no Memoji process remains.
2. Preserve the current data directory as described above.
3. Select the newest pre-import backup that predates the failed operation.
4. Verify it is SQLite (`SQLite format 3` header) and run `PRAGMA quick_check` with a trusted SQLite client; the result must be `ok`.
5. Copy the live `memoji.db` to an incident filename. Do not overwrite it in place without this copy.
6. Copy the selected backup to `memoji.db`; remove stale `memoji.db-wal` and `memoji.db-shm` only after the live DB has been preserved.
7. Start the same Memoji version, compare page/task counts, open representative pages, then create and reopen one temporary note.
8. Record before/after hashes, selected backup, application version, schema version, counts, and validation result.

## Application-version rollback

1. Stop Memoji and preserve the data and current installer.
2. Verify the downloaded older installer against its published `SHA256SUMS` and retain its `NOTICE.md` and `sbom.cdx.json`.
3. Restore the database backup created before the newer application first ran. Database migrations are forward-only; uninstalling the binary does not downgrade the schema.
4. Install the prior signed build. Keep the existing `MEMOJI_DATA_PATH` policy unchanged.
5. Start offline, confirm the storage path and representative data, and only then reconnect the VDI/network profile.
6. If no matching pre-upgrade DB exists, stop. Escalate for an explicit data-conversion procedure instead of opening the newer DB with the older app.

## Export archive recovery

GA ZIP exports contain:

- `manifest.json` with app/schema versions, counts, per-page revision and Markdown hashes, DB size/hash, and an attachment manifest.
- `database/memoji.db`, a consistent SQLite snapshot.
- human-readable Markdown files under `daily/` and `projects/`.

Before restoring, verify the embedded database SHA-256 and representative Markdown hashes against `manifest.json`. Extract `database/memoji.db` to a separate staging directory and use **Settings → Data → Import DB** so Memoji performs validation, backup, and transactional merge. Do not manually replace the live DB while Memoji is running.

## Local AI bundle rollback

The note database remains usable when the local AI runtime or model is unavailable. For an AI-only regression:

1. Disable the managed runtime in Settings and verify editing/search without AI.
2. Preserve the runtime bundle, `runtime-compatibility.json`, registry/model tree, and their hashes.
3. Restore the last approved runtime/model pair as a unit. Do not combine an unverified LiteRT runtime with a model bundle from another manifest.
4. Honor explicit `MEMOJI_LITERT_REGISTRY`, `MEMOJI_GEMMA_GGUF`, and tokenizer overrides.
5. Run the runtime verification script and one local benchmark before re-enabling AI for users.

## Release abort and evidence

Keep GitHub releases in draft state until all platform jobs have produced installer artifacts, `SHA256SUMS`, `sbom.cdx.json`, and `NOTICE.md`, and signing/notarization evidence has been independently checked. Missing Windows VDI runtime evidence is a release blocker for the bundled-AI claim, not a documentation-only exception.

For every rollback retain: incident time, operator, app version/commit, OS/VDI image, active data path, schema version, DB hashes and counts, selected backup/export, installer checksum/signature result, local-AI bundle manifest, commands run, and final user validation.
