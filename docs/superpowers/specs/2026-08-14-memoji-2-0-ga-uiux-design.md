# Memoji 2.0 GA UI/UX and Architecture Design

Date: 2026-08-14  
Status: Approved design basis  
Repository: `doublejun80/Memoji`  
Implementation baseline: PR #1 `codex/review-settings-vdi-performance`

## 1. Problem

Memoji already has a useful desktop structure:

- left Daily/Project navigation
- center Markdown editor
- right search and local AI
- top action and window bar

The structure is familiar, but the fixed right search/AI split cannot accept Outline, Backlinks, Tasks, Properties and safe AI proposals. Fixed 256px side panels also leave an unusable center at the configured 800px minimum window.

The product needs to grow into an offline VDI workspace without turning the editor into a dashboard or replacing Markdown with an opaque block database.

## 2. Product Direction

Memoji 2.0 GA is:

> A local-first Markdown workspace for notes, tasks, calendar and linked work knowledge, with a local Gemma assistant that cites sources and proposes changes for approval.

It is not:

- a cloud collaboration product
- a Notion clone
- a plugin marketplace
- a cloud AI client
- an autonomous agent that silently edits work documents

## 3. Non-negotiable Constraints

1. Markdown remains canonical.
2. Default operation is offline.
3. AI network access is loopback-only.
4. Existing database content is preserved.
5. PR #1 save/flush/VDI improvements remain.
6. AI replacements require proposal, diff and revision validation.
7. 800×600 remains supported.
8. The current three-pane mental model remains recognizable.

## 4. Target Screen

### Top Command Bar

Persistent:

- left panel toggle
- workspace identity
- Ctrl+K launcher
- save status
- local AI status
- context hub toggle
- window controls

Overflow:

- focus
- theme
- export
- shortcuts
- settings
- diagnostics

### Left Workspace Sidebar

View switcher:

- Today
- Daily
- Projects
- Tasks
- Calendar
- Knowledge

The content below the switcher changes by view. The existing Daily list, Project tree and Mini Calendar are reused in the corresponding views.

### Workspace Canvas

Views:

- Editor
- Tasks
- Calendar
- Knowledge
- Search

The document workspace contains:

- Document Bar
- Metadata Strip
- Milkdown
- Selection AI Toolbar
- Status Bar

### Context Hub

Tabs:

- AI
- Outline
- Links
- Tasks
- Properties
- optional pinned Search

Search no longer permanently shares vertical space with AI.

## 5. Dimensions

- Top Bar: 48px
- Left default: 240px, min 220, max 360
- Right default: 304px, min 288, max 440
- Center min: 560px
- Status: 22px
- Editor read width: 760px

Responsive:

- `<1100`: right overlay
- `<900`: left and right overlay
- focus: editor first

## 6. Interaction Model

### Search and Command

Ctrl+K searches:

- commands
- pages
- tasks
- projects
- recent items

It can open pages, switch views, create content and start AI actions.

### Editor Selection

A selected range opens a compact toolbar:

- rewrite
- summarize
- task
- translate
- ask AI

The result is a proposal when it changes existing text.

### AI

The AI panel shows:

- selected runtime profile
- context source chips
- quick actions
- streamed response
- source citations
- proposal cards
- sticky composer

### Proposal

A proposal records:

- page ID
- base revision
- target anchor
- before/after
- sources
- status

Apply checks current revision. A mismatch creates a conflict, not a silent merge.

## 7. State Model

```ts
type LeftView = 'today' | 'daily' | 'projects' | 'tasks' | 'calendar' | 'knowledge';
type WorkspaceView = 'editor' | 'tasks' | 'calendar' | 'knowledge' | 'search';
type ContextHubTab = 'ai' | 'outline' | 'links' | 'tasks' | 'properties' | 'search';
```

State is separated into:

- domain state from Tauri/SQLite
- persisted UI state
- transient overlay/selection/request state

`App.tsx` only composes providers and `AppShell`.

## 8. Data Model

Core:

- Workspace
- Node
- Page
- Page Revision
- Block Anchor
- Tag/Node Tag
- Node Relation
- Task
- Event
- Document Chunk
- AI Run/Source/Proposal
- Job
- Settings
- Backup/Audit

Derived:

- tags
- links
- task index
- FTS
- chunks
- embeddings

Derived data can be rebuilt from Markdown and metadata.

## 9. Save Model

Every accepted page write:

1. validates base version
2. updates node/page
3. inserts revision
4. enqueues reindex
5. commits

Navigation, settings, export and close flush the editor first.

## 10. Search Model

GA search uses SQLite FTS5 and structured filters. One- and two-character Korean queries use a limited prefix/LIKE fallback.

The frontend loads page summaries separately from page bodies.

## 11. Task Model

Markdown checkbox is canonical. A stable hidden marker identifies the task.

Task view edits patch the Markdown and create a page revision.

## 12. Calendar Model

Events and due tasks are displayed together. Calendar does not duplicate notes. Page links connect events to meeting/project notes.

## 13. Local AI Runtime

The runtime is adapter-based.

- LiteRT-LM candidate default
- Candle fallback
- OpenAI-compatible loopback adapter

An OpenAI-compatible local server is not labeled MTP unless the runtime reports target, assistant and verified draft metrics.

As of the design date, official LiteRT-LM latest is 0.16.0. PR #1 bundles 0.13.1. Upgrade is a compatibility track with rollback, not a version-string edit.

## 14. Accessibility

- persistent text at least 11px
- controls at least 28px
- visible focus
- keyboard-complete
- tooltip and aria label for icons
- AA contrast
- 125% scale and 800×600 checks

## 15. Scope

GA:

- baseline reliability
- app shell
- command palette
- context hub
- document header
- safe AI proposals
- DB revisions
- FTS/tags/links
- tasks
- calendar
- runtime capabilities and diagnostics
- release hardening

2.1:

- object types
- properties
- saved views
- table/board/timeline
- RAG citations expansion
- meeting knowledge templates

2.2:

- attachments
- PDF/OCR/transcript
- embeddings

## 16. Success Criteria

1. Existing users recognize the editor.
2. AI has full-height space.
3. Search is faster and globally accessible.
4. No accepted save is lost.
5. AI cannot silently overwrite a changed page.
6. Task and calendar views are backed by the same Markdown data.
7. VDI limitations are measured and reported rather than hidden.
