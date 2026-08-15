# Memoji 2.0 GA Implementation Plan

> **For Codex:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Preserve Memoji's current three-pane Markdown workflow while implementing a resizable VDI-safe workspace, command palette, context hub, revisions, FTS, tasks/calendar, and safe local-AI proposals.

**Architecture:** React is split into App Shell, Workspace, Context Hub, Command and Feature modules. Markdown remains canonical in SQLite. Tags, links, tasks, chunks and FTS are derived indexes. Tauri application services own transactions. AI runtimes implement a capability-based adapter and produce revision-guarded proposals rather than direct replacements.

**Tech Stack:** React 18, TypeScript, Milkdown, Radix UI, cmdk, react-resizable-panels, Tauri 2, Rust, rusqlite/SQLite FTS5, Candle, managed LiteRT-LM loopback runtime.

---

## Global Preconditions

- Work from PR #1 or a branch that contains its save/flush/runtime changes.
- Do not delete user changes.
- Do not claim Windows VDI validation without running it.
- Keep existing main behavior working after each task.
- Add failing tests before implementation.
- Make one focused commit per task.

Baseline commands:

```bash
git status --short
git fetch origin
git fetch origin pull/1/head:memoji-pr1-baseline
git switch -c codex/memoji-2-ga-uiux memoji-pr1-baseline

npm ci
npm run check

cd src-tauri
cargo fmt --check
cargo clippy --all-targets --all-features -- -D warnings
cargo test
cd ..
```

If the branch already exists, verify its base instead of recreating it.

---

## Task 0: Record and Protect the Baseline

**Files:**
- Create: `docs/implementation/baseline-report.md`
- Create: `tests/fixtures/README.md`
- Modify only if missing: `.gitignore`

**Step 1: Record repository state**

```bash
git status --short
git branch --show-current
git rev-parse HEAD
git log -5 --oneline
```

Write the output and PR #1 baseline decision to `docs/implementation/baseline-report.md`.

**Step 2: Verify PR #1 reliability markers**

```bash
rg -n "flushUnsaved|MarkdownEditorHandle|local_ai_managed_runtime_status|requestAnimationFrame" src src-tauri
```

Expected: all four classes of change exist. If not, stop code modification and repair the branch base first.

**Step 3: Run baseline tests**

```bash
npm run check
cd src-tauri
cargo fmt --check
cargo clippy --all-targets --all-features -- -D warnings
cargo test
cd ..
```

Record pass/fail, test counts and ignored model-dependent tests.

**Step 4: Add fixture policy**

`tests/fixtures/README.md` must state that fixtures are synthetic, never copied from the user's real `memoji.db`, and cover old schemas, cycles, Korean text and large notes.

**Step 5: Commit**

```bash
git add docs/implementation/baseline-report.md tests/fixtures/README.md .gitignore
git commit -m "docs: record Memoji GA implementation baseline"
```

---

## Task 1: Add Frontend Component Test Infrastructure

**Files:**
- Modify: `package.json`
- Modify: `package-lock.json`
- Create: `vitest.config.ts`
- Create: `src/test/setup.ts`
- Create: `src/test/render.tsx`
- Create: `src/app/workspaceState.test.ts`

**Step 1: Install test dependencies**

```bash
npm install -D vitest jsdom @testing-library/react @testing-library/user-event @testing-library/jest-dom
```

Add scripts:

```json
{
  "test": "vitest run",
  "test:watch": "vitest",
  "test:ui": "vitest run --project ui",
  "check": "npm run type-check && npm run test:unit && npm run test && npm run build"
}
```

**Step 2: Configure Vitest**

Use `jsdom`, include `src/**/*.test.{ts,tsx}`, load `src/test/setup.ts`, and preserve current `tsx` pure tests.

**Step 3: Write the first failing state test**

Create types expected by later tasks:

```ts
expect(DEFAULT_WORKSPACE_UI_STATE).toMatchObject({
  leftView: 'today',
  workspaceView: 'editor',
  contextTab: 'ai',
  leftOpen: true,
  rightOpen: true,
  leftWidth: 240,
  rightWidth: 304,
});
```

Run:

```bash
npm run test -- src/app/workspaceState.test.ts
```

Expected: FAIL because state module does not exist.

**Step 4: Create minimal state module**

Create `src/app/workspaceState.ts` with types and defaults only.

**Step 5: Verify**

```bash
npm run test -- src/app/workspaceState.test.ts
npm run check
```

**Step 6: Commit**

```bash
git add package.json package-lock.json vitest.config.ts src/test src/app/workspaceState.ts src/app/workspaceState.test.ts
git commit -m "test: add frontend component test foundation"
```

---

## Task 2: Create Workspace State, Reducer and Controller Boundary

**Files:**
- Create: `src/app/workspaceState.ts`
- Create: `src/app/workspaceReducer.ts`
- Create: `src/app/workspaceReducer.test.ts`
- Create: `src/app/useWorkspaceController.ts`
- Create: `src/app/panelLayout.ts`
- Create: `src/app/panelLayout.test.ts`
- Modify: `src/App.tsx` only to wrap the new provider without changing layout yet

**Step 1: Define state types**

```ts
export type LeftView = 'today' | 'daily' | 'projects' | 'tasks' | 'calendar' | 'knowledge';
export type WorkspaceView = 'editor' | 'tasks' | 'calendar' | 'knowledge' | 'search';
export type ContextHubTab = 'ai' | 'outline' | 'links' | 'tasks' | 'properties' | 'search';

export interface WorkspaceUiState {
  leftView: LeftView;
  workspaceView: WorkspaceView;
  contextTab: ContextHubTab;
  leftOpen: boolean;
  rightOpen: boolean;
  leftWidth: number;
  rightWidth: number;
  commandPaletteOpen: boolean;
  focusMode: boolean;
}
```

**Step 2: Write reducer tests**

Cover:

- left view change
- workspace view change
- context tab change
- panel toggle
- width clamping
- command palette open/close

Run:

```bash
npm run test -- src/app/workspaceReducer.test.ts
```

Expected: FAIL.

**Step 3: Implement pure reducer**

No Tauri invoke or localStorage inside reducer.

**Step 4: Write layout mode tests**

```ts
expect(resolveLayoutMode(1440)).toBe('three-pane');
expect(resolveLayoutMode(1024)).toBe('right-overlay');
expect(resolveLayoutMode(800)).toBe('dual-overlay');
```

Implement in `panelLayout.ts`.

**Step 5: Create controller skeleton**

Controller exposes state and actions but delegates current page logic to existing App handlers temporarily. Persist only UI state to `memoji.workspace.ui.v1`.

**Step 6: Verify**

```bash
npm run test -- src/app
npm run check
```

**Step 7: Commit**

```bash
git add src/app src/App.tsx
git commit -m "refactor: establish workspace state boundary"
```

---

## Task 3: Build the Resizable and Responsive App Shell

**Files:**
- Create: `src/app/AppProviders.tsx`
- Create: `src/app/AppShell.tsx`
- Create: `src/workspace/WorkspaceLayout.tsx`
- Create: `src/workspace/WorkspaceLayout.test.tsx`
- Create: `src/styles/tokens.css`
- Create: `src/styles/shell.css`
- Modify: `src/main.tsx`
- Modify: `src/App.tsx`
- Modify: `src/index.css` to import new styles

**Step 1: Write layout test**

Render at mocked widths:

- 1200: left, center, right visible
- 1024: right overlay container
- 800: both overlay containers
- focus: center only

Expected: FAIL.

**Step 2: Create design tokens**

Use exact defaults:

```css
--memoji-topbar-height: 48px;
--memoji-left-panel-default: 240px;
--memoji-left-panel-min: 220px;
--memoji-left-panel-max: 360px;
--memoji-right-panel-default: 304px;
--memoji-right-panel-min: 288px;
--memoji-right-panel-max: 440px;
--memoji-center-min: 560px;
--memoji-statusbar-height: 22px;
```

**Step 3: Implement desktop layout**

Use `PanelGroup`, `Panel`, `PanelResizeHandle`. Use the existing Sidebar, MarkdownEditor and RightPanel as children first.

Do not combine the UI redesign with component replacement in this task.

**Step 4: Implement responsive overlays**

Use `ResizeObserver` on App root. For overlay panels:

- preserve current child components
- click outside and Escape close
- do not trap focus unless modal
- keep explicit toggle buttons

**Step 5: Move provider composition**

`App.tsx` becomes provider and AppShell composition. Existing domain handlers can temporarily remain in a controller adapter.

**Step 6: Verify viewport behavior**

Automated:

```bash
npm run test -- src/workspace/WorkspaceLayout.test.tsx
npm run check
```

Manual or browser automation screenshots:

```text
artifacts/ui/task-03/1440x900.png
artifacts/ui/task-03/1200x800.png
artifacts/ui/task-03/1024x768.png
artifacts/ui/task-03/800x600.png
```

**Step 7: Commit**

```bash
git add src/app src/workspace src/styles src/App.tsx src/main.tsx src/index.css
git commit -m "feat: add resizable VDI-safe workspace shell"
```

---

## Task 4: Create Command Registry and Simplify the Top Bar

**Files:**
- Create: `src/commands/types.ts`
- Create: `src/commands/commandRegistry.ts`
- Create: `src/commands/commandRegistry.test.ts`
- Create: `src/workspace/TopCommandBar.tsx`
- Create: `src/workspace/TopCommandBar.test.tsx`
- Create: `src/workspace/WindowControls.tsx`
- Modify: `src/components/TopBar.tsx` to compatibility wrapper or remove after migration
- Modify: `src/app/keyboardBindings.ts`

**Step 1: Write registry tests**

Required commands:

- `page.new.daily`
- `capture.quick`
- `view.today`
- `view.tasks`
- `view.calendar`
- `ai.open`
- `ai.summarize.current`
- `document.save`
- `document.export`
- `settings.open`
- `focus.toggle`
- `panel.left.toggle`
- `panel.right.toggle`

Test command enabled state and shortcut uniqueness.

**Step 2: Implement registry**

```ts
export interface AppCommand {
  id: string;
  label: string;
  description?: string;
  keywords: string[];
  category: 'navigation' | 'create' | 'document' | 'ai' | 'view' | 'settings';
  shortcut?: string;
  enabled(ctx: CommandContext): boolean;
  run(ctx: CommandContext): void | Promise<void>;
}
```

**Step 3: Write Top Bar test**

Assert persistent controls:

- left toggle
- workspace name
- command launcher
- save state
- runtime state
- right toggle
- overflow
- window controls

Assert theme/export/settings are in overflow, not all persistent.

**Step 4: Implement TopCommandBar**

Reuse existing Tauri window control logic. Await save/export and retain PR #1 error handling.

**Step 5: Bind keys**

Use registry:

- Ctrl+K
- Ctrl+N
- Ctrl+Shift+N
- Ctrl+S
- Ctrl+Shift+A
- Alt+1..6
- F11

Ignore shortcuts while IME composition or protected text inputs unless command is global.

**Step 6: Verify**

```bash
npm run test -- src/commands src/workspace/TopCommandBar.test.tsx
npm run check
```

**Step 7: Commit**

```bash
git add src/commands src/workspace/TopCommandBar.tsx src/workspace/TopCommandBar.test.tsx src/workspace/WindowControls.tsx src/app/keyboardBindings.ts src/components/TopBar.tsx
git commit -m "feat: add command registry and focused top command bar"
```

---

## Task 5: Replace Duplicate Search UI with Ctrl+K Command Palette

**Files:**
- Create: `src/commands/CommandPalette.tsx`
- Create: `src/commands/CommandPalette.test.tsx`
- Create: `src/commands/commandSearch.ts`
- Create: `src/commands/commandSearch.test.ts`
- Create: `src/shared/api/searchApi.ts`
- Modify: `src/components/SearchModal.tsx` to compatibility wrapper
- Modify: `src/components/RightPanel.tsx` to remove fixed search section after Context Hub task
- Modify: `src/app/AppShell.tsx`

**Step 1: Write Command search tests**

With commands, pages and tasks:

- query empty returns recent+commands
- Korean query matches title
- `title:` filter
- `tag:` filter
- command keyword match
- grouping order
- result limit

**Step 2: Implement in-memory adapter first**

Use existing page summaries to preserve behavior while DB FTS is not available. Keep API boundary so Task 13 can swap backend.

**Step 3: Write palette component tests**

- Ctrl+K open
- input focus
- Arrow navigation
- Enter run
- Escape close
- result groups
- no-result state

**Step 4: Implement with `cmdk`**

Do not add another palette library.

**Step 5: Connect command launcher and keyboard**

Top command bar opens palette. Existing `SearchModal` remains unused but not deleted until all references are removed.

**Step 6: Verify**

```bash
npm run test -- src/commands
npm run check
rg -n "setIsSearchOpen|SearchModal" src
```

Expected after migration: only compatibility references or none.

**Step 7: Commit**

```bash
git add src/commands src/shared/api/searchApi.ts src/components/SearchModal.tsx src/app/AppShell.tsx
git commit -m "feat: unify search and actions in command palette"
```

---

## Task 6: Split the Sidebar into Workspace Views

**Files:**
- Create: `src/workspace/WorkspaceSidebar.tsx`
- Create: `src/workspace/WorkspaceSidebar.test.tsx`
- Create: `src/workspace/views/TodaySidebarView.tsx`
- Create: `src/workspace/views/DailySidebarView.tsx`
- Create: `src/workspace/views/ProjectsSidebarView.tsx`
- Create: `src/workspace/views/TasksSidebarView.tsx`
- Create: `src/workspace/views/CalendarSidebarView.tsx`
- Create: `src/workspace/views/KnowledgeSidebarView.tsx`
- Create: `src/styles/sidebar.css`
- Modify: `src/components/Sidebar.tsx`

**Step 1: Extract reusable tree components**

From current Sidebar preserve:

- page row
- rename
- emoji
- context actions
- project hierarchy
- move logic
- cycle guard
- daily page list
- CalendarWidget

Do not copy the full file into each view.

**Step 2: Write view switch tests**

- default Today
- Alt+1..6
- current view active
- Daily shows Mini Calendar
- Project does not show Mini Calendar
- opening project page calls guarded navigation

**Step 3: Implement view switcher**

Six compact icon+label controls. Persistent text is at least 11px.

**Step 4: Implement Today view**

Use existing data:

- today's pages
- current daily tasks placeholder
- current events placeholder
- recent projects
- pending proposal placeholder

Backend data can be introduced later; empty sections must be valid.

**Step 5: Remove unreachable wide layout**

Delete or isolate `isWideLayout` path that requires 520px inside a normally 240px panel. Add a test that sidebar does not render two columns in the AppShell.

**Step 6: Verify**

```bash
npm run test -- src/workspace/WorkspaceSidebar.test.tsx
npm run check
```

**Step 7: Commit**

```bash
git add src/workspace/WorkspaceSidebar.tsx src/workspace/WorkspaceSidebar.test.tsx src/workspace/views src/styles/sidebar.css src/components/Sidebar.tsx
git commit -m "feat: organize sidebar around workspace views"
```

---

## Task 7: Build Workspace Canvas and Document Chrome

**Files:**
- Create: `src/workspace/WorkspaceCanvas.tsx`
- Create: `src/workspace/WorkspaceStatusBar.tsx`
- Create: `src/editor/DocumentWorkspace.tsx`
- Create: `src/editor/DocumentBar.tsx`
- Create: `src/editor/MetadataStrip.tsx`
- Create: `src/editor/SelectionAiToolbar.tsx`
- Create: `src/editor/DocumentWorkspace.test.tsx`
- Create: `src/styles/editor.css`
- Modify: `src/components/MarkdownEditor.tsx`

**Step 1: Write document workspace test**

Assert:

- breadcrumb
- title
- save state
- edit/source
- metadata chips
- Milkdown/source body
- status bar
- selection toolbar hidden without selection

**Step 2: Create compatibility adapter**

`MarkdownEditor` can wrap `DocumentWorkspace` until callers migrate. Preserve `MarkdownEditorHandle.flushUnsaved`.

**Step 3: Implement metadata strip**

Use current page data first:

- inferred type
- project
- date
- tags
- add-property placeholder

Do not block GA shell on DB V3.

**Step 4: Implement selection model**

```ts
interface EditorSelection {
  pageId: string;
  baseRevision: number;
  text: string;
  start: number;
  end: number;
  textHash: string;
}
```

The initial source-mode implementation may use offsets; Milkdown integration must expose stable selection. Do not apply replacements directly.

**Step 5: Implement WorkspaceCanvas switch**

Render placeholder but production-quality empty views for Tasks, Calendar, Knowledge and Search. Later tasks replace placeholders.

**Step 6: Verify**

```bash
npm run test -- src/editor src/workspace/WorkspaceCanvas*
npm run check
```

**Step 7: Commit**

```bash
git add src/editor src/workspace/WorkspaceCanvas.tsx src/workspace/WorkspaceStatusBar.tsx src/styles/editor.css src/components/MarkdownEditor.tsx
git commit -m "feat: add document workspace and contextual chrome"
```

---

## Task 8: Replace RightPanel with the Context Hub

**Files:**
- Create: `src/context/ContextHub.tsx`
- Create: `src/context/ContextHub.test.tsx`
- Create: `src/context/OutlinePanel.tsx`
- Create: `src/context/LinksPanel.tsx`
- Create: `src/context/DocumentTasksPanel.tsx`
- Create: `src/context/PropertiesPanel.tsx`
- Create: `src/context/SearchPinPanel.tsx`
- Create: `src/styles/context-hub.css`
- Modify: `src/components/RightPanel.tsx`
- Modify: `src/app/AppShell.tsx`

**Step 1: Write tab tests**

- default AI
- click Outline
- selected tab persists
- AI content consumes full available height
- Search tab absent unless pinned
- keyboard tab navigation

**Step 2: Implement Radix Tabs**

Use existing Radix dependency. Tab triggers have tooltip, aria label and optional badge.

**Step 3: Implement Outline**

Parse current Markdown headings in the frontend initially. Use stable heading IDs. Backend index can replace data source later.

**Step 4: Implement placeholder Links/Tasks/Properties APIs**

Use explicit loading/empty/error states. Do not silently show fake data.

**Step 5: Move AI component**

Place existing AI assistant in AI tab. Remove search section from the right panel.

**Step 6: Remove duplicate search after references are clear**

```bash
rg -n "RightPanel|SearchModal|performSearch" src
```

Delete old component only when no production references remain.

**Step 7: Verify**

```bash
npm run test -- src/context
npm run check
```

**Step 8: Commit**

```bash
git add src/context src/styles/context-hub.css src/components/RightPanel.tsx src/app/AppShell.tsx
git commit -m "feat: replace fixed right panel with context hub"
```

---

## Task 9: Split AI UI and Add Cancellation

**Files:**
- Create: `src/features/ai/aiTypes.ts`
- Create: `src/features/ai/useAiRuntimeStatus.ts`
- Create: `src/features/ai/useAiConversation.ts`
- Create: `src/features/ai/useAiStream.ts`
- Create: `src/features/ai/AiAssistantPanel.tsx`
- Create: `src/features/ai/AiComposer.tsx`
- Create: `src/features/ai/AiConversation.tsx`
- Create: `src/features/ai/AiAssistantPanel.test.tsx`
- Create: `src/shared/api/aiApi.ts`
- Modify: `src/components/AIChatAssistant.tsx`
- Modify: `src-tauri/src/lib.rs`
- Modify: `src-tauri/src/local_ai/mod.rs`

**Step 1: Write frontend cancellation tests**

- starting generation sets state
- cancel button calls cancel API
- late chunks are ignored
- listeners are removed
- PR #1 rAF batching remains

**Step 2: Add Rust active request registry**

Use `HashMap<RequestId, CancellationToken>` protected by a mutex or concurrent map. Do not hold the model mutex while emitting UI events longer than necessary.

Add Tauri command:

```rust
#[tauri::command]
async fn local_ai_cancel(request_id: String, state: State<'_, AppState>) -> Result<(), String>
```

**Step 3: Add cancellation checkpoints**

- before retrieval
- before runtime request
- per token/callback
- before final event

For loopback HTTP, drop the response body and mark request canceled. For child runtime limitations, document recovery policy.

**Step 4: Split React AI component**

Preserve model auto-load and PR #1 runtime selector. Composer is sticky. Quick actions use command/action definitions.

**Step 5: Remove keyup double-send path**

Verify only one Enter handler exists.

**Step 6: Verify**

```bash
npm run test -- src/features/ai
npm run check
cd src-tauri
cargo test local_ai
cd ..
```

**Step 7: Commit**

```bash
git add src/features/ai src/shared/api/aiApi.ts src/components/AIChatAssistant.tsx src-tauri/src/lib.rs src-tauri/src/local_ai
git commit -m "feat: modularize local AI chat and support cancellation"
```

---

## Task 10: Add Frontend Proposal and Diff Flow

**Files:**
- Create: `src/features/ai/AiProposalCard.tsx`
- Create: `src/features/ai/AiDiffDialog.tsx`
- Create: `src/features/ai/aiProposalReducer.ts`
- Create: `src/features/ai/aiProposalReducer.test.ts`
- Create: `src/features/ai/AiProposalCard.test.tsx`
- Modify: `src/features/ai/AiAssistantPanel.tsx`
- Modify: `src/editor/SelectionAiToolbar.tsx`
- Remove direct production use: `handleReplaceText` path in `src/App.tsx`

**Step 1: Write proposal reducer tests**

Cover:

- pending
- diff opened
- applied
- rejected
- conflict
- stale stream ignored
- partial selection

**Step 2: Define proposal type**

```ts
interface AiProposal {
  id: string;
  pageId: string;
  baseRevision: number;
  type: 'insert' | 'replace' | 'tasks' | 'decisions' | 'properties';
  title: string;
  summary: string;
  patch: TextPatch | StructuredPatch;
  sources: AiSource[];
  status: 'pending' | 'applied' | 'rejected' | 'conflicted';
}
```

**Step 3: Implement diff dialog**

For text patch show:

- unchanged context
- removed text
- added text
- target anchor
- base revision

Do not use HTML from the AI without escaping.

**Step 4: Replace direct selection mutation**

Selection action creates a proposal. `App.tsx` no longer uses `content.indexOf(targetText)` to apply AI output.

**Step 5: Connect mock/local proposal API boundary**

Backend persistence arrives in Task 17; create typed API that can initially keep proposals in memory for UI tests.

**Step 6: Verify**

```bash
npm run test -- src/features/ai
npm run check
rg -n "indexOf\\(targetText\\)|handleReplaceText" src
```

Expected: no AI direct replacement production path.

**Step 7: Commit**

```bash
git add src/features/ai src/editor/SelectionAiToolbar.tsx src/App.tsx
git commit -m "feat: require reviewable AI proposals for document changes"
```

---

## Task 11: Introduce SQLite Migration Framework and Connection Pragmas

**Files:**
- Create: `src-tauri/src/db/mod.rs`
- Create: `src-tauri/src/db/connection.rs`
- Create: `src-tauri/src/db/migrations/mod.rs`
- Create: `src-tauri/src/db/migrations/v001_baseline.rs`
- Create: `src-tauri/src/db/migrations/v002_nodes_revisions.rs`
- Create: `src-tauri/src/db/migrations/tests.rs`
- Modify: `src-tauri/src/database.rs`
- Modify: `src-tauri/src/lib.rs`
- Create: `src-tauri/tests/fixtures/` synthetic DB generators

**Step 1: Write failing migration tests**

Test:

- empty DB to current schema
- legacy pages/settings DB
- migration recorded once
- checksum mismatch fails
- quick_check failure
- pre-migration backup callback called

Run:

```bash
cd src-tauri
cargo test migrations
```

Expected: FAIL.

**Step 2: Implement connection configuration**

On every connection:

```sql
PRAGMA foreign_keys = ON;
PRAGMA busy_timeout = 5000;
PRAGMA journal_mode = WAL;
PRAGMA synchronous = NORMAL;
```

Backup/migration can temporarily use stronger sync if justified.

**Step 3: Implement immutable migrations**

Migration interface:

```rust
struct Migration {
    version: i64,
    name: &'static str,
    checksum: &'static str,
    apply: fn(&Connection) -> Result<()>,
}
```

Do not edit an applied migration. Add a new version.

**Step 4: Integrate backup**

Before schema-changing migration, use `VACUUM INTO` or SQLite backup API and calculate SHA256.

**Step 5: Keep legacy Database facade**

Existing commands continue to work while repositories migrate.

**Step 6: Verify**

```bash
cd src-tauri
cargo fmt --check
cargo clippy --all-targets --all-features -- -D warnings
cargo test migrations
cargo test
cd ..
```

**Step 7: Commit**

```bash
git add src-tauri/src/db src-tauri/src/database.rs src-tauri/src/lib.rs src-tauri/tests
git commit -m "feat: add versioned SQLite migration framework"
```

---

## Task 12: Add Node, Page Revision and Summary/Body APIs

**Files:**
- Create: `src-tauri/src/domain/node.rs`
- Create: `src-tauri/src/domain/page.rs`
- Create: `src-tauri/src/db/repositories/node_repository.rs`
- Create: `src-tauri/src/db/repositories/page_repository.rs`
- Create: `src-tauri/src/db/repositories/revision_repository.rs`
- Create: `src-tauri/src/commands/pages.rs`
- Create: `src-tauri/src/services/page_service.rs`
- Create: `src/shared/api/pageApi.ts`
- Modify: `src/utils/tauriStorage.ts`
- Modify: `src/app/useWorkspaceController.ts`

**Step 1: Write repository tests**

- create node/page
- list summaries without body
- get body
- save with base version
- revision insert
- conflict
- soft delete/restore
- revision restore

**Step 2: Implement schema**

Create `nodes`, `pages`, `page_revisions`, `jobs`, `workspaces`.

**Step 3: Implement UPSERT**

Do not use `INSERT OR REPLACE`.

**Step 4: Implement commands**

```text
list_page_summaries
get_page_body
save_page_v2
trash_page
restore_page
list_page_revisions
restore_page_revision
```

**Step 5: Adapt frontend**

Load summaries at startup. Load body when selecting page. Cache only recently opened bodies.

Preserve existing API fallback during migration.

**Step 6: Verify**

```bash
cd src-tauri
cargo test page_repository
cargo test page_service
cd ..
npm run check
```

Use a test that proves `list_page_summaries` response does not contain `bodyMarkdown`.

**Step 7: Commit**

```bash
git add src-tauri/src/domain src-tauri/src/db/repositories src-tauri/src/commands/pages.rs src-tauri/src/services/page_service.rs src/shared/api/pageApi.ts src/utils/tauriStorage.ts src/app/useWorkspaceController.ts
git commit -m "feat: add revisioned page storage and lazy body loading"
```

---

## Task 13: Add Tags, Links, Anchors and SQLite FTS

**Files:**
- Create: `src-tauri/src/db/migrations/v003_tags_links_fts.rs`
- Create: `src-tauri/src/indexing/mod.rs`
- Create: `src-tauri/src/indexing/markdown.rs`
- Create: `src-tauri/src/indexing/tags.rs`
- Create: `src-tauri/src/indexing/links.rs`
- Create: `src-tauri/src/indexing/anchors.rs`
- Create: `src-tauri/src/indexing/fts.rs`
- Create: `src-tauri/src/indexing/worker.rs`
- Create: `src-tauri/src/search/mod.rs`
- Create: `src-tauri/src/commands/search.rs`
- Modify: `src/shared/api/searchApi.ts`
- Modify: `src/context/OutlinePanel.tsx`
- Modify: `src/context/LinksPanel.tsx`

**Step 1: Write parser tests**

Fixtures:

- Korean tags
- code block fake tags
- wiki links
- repeated headings
- unresolved links
- task markers
- tables
- escaped characters

**Step 2: Implement AST-based parser**

Do not rely on one global regex for Markdown semantics. A compatible Markdown parser may be added in Rust after license and size review.

**Step 3: Implement derived replacement transaction**

For one page:

1. parse
2. delete/replace page-derived tags, links, anchors, chunks
3. update FTS
4. mark job complete

**Step 4: Implement search API**

Input:

```rust
struct SearchRequest {
    query: String,
    filters: SearchFilters,
    limit: usize,
}
```

Output includes field, snippet, score and anchor.

**Step 5: Add Korean short-query fallback**

Limit LIKE search to title/tags for 1–2 characters. Avoid scanning all bodies synchronously.

**Step 6: Connect frontend Command Palette**

Replace in-memory page search with backend, retaining command results locally.

**Step 7: Verify**

```bash
cd src-tauri
cargo test indexing
cargo test search
cd ..
npm run test -- src/commands
npm run check
```

Create a synthetic 10,000-page benchmark and record warm p95.

**Step 8: Commit**

```bash
git add src-tauri/src/db/migrations/v003_tags_links_fts.rs src-tauri/src/indexing src-tauri/src/search src-tauri/src/commands/search.rs src/shared/api/searchApi.ts src/context
git commit -m "feat: add local knowledge indexes and FTS search"
```

---

## Task 14: Add Markdown-backed Tasks and Task Workspace

**Files:**
- Create: `src-tauri/src/db/migrations/v004_tasks_events.rs`
- Create: `src-tauri/src/domain/task.rs`
- Create: `src-tauri/src/tasks/parser.rs`
- Create: `src-tauri/src/tasks/service.rs`
- Create: `src-tauri/src/commands/tasks.rs`
- Create: `src/features/tasks/TasksWorkspace.tsx`
- Create: `src/features/tasks/TaskList.tsx`
- Create: `src/features/tasks/taskFilters.ts`
- Create: `src/features/tasks/taskTypes.ts`
- Create: `src/features/tasks/TasksWorkspace.test.tsx`
- Create: `src/shared/api/taskApi.ts`
- Modify: `src/workspace/views/TasksSidebarView.tsx`
- Modify: `src/context/DocumentTasksPanel.tsx`

**Step 1: Write task parser tests**

- unchecked
- checked
- due
- priority
- duplicate text
- stable marker
- marker insertion
- code block exclusion

**Step 2: Implement stable marker**

When a checkbox lacks a marker, indexer creates a patch proposal or safe internal save that inserts:

```markdown
<!-- memoji-task:<ulid> -->
```

Do not alter code blocks or quoted examples.

**Step 3: Implement task service**

List filters:

- inbox
- today
- upcoming
- overdue
- completed
- project
- page

**Step 4: Implement update task**

Updating status/due/priority patches the source Markdown using anchor and expected hash, then saves through PageService to create a revision.

**Step 5: Implement UI**

Center workspace has filter/sort/group. Right document task panel shows current-page tasks.

**Step 6: Verify**

```bash
cd src-tauri
cargo test tasks
cd ..
npm run test -- src/features/tasks
npm run check
```

**Step 7: Commit**

```bash
git add src-tauri/src/db/migrations/v004_tasks_events.rs src-tauri/src/domain/task.rs src-tauri/src/tasks src-tauri/src/commands/tasks.rs src/features/tasks src/shared/api/taskApi.ts src/workspace/views/TasksSidebarView.tsx src/context/DocumentTasksPanel.tsx
git commit -m "feat: add Markdown-backed task management"
```

---

## Task 15: Add Calendar Workspace and Events

**Files:**
- Create: `src-tauri/src/domain/event.rs`
- Create: `src-tauri/src/calendar/service.rs`
- Create: `src-tauri/src/calendar/ics.rs`
- Create: `src-tauri/src/commands/calendar.rs`
- Create: `src/features/calendar/CalendarWorkspace.tsx`
- Create: `src/features/calendar/MonthView.tsx`
- Create: `src/features/calendar/WeekView.tsx`
- Create: `src/features/calendar/DayView.tsx`
- Create: `src/features/calendar/eventTypes.ts`
- Create: `src/features/calendar/CalendarWorkspace.test.tsx`
- Create: `src/shared/api/calendarApi.ts`
- Modify: `src/workspace/views/CalendarSidebarView.tsx`

**Step 1: Write event service tests**

- event CRUD
- all-day
- timezone
- task due projection
- range query
- linked page
- ICS round trip

**Step 2: Implement range query**

Return events and task due items in one DTO without duplicating task rows into events.

**Step 3: Implement UI views**

Start with accessible CSS Grid/List; do not introduce a heavy calendar dependency before requirements prove necessary.

**Step 4: Connect date navigation**

Selecting a date updates workspace state but does not force a page selection. Opening a linked page flushes editor then switches to Editor.

**Step 5: Verify**

```bash
cd src-tauri
cargo test calendar
cd ..
npm run test -- src/features/calendar
npm run check
```

**Step 6: Commit**

```bash
git add src-tauri/src/domain/event.rs src-tauri/src/calendar src-tauri/src/commands/calendar.rs src/features/calendar src/shared/api/calendarApi.ts src/workspace/views/CalendarSidebarView.tsx
git commit -m "feat: add offline task and event calendar"
```

---

## Task 16: Refactor Local AI into Capability-Based Runtime Adapters

**Files:**
- Create: `src-tauri/src/ai/mod.rs`
- Create: `src-tauri/src/ai/runtime/mod.rs`
- Create: `src-tauri/src/ai/runtime/traits.rs`
- Create: `src-tauri/src/ai/runtime/capabilities.rs`
- Create: `src-tauri/src/ai/runtime/candle.rs`
- Create: `src-tauri/src/ai/runtime/openai_compatible.rs`
- Create: `src-tauri/src/ai/runtime/litert.rs`
- Create: `src-tauri/src/ai/runtime/process_manager.rs`
- Create: `src-tauri/src/ai/metrics.rs`
- Modify: `src-tauri/src/local_ai/*`
- Modify: `src/types/localAi.ts`
- Modify: `src/features/ai/useAiRuntimeStatus.ts`

**Step 1: Write capability tests**

- Candle reports local in-process, no MTP
- plain loopback reports streaming, no MTP
- verified target+assistant reports MTP
- missing assistant cannot report MTP
- external endpoint rejected

**Step 2: Define trait**

Use the trait from `docs/memoji-ga/08_SYSTEM_ARCHITECTURE.md`.

**Step 3: Wrap existing runtimes**

Do not rewrite Candle math in this task. Adapt existing `Gemma4Runtime`.

Rename semantic use of `mtp_client` to OpenAI-compatible loopback client. Keep compatibility aliases only if needed for migration.

**Step 4: Add managed runtime auth**

Generate a random per-session token and provide it to the managed process if the server supports auth. If the current LiteRT server cannot enforce it, bind loopback, use a random port, verify process identity and document residual risk.

**Step 5: Add metrics**

- runtime version
- load
- TTFT
- prefill
- decode
- peak RSS where available
- MTP fields only when capability exists

**Step 6: Update UI copy**

Use:

- `내장 로컬`
- `고속 로컬 서버`
- `MTP 활성` only when verified

**Step 7: Verify**

```bash
cd src-tauri
cargo test ai::runtime
cargo test local_ai
cd ..
npm run test -- src/features/ai
npm run check
```

**Step 8: Commit**

```bash
git add src-tauri/src/ai src-tauri/src/local_ai src/types/localAi.ts src/features/ai
git commit -m "refactor: model local AI runtimes by verified capabilities"
```

---

## Task 17: Persist AI Runs, Sources and Proposals

**Files:**
- Create: `src-tauri/src/db/migrations/v005_ai_runs_proposals.rs`
- Create: `src-tauri/src/ai/retrieval.rs`
- Create: `src-tauri/src/ai/prompts.rs`
- Create: `src-tauri/src/ai/proposals.rs`
- Create: `src-tauri/src/ai/service.rs`
- Create: `src-tauri/src/commands/ai.rs`
- Modify: `src/shared/api/aiApi.ts`
- Modify: `src/features/ai/AiProposalCard.tsx`
- Modify: `src/features/ai/AiDiffDialog.tsx`

**Step 1: Write service tests**

- run records prompt hash, not prompt body
- source ranks recorded
- proposal pending
- apply success
- revision conflict
- reject
- insertion
- text replacement anchor/hash validation

**Step 2: Implement retrieval**

GA scoring:

- FTS
- same project
- explicit links
- recency
- object type

Return top chunks with heading paths.

**Step 3: Implement prompt builder**

Preserve system/schema/current page/source/user/generation sections. Add tests that context trimming never removes system or generation prefix.

**Step 4: Implement proposal persistence**

Commands:

```text
create_ai_proposal
get_ai_proposal
apply_ai_proposal
reject_ai_proposal
```

Apply uses PageService transaction.

**Step 5: Connect citations**

Frontend source click opens page and anchor via guarded navigation.

**Step 6: Verify**

```bash
cd src-tauri
cargo test ai::retrieval
cargo test ai::proposals
cargo test ai::service
cd ..
npm run test -- src/features/ai
npm run check
```

**Step 7: Commit**

```bash
git add src-tauri/src/db/migrations/v005_ai_runs_proposals.rs src-tauri/src/ai src-tauri/src/commands/ai.rs src/shared/api/aiApi.ts src/features/ai
git commit -m "feat: persist cited AI runs and revision-safe proposals"
```

---

## Task 18: Evaluate LiteRT-LM 0.16.0 without Breaking the GA Runtime

**Files:**
- Modify: `scripts/prepare-vdi-ai-bundle.mjs`
- Create: `scripts/verify-litert-runtime.mjs`
- Create: `scripts/benchmark-local-ai.mjs`
- Create: `src-tauri/resources/local_ai/runtime-compatibility.json`
- Create: `docs/implementation/litert-lm-0.16-compatibility.md`
- Modify: `NOTICE.md`
- Modify: Runtime manifest files

**Step 1: Work on a compatibility branch**

```bash
git switch -c codex/litert-lm-0.16-compat
```

**Step 2: Pin and verify release assets**

Do not download “latest”. Pin exact tag, asset, size and SHA256.

**Step 3: Snapshot CLI/API**

Capture:

```bash
<runtime> --version
<runtime> --help
<runtime> serve --help
```

Compare required options with 0.13.1.

**Step 4: Run compatibility tests**

- start/stop
- models
- chat stream
- Korean UTF-8
- 2K/4K context
- cancellation
- restart
- missing model
- port collision
- three load cycles

**Step 5: Benchmark**

Use the matrix in `09_AI_UX_AND_RUNTIME.md`; at minimum E2B 256/1024 prompts and 64/256 outputs, cold and warm.

**Step 6: Decide**

- If all required Windows tests pass: update default manifest.
- If not: retain 0.13.1 and document 0.16.0 as non-default candidate.
- Never report VDI validation from a non-VDI Linux/macOS run.

**Step 7: Merge or abandon compatibility branch**

Only merge verified changes.

**Step 8: Commit**

```bash
git add scripts src-tauri/resources/local_ai docs/implementation/litert-lm-0.16-compatibility.md NOTICE.md
git commit -m "build: evaluate LiteRT-LM 0.16 runtime compatibility"
```

---

## Task 19: Accessibility, Performance and Large Workspace Hardening

**Files:**
- Modify: `src/styles/*.css`
- Create: `src/test/accessibility.test.tsx`
- Create: `scripts/generate-large-workspace-fixture.mjs`
- Create: `scripts/measure-search.mjs`
- Create: `docs/implementation/performance-report.md`
- Modify: large components discovered by bundle analysis

**Step 1: Add a11y tests**

Test:

- aria labels
- focus order
- dialog focus
- Escape
- tab roles
- control names
- no persistent 8–10px classes in new shell

**Step 2: Generate 10,000-page fixture**

Synthetic Korean titles, tags, links, tasks and varying body sizes. Never use production data.

**Step 3: Measure**

- startup
- page list
- body open
- search p50/p95
- panel interaction
- bundle size
- memory if available

**Step 4: Lazy-load heavy views**

At minimum:

- Milkdown/editor bundle
- Calendar
- Knowledge
- Settings
- Diff viewer

Do not lazy-load tiny shared controls.

**Step 5: Validate 125% and viewports**

Save screenshots and defects.

**Step 6: Verify**

```bash
npm run check
npm run build
node scripts/measure-search.mjs
```

Record actual results, not targets only.

**Step 7: Commit**

```bash
git add src/styles src/test scripts docs/implementation/performance-report.md
git commit -m "perf: harden Memoji workspace for VDI scale and accessibility"
```

---

## Task 20: Replace Byte-Array Import and Harden Export/Release

**Files:**
- Modify: `src/utils/tauriStorage.ts`
- Modify: `src/components/SettingsModal.tsx`
- Modify: `src-tauri/src/lib.rs` or `src-tauri/src/commands/data.rs`
- Modify: `src-tauri/src/database.rs`
- Modify: `.github/workflows/release.yml`
- Modify: `.github/workflows/windows-dist.yml`
- Create: `.github/workflows/ci.yml`
- Create: `scripts/generate-checksums.mjs`
- Create: `scripts/generate-sbom.ps1`
- Create: `docs/implementation/rollback-runbook.md`

**Step 1: Write import tests**

- non-SQLite rejected
- corrupt DB rejected
- large file path import
- backup created
- duplicate merge
- failure keeps original
- staged file cleaned

**Step 2: Use Tauri dialog path**

Frontend sends selected path, not `Array.from(new Uint8Array(buffer))`.

Rust validates canonical path and opens read-only.

**Step 3: Upgrade export manifest**

Include:

- app version
- schema version
- DB hash
- counts
- page/revision metadata
- attachment manifest

**Step 4: Create CI**

Every PR:

```text
npm ci
npm run check
cargo fmt
cargo clippy
cargo test
migration fixtures
```

**Step 5: Dynamic versions**

Read version from package/Tauri. Remove `Memoji_2.0.0` hardcoded paths.

**Step 6: Checksums, NOTICE, SBOM and signing hooks**

Do not commit secrets. Workflow uses secrets only in release environment.

**Step 7: Verify**

```bash
npm run check
cd src-tauri && cargo test && cd ..
node scripts/generate-checksums.mjs --help
```

Validate workflow YAML.

**Step 8: Commit**

```bash
git add src src-tauri .github scripts docs/implementation/rollback-runbook.md
git commit -m "build: harden data portability and GA release gates"
```

---

## Task 21: Final Verification and Implementation Report

**Files:**
- Create: `MEMOJI_2_GA_IMPLEMENTATION_REPORT.md`
- Create: `artifacts/ui/`
- Create: `artifacts/benchmark/`
- Create: `artifacts/migration/`
- Modify: `README.md`
- Modify: `RELEASE.md`
- Modify: `src/PRD.md`
- Modify: `MEMOJI_2_0_HANDOFF.md`

**Step 1: Run all automated checks**

```bash
npm ci
npm run check

cd src-tauri
cargo fmt --check
cargo clippy --all-targets --all-features -- -D warnings
cargo test
cd ..
```

**Step 2: Run migration fixtures**

Record:

- before/after counts
- hashes
- duration
- backup path
- schema version

**Step 3: Capture UI**

- 1440×900
- 1200×800
- 1024×768
- 800×600
- light
- dark
- AI proposal
- command palette
- tasks
- calendar
- settings

**Step 4: Run local benchmark**

Record runtime and environment. If model files are unavailable, report exactly that and do not fabricate performance.

**Step 5: Review requirement IDs**

Mark each P0/P1:

- complete
- partial
- blocked
- deferred

P0 cannot be silently deferred.

**Step 6: Update product docs**

Remove claims that are not implemented. Distinguish Core app size/memory from AI bundle size/memory.

**Step 7: Write implementation report**

Required sections:

1. baseline
2. commits
3. requirement status
4. architecture changes
5. schema migrations
6. test output
7. UI evidence
8. benchmark
9. VDI verification
10. security
11. rollback
12. remaining work

**Step 8: Final diff review**

```bash
git status --short
git log --oneline --decorate --max-count=30
git diff memoji-pr1-baseline...HEAD --stat
```

**Step 9: Commit**

```bash
git add MEMOJI_2_GA_IMPLEMENTATION_REPORT.md artifacts README.md RELEASE.md src/PRD.md MEMOJI_2_0_HANDOFF.md
git commit -m "docs: finalize Memoji 2.0 GA implementation evidence"
```

---

## Final Exit Criteria

- All P0 requirements complete or explicitly blocked by unavailable external hardware/certificates.
- `npm run check` passes.
- Rust format, clippy and tests pass.
- Existing V2 database migration is tested with backup and content hashes.
- AI direct replacement path is removed.
- Right panel search/AI stack is replaced by Context Hub.
- Ctrl+K palette is the primary search entry.
- 800×600 remains usable.
- Runtime UI does not falsely label a plain server as MTP.
- Implementation report contains evidence and honest limitations.
