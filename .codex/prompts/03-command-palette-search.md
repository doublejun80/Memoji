# Codex Phase 03 · Command Palette and Search Entry

Implement Task 5.

- Build an `AppCommand` registry.
- Use existing `cmdk`.
- Ctrl+K must open one palette for commands, pages, tasks and recent items.
- Use current in-memory page search behind `searchApi` until FTS arrives.
- Remove duplicate production entry points only after references are migrated.
- Preserve keyboard and Korean IME behavior.
- Add component and pure-function tests.
- Top Bar search launcher and keyboard shortcut must use the same registry.

Do not implement SQLite FTS in this phase. Leave an explicit API boundary for the backend swap.
