# Codex Phase 06 · DB V3, Revisions and FTS

Implement Tasks 11–13.

- Add versioned immutable migrations with checksums.
- Configure foreign keys, WAL and busy timeout.
- Create Workspace, Node, Page, Revision, Job, Tag, Link, Anchor and FTS structures.
- Back up the database before migration.
- Replace `INSERT OR REPLACE` with UPSERT.
- Split page summaries from page bodies.
- Add optimistic revision conflict checks.
- Build derived indexes from Markdown.
- Implement SQLite FTS and a Korean short-query fallback.
- Switch the Command Palette to backend search.
- Add synthetic migration and 10,000-page search fixtures.

Never use the user's real database as a test fixture.
