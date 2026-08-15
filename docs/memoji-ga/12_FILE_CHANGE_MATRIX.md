# 12. 파일 변경 Matrix

## 1. 기준 파일

| 파일 | 현재 | 목표 | 처리 |
|---|---|---|---|
| `src/App.tsx` | 전역 상태와 Domain Logic 집중 | Provider 조립 | 대폭 축소 |
| `src/components/TopBar.tsx` | 모든 Action 한 줄 | Command 중심 TopBar | 교체 후 Compatibility 제거 |
| `src/components/Sidebar.tsx` | Daily/Project 대형 컴포넌트 | Tree Core+View별 Sidebar | 점진 분리 |
| `src/components/RightPanel.tsx` | Search+AI Stack | ContextHub | 대체 |
| `src/components/SearchModal.tsx` | Page Search Modal | CommandPalette | 대체 |
| `src/components/MarkdownEditor.tsx` | Editor Wrapper | DocumentWorkspace | 확장 |
| `src/components/AIChatAssistant.tsx` | Runtime+Chat+Apply | AI Feature 모듈 | 분리 |
| `src/components/SettingsModal.tsx` | PR #1 2-pane | 유지+Layout 설정 | 최소 변경 |
| `src/index.css` | Generated+Product CSS 혼합 | Style Module | 점진 이전 |

## 2. 새 프런트 파일

### App

- `src/app/AppProviders.tsx`
- `src/app/AppShell.tsx`
- `src/app/workspaceState.ts`
- `src/app/workspaceReducer.ts`
- `src/app/useWorkspaceController.ts`
- `src/app/panelLayout.ts`
- `src/app/keyboardBindings.ts`

### Command

- `src/commands/CommandPalette.tsx`
- `src/commands/commandRegistry.ts`
- `src/commands/commandSearch.ts`
- `src/commands/types.ts`

### Workspace

- `src/workspace/TopCommandBar.tsx`
- `src/workspace/WorkspaceLayout.tsx`
- `src/workspace/WorkspaceSidebar.tsx`
- `src/workspace/WorkspaceCanvas.tsx`
- `src/workspace/WorkspaceStatusBar.tsx`
- `src/workspace/views/TodaySidebarView.tsx`
- `src/workspace/views/DailySidebarView.tsx`
- `src/workspace/views/ProjectsSidebarView.tsx`
- `src/workspace/views/TasksSidebarView.tsx`
- `src/workspace/views/CalendarSidebarView.tsx`
- `src/workspace/views/KnowledgeSidebarView.tsx`

### Context

- `src/context/ContextHub.tsx`
- `src/context/OutlinePanel.tsx`
- `src/context/LinksPanel.tsx`
- `src/context/DocumentTasksPanel.tsx`
- `src/context/PropertiesPanel.tsx`
- `src/context/SearchPinPanel.tsx`

### Editor

- `src/editor/DocumentWorkspace.tsx`
- `src/editor/DocumentBar.tsx`
- `src/editor/MetadataStrip.tsx`
- `src/editor/SelectionAiToolbar.tsx`

### Feature

- `src/features/tasks/*`
- `src/features/calendar/*`
- `src/features/knowledge/*`
- `src/features/ai/*`

### API

- `src/shared/api/tauriCommands.ts`
- `src/shared/api/pageApi.ts`
- `src/shared/api/searchApi.ts`
- `src/shared/api/taskApi.ts`
- `src/shared/api/calendarApi.ts`
- `src/shared/api/aiApi.ts`

### Style

- `src/styles/tokens.css`
- `src/styles/shell.css`
- `src/styles/sidebar.css`
- `src/styles/editor.css`
- `src/styles/context-hub.css`
- `src/styles/command-palette.css`

## 3. Rust 변경

### 현재

- `src-tauri/src/database.rs`
- `src-tauri/src/lib.rs`
- `src-tauri/src/local_ai/*`

### 목표

```text
src-tauri/src/
├── app_state.rs
├── commands/
│   ├── pages.rs
│   ├── search.rs
│   ├── tasks.rs
│   ├── calendar.rs
│   ├── ai.rs
│   └── data.rs
├── db/
│   ├── connection.rs
│   ├── migrations/
│   │   ├── mod.rs
│   │   ├── v001_baseline.rs
│   │   ├── v002_nodes_revisions.rs
│   │   ├── v003_tags_links_fts.rs
│   │   └── v004_tasks_events.rs
│   ├── repositories/
│   └── transactions.rs
├── domain/
├── indexing/
├── search/
├── tasks/
├── calendar/
├── ai/
│   ├── runtime/
│   ├── retrieval/
│   ├── prompts/
│   ├── proposals/
│   └── metrics/
├── import_export/
└── security/
```

`lib.rs`는 Setup과 Command Registration 중심으로 줄인다.

## 4. 단계별 변경

### Phase 1

변경:

- `App.tsx`
- `TopBar.tsx` 또는 신규 TopCommandBar
- `Sidebar.tsx`
- `RightPanel.tsx`
- Style

생성:

- App/Workspace/Context 기본

삭제 금지:

- Legacy Component는 새 Shell이 안정될 때까지 유지

### Phase 2

생성:

- Command Palette
- Command Registry
- Context Tab

Legacy 제거:

- `SearchModal.tsx`
- `RightPanel.tsx` Search UI

### Phase 3

분리:

- AI Hook
- AI Conversation
- Proposal
- Diff

즉시 제거:

- `handleReplaceText` 직접 적용 Path

### Phase 4

Rust DB V3와 API를 만든 뒤 Frontend가 새 API로 전환된다. Legacy `get_pages`는 한 단계 동안 유지할 수 있다.

### Phase 5

Task/Calendar View 추가.

### Phase 6

Runtime Adapter와 v0.16 Compatibility.

## 5. 삭제 후보

삭제 전 `rg`로 사용 여부를 확인한다.

- `src/package.json`
- `src/index.html`
- `src/public/`
- 중복 Style/Legacy BlockNote Component
- 사용되지 않는 `Block.tsx`
- 사용되지 않는 `Editor.tsx`
- 사용되지 않는 `SlashMenu.tsx`
- `TagHighlightOverlay.tsx` 등 Milkdown 전환 후 Legacy

사용 여부를 확인하지 않고 일괄 삭제하지 않는다.

## 6. Package 변경

기존 활용:

- `cmdk`
- `react-resizable-panels`
- Radix Tabs/Dialog/Popover/Tooltip
- Milkdown
- Sonner

추가 후보:

```bash
npm install -D vitest jsdom @testing-library/react @testing-library/user-event @testing-library/jest-dom
```

Calendar Library는 즉시 추가하지 않는다. 초기에는 자체 Month/Week/Day Layout 또는 기존 `react-day-picker`를 활용하고 요구 기능이 확정된 뒤 판단한다.

## 7. CI 변경

변경:

- `.github/workflows/release.yml`
- `.github/workflows/windows-dist.yml`

생성:

- `.github/workflows/ci.yml`
- `.github/workflows/migration-test.yml`
- `.github/workflows/vdi-bundle.yml`

Hardcoded `2.0.0` 파일명 제거.
