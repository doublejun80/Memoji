# Memoji GA Review Hardening Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [x]`) syntax for tracking.

**Goal:** Close the locally actionable correctness gaps found by the 2026-08-16 implementation audit and record every remaining partial or externally blocked acceptance item.

**Architecture:** Canonical Markdown and revisions commit before replaceable derived data; a bounded SQLite job worker owns indexing and task projections. UI search and AI state must report the backend/runtime that actually executed, while diagnostics and release scripts fail closed without exposing document content or credentials.

**Tech Stack:** React 18, TypeScript, Vitest, Tauri 2, Rust, rusqlite/SQLite FTS5, LiteRT-LM 0.16 C API, PowerShell.

## Global Constraints

- Markdown remains the canonical source; derived tags, links, anchors, FTS rows, chunks, and tasks must be rebuildable.
- A derived-data failure must not roll back a committed Markdown body or page revision.
- LiteRT-LM remains in-process with no listener or external endpoint in the GA path.
- No Windows/VDI acceptance claim is allowed without the exact signed artifact and target-pool evidence.
- Existing uncommitted GA worktree changes are preserved; this run does not create commits that would mix unrelated history.
- Every behavior change follows a witnessed RED → GREEN test cycle.

---

### Task 1: Durable derived-data jobs

**Files:**
- Modify: `src-tauri/src/services/page_service.rs`
- Modify: `src-tauri/src/indexing/worker.rs`
- Modify: `src-tauri/src/ai/proposals.rs`
- Modify: `src-tauri/src/lib.rs`
- Test: `src-tauri/src/services/page_service.rs`

**Interfaces:**
- Produces: `IndexWorker::enqueue_page`, `IndexWorker::drain_page_jobs`, and a save contract that returns success after canonical commit even when a derived job fails.

- [x] Add a regression test with a failing FTS trigger that asserts page body and revision survive and the job is `failed`.
- [x] Run the targeted test and verify it fails because indexing still executes in the save transaction.
- [x] Insert a pending `index_page` job in the canonical transaction and move index/task replacement to the post-commit worker.
- [x] Mark successful jobs `complete`; retain truncated errors and bounded attempts for failed jobs.
- [x] Drain pending jobs after save, revision restore, proposal apply, and application startup without converting worker failure into save failure.
- [x] Run page, indexing, task, and proposal service tests and verify all pass.

### Task 2: LiteRT FFI lifecycle safety

**Files:**
- Modify: `src-tauri/src/local_ai/litert_native.rs`
- Test: `src-tauri/src/local_ai/litert_native.rs`

**Interfaces:**
- Produces: one cleanup path that deletes the conversation before releasing callback data and is reached on callback, cancellation, runtime, and UI-event errors.

- [x] Add a focused stream-delivery test whose consumer returns an error and assert the error becomes a loop result rather than an early function return.
- [x] Run the targeted test and verify the missing helper/behavior fails.
- [x] Replace callback `?` propagation with an explicit loop break and keep callback data alive until conversation deletion.
- [x] Add comments documenting the C callback ownership boundary and cancellation drain rule.
- [x] Run LiteRT unit tests and clippy.

### Task 3: Real command-palette task search

**Files:**
- Modify: `src/commands/CommandPalette.tsx`
- Modify: `src/App.tsx`
- Modify: `src/shared/api/taskApi.ts`
- Test: `src/commands/CommandPalette.test.tsx`

**Interfaces:**
- Consumes: `TaskApi.list({ filter: 'all' })`.
- Produces: Task search results in the actual Ctrl/Cmd+K dialog, not only in the pure search helper.

- [x] Add a component test that opens the real palette, types a task title, and expects the backend task result to appear.
- [x] Run the test and verify it fails while the app supplies no tasks.
- [x] Load a compact task snapshot when the palette opens and map it to `SearchTaskSummary`.
- [x] Preserve injected `tasks` for browser/unit adapters and refresh after page revisions.
- [x] Run palette and command-search tests.

### Task 4: Accurate AI execution contracts

**Files:**
- Modify: `src/features/ai/aiTypes.ts`
- Modify: `src/features/ai/AiAssistantPanel.tsx`
- Modify: `src/shared/api/aiApi.ts`
- Modify: `src/types/localAi.ts`
- Modify: `src-tauri/src/ai/runtime/capabilities.rs`
- Modify: `src-tauri/src/local_ai/litert_manager.rs`
- Test: `src/features/ai/AiAssistantPanel.test.tsx`
- Test: `src/types/localAi.test.ts`
- Test: `src-tauri/src/ai/runtime/capabilities.rs`

**Interfaces:**
- Produces: explicit `runtimeFamily` on `AiGenerationRequest`, native transport isolation fields, and a current-page Task extraction quick action.

- [x] Add failing tests for LiteRT run history using `lite_rt`, native auth being not applicable, and the Task quick action.
- [x] Pass the runtime family derived from current capabilities into `finish_ai_run`.
- [x] Replace native `authEnforced=true` semantics with explicit no-external-surface/isolation fields.
- [x] Add a current-page Task extraction action without weakening proposal/revision guards.
- [x] Run AI frontend and Rust capability tests.

### Task 5: Diagnostic and benchmark evidence

**Files:**
- Modify: `src-tauri/src/diagnostics.rs`
- Modify: `src-tauri/src/lib.rs`
- Modify: `src-tauri/src/bin/memoji-vdi-benchmark.rs`
- Test: `src-tauri/src/diagnostics.rs`
- Test: `src-tauri/src/bin/memoji-vdi-benchmark.rs`

**Interfaces:**
- Produces: privacy-safe structured error code, optional latest runtime benchmark summary, iteration-tagged rows, and median/p95 aggregates.

- [x] Add failing diagnostics ZIP assertions for benchmark summary and structured error code while retaining forbidden-content assertions.
- [x] Add failing percentile tests using hand-checked literal samples.
- [x] Extend diagnostics with sanitized metrics only; never include prompts, responses, environment variables, credentials, or absolute paths.
- [x] Add `--iterations` with a default of 10 and emit median/p95 summaries for successful rows.
- [x] Keep host-only RSS/EDR/page-fault requirements explicitly external in report limitations.
- [x] Run diagnostics and benchmark binary tests.

### Task 6: VDI data-path state and log privacy

**Files:**
- Modify: `src-tauri/src/lib.rs`
- Modify: `src/components/SettingsModal.tsx`
- Modify: `src/components/TagInput.tsx`
- Test: `src/test/tauriConfig.test.ts`

**Interfaces:**
- Produces: `get_data_path_status` with source, writability, and persistence warning fields.

- [x] Add a failing path-policy contract test for the persistence warning when no policy path is configured.
- [x] Return structured data-path status while retaining the legacy string command for compatibility.
- [x] Render a concrete warning in Settings and remove tag values and absolute data paths from normal logs.
- [x] Run Settings/accessibility tests and typecheck.

### Task 7: Centralized Tauri command names and fail-closed Windows signing

**Files:**
- Create: `src/shared/api/tauriCommands.ts`
- Modify: `src/shared/api/*.ts`
- Modify: `src/utils/tauriStorage.ts`
- Modify: `src/components/SettingsModal.tsx`
- Modify: `scripts/build-windows-vdi.ps1`
- Modify: `scripts/build-windows-x64.ps1`
- Modify: `scripts/build-windows-avx512.ps1`

**Interfaces:**
- Produces: `TAURI_COMMANDS` as the single frontend command-name registry and explicit unsigned-development override for Windows scripts.

- [x] Centralize all production invoke names and confirm TypeScript compilation catches misspelled registry members.
- [x] Make GA Windows scripts fail when signing inputs are absent; require an explicit `AllowUnsigned` switch for non-release artifacts.
- [x] Verify signatures after signing and generate checksums only after final signed bytes exist.
- [x] Run PowerShell syntax parsing where available and execute frontend typecheck/build.

### Task 8: Task metadata validation and final status report

**Files:**
- Modify: `src-tauri/src/tasks/parser.rs`
- Modify: `src-tauri/src/tasks/service.rs`
- Test: `src-tauri/src/tasks/parser.rs`
- Test: `src-tauri/src/tasks/service.rs`
- Create: `docs/implementation/memoji-ga-hardening-status-2026-08-16.md`

**Interfaces:**
- Produces: calendar-valid task dates, safe assignee annotations, and a requirement-by-requirement status document.

- [x] Add failing tests for impossible dates and assignee values containing annotation delimiters/newlines.
- [x] Validate dates with `chrono::NaiveDate` and reject unsafe metadata before patching Markdown.
- [x] Run task parser/service tests.
- [x] Write the status report with completed local changes, remaining partial items, external blockers, verification commands, and release verdict.
- [x] Run the full frontend/Rust/security/diff verification matrix and record exact results.

## Self-review

- Coverage includes every locally actionable P0/P1 finding from the audit.
- Selection-as-context and an operational Candle fallback remain documented partials because reliable completion needs editor-selection plumbing and verified GGUF/tokenizer deployment assets.
- Windows Authenticode and target-VDI measurements remain external gates; scripts can only fail closed and collect evidence.
- Full `App.tsx`, `SettingsModal.tsx`, `MilkdownEditor.tsx`, and Rust `lib.rs` decomposition remains a staged maintainability follow-up after behavior is protected.
