# 06. 프런트엔드 아키텍처

## 1. 현재 구조의 문제

현재 `App.tsx`는 다음을 동시에 관리한다.

- Page Array
- Current Page
- Daily/Project Navigation
- Selected Date
- Search/Settings/Shortcut Modal
- Left/Right Panel
- Page Create/Update/Delete/Move
- Save Trigger
- Export
- Editor Insert/Replace

기능을 Task, Calendar, Knowledge, AI Proposal까지 확장하면 `App.tsx`가 전역 Store처럼 변한다. 전역 State Library를 먼저 추가하기보다 Domain State와 UI State를 분리한 Context+Reducer 구조로 시작한다.

## 2. 목표 파일 구조

```text
src/
├── app/
│   ├── AppShell.tsx
│   ├── AppProviders.tsx
│   ├── workspaceState.ts
│   ├── workspaceReducer.ts
│   ├── useWorkspaceController.ts
│   ├── panelLayout.ts
│   └── keyboardBindings.ts
├── commands/
│   ├── CommandPalette.tsx
│   ├── commandRegistry.ts
│   ├── commandSearch.ts
│   └── types.ts
├── workspace/
│   ├── TopCommandBar.tsx
│   ├── WorkspaceLayout.tsx
│   ├── WorkspaceSidebar.tsx
│   ├── WorkspaceCanvas.tsx
│   ├── WorkspaceStatusBar.tsx
│   └── views/
│       ├── TodaySidebarView.tsx
│       ├── DailySidebarView.tsx
│       ├── ProjectsSidebarView.tsx
│       ├── TasksSidebarView.tsx
│       ├── CalendarSidebarView.tsx
│       └── KnowledgeSidebarView.tsx
├── context/
│   ├── ContextHub.tsx
│   ├── contextHubState.ts
│   ├── OutlinePanel.tsx
│   ├── LinksPanel.tsx
│   ├── DocumentTasksPanel.tsx
│   ├── PropertiesPanel.tsx
│   └── SearchPinPanel.tsx
├── editor/
│   ├── DocumentWorkspace.tsx
│   ├── DocumentBar.tsx
│   ├── MetadataStrip.tsx
│   ├── SelectionAiToolbar.tsx
│   ├── MilkdownEditor.tsx
│   └── useDocumentEditor.ts
├── features/
│   ├── pages/
│   │   ├── pageQueries.ts
│   │   ├── pageCommands.ts
│   │   └── pageTypes.ts
│   ├── tasks/
│   │   ├── TasksWorkspace.tsx
│   │   ├── TaskList.tsx
│   │   ├── taskFilters.ts
│   │   └── taskTypes.ts
│   ├── calendar/
│   │   ├── CalendarWorkspace.tsx
│   │   ├── MonthView.tsx
│   │   ├── WeekView.tsx
│   │   └── eventTypes.ts
│   ├── knowledge/
│   │   ├── KnowledgeWorkspace.tsx
│   │   ├── ObjectTable.tsx
│   │   └── knowledgeTypes.ts
│   └── ai/
│       ├── AiAssistantPanel.tsx
│       ├── AiComposer.tsx
│       ├── AiConversation.tsx
│       ├── AiProposalCard.tsx
│       ├── AiDiffDialog.tsx
│       ├── aiRuntime.ts
│       ├── aiStream.ts
│       └── aiTypes.ts
├── shared/
│   ├── api/
│   │   ├── tauriCommands.ts
│   │   ├── pageApi.ts
│   │   ├── searchApi.ts
│   │   ├── taskApi.ts
│   │   ├── calendarApi.ts
│   │   └── aiApi.ts
│   ├── components/
│   ├── hooks/
│   ├── types/
│   └── utils/
├── styles/
│   ├── tokens.css
│   ├── shell.css
│   ├── editor.css
│   ├── context-hub.css
│   └── settings.css
├── App.tsx
└── main.tsx
```

## 3. App.tsx 책임

```tsx
export default function App() {
  return (
    <AppProviders>
      <AppShell />
    </AppProviders>
  );
}
```

AppShell은 Layout 조립만 한다.

```tsx
export function AppShell() {
  const controller = useWorkspaceController();

  return (
    <WorkspaceLayout
      topBar={<TopCommandBar controller={controller} />}
      left={<WorkspaceSidebar controller={controller} />}
      center={<WorkspaceCanvas controller={controller} />}
      right={<ContextHub controller={controller} />}
      commandPalette={<CommandPalette controller={controller} />}
    />
  );
}
```

## 4. 상태 구분

### 4.1 Domain State

Backend가 원본인 상태:

```ts
interface DomainState {
  selectedPageSummary: PageSummary | null;
  selectedPageBody: PageBody | null;
  currentRevision: number | null;
  tasks: TaskSummary[];
  events: EventSummary[];
  backlinks: PageLinkSummary[];
  properties: PropertyValue[];
}
```

### 4.2 UI State

Device에 저장되는 상태:

```ts
interface UiState {
  leftOpen: boolean;
  rightOpen: boolean;
  leftWidth: number;
  rightWidth: number;
  leftView: LeftView;
  workspaceView: WorkspaceView;
  contextTab: ContextHubTab;
  commandPaletteOpen: boolean;
  focusMode: boolean;
}
```

### 4.3 Transient State

저장하지 않는 상태:

```ts
interface TransientState {
  activeOverlay: 'left' | 'right' | null;
  selection: EditorSelection | null;
  pendingNavigation: NavigationIntent | null;
  activeAiRequestId: string | null;
  activeProposalId: string | null;
}
```

## 5. Workspace Reducer

```ts
type WorkspaceAction =
  | { type: 'LEFT_VIEW_CHANGED'; view: LeftView }
  | { type: 'WORKSPACE_VIEW_CHANGED'; view: WorkspaceView }
  | { type: 'CONTEXT_TAB_CHANGED'; tab: ContextHubTab }
  | { type: 'PAGE_SELECTED'; pageId: string; source: SelectionSource }
  | { type: 'DATE_SELECTED'; dateKey: string }
  | { type: 'PANEL_RESIZED'; panel: 'left' | 'right'; width: number }
  | { type: 'PANEL_TOGGLED'; panel: 'left' | 'right' }
  | { type: 'COMMAND_PALETTE_CHANGED'; open: boolean }
  | { type: 'SELECTION_CHANGED'; selection: EditorSelection | null };
```

Reducer에서 비동기 저장을 하지 않는다. `useWorkspaceController`가 Effect와 Command를 관리한다.

## 6. Navigation Controller

```ts
export interface WorkspaceController {
  state: WorkspaceState;
  actions: {
    selectPage(pageId: string, source: SelectionSource): Promise<void>;
    selectDate(dateKey: string): Promise<void>;
    changeLeftView(view: LeftView): Promise<void>;
    changeWorkspaceView(view: WorkspaceView): Promise<void>;
    openContextTab(tab: ContextHubTab): void;
    flushEditor(): Promise<void>;
    openCommandPalette(initialQuery?: string): void;
    runCommand(commandId: string): Promise<void>;
  };
}
```

Page/Date/View 전환은 공통 Guard를 거친다.

```ts
async function guardedNavigate(intent: NavigationIntent) {
  await editorRef.current?.flushUnsaved();
  dispatchNavigation(intent);
}
```

PR #1의 `flushUnsaved()`를 이 Guard의 기반으로 사용한다.

## 7. Resizable Panel

기존 의존성 `react-resizable-panels` 사용:

```tsx
<PanelGroup direction="horizontal" autoSaveId="memoji.workspace.layout.v1">
  <Panel
    id="left"
    defaultSize={20}
    minSize={18}
    maxSize={30}
  >
    <WorkspaceSidebar />
  </Panel>
  <PanelResizeHandle className="memoji-panel-handle" />
  <Panel id="center" minSize={45}>
    <WorkspaceCanvas />
  </Panel>
  <PanelResizeHandle className="memoji-panel-handle" />
  <Panel
    id="right"
    defaultSize={25}
    minSize={22}
    maxSize={36}
  >
    <ContextHub />
  </Panel>
</PanelGroup>
```

Pixel 기준 최소 폭도 `ResizeObserver`로 검증한다. Percentage만 사용하면 800px에서 중앙이 지나치게 작아질 수 있다.

## 8. Responsive Layout

```ts
export type LayoutMode = 'three-pane' | 'right-overlay' | 'dual-overlay';

export function resolveLayoutMode(width: number): LayoutMode {
  if (width < 900) return 'dual-overlay';
  if (width < 1100) return 'right-overlay';
  return 'three-pane';
}
```

Overlay는 Radix Dialog가 아니라 Non-modal Sheet 성격이다. Editor Keyboard Focus를 불필요하게 가두지 않는다. 다만 Command Palette와 Settings는 Modal이다.

## 9. Command Palette

기존 `cmdk` 의존성을 사용한다.

```tsx
<Command.Dialog open={open} onOpenChange={setOpen}>
  <Command.Input value={query} onValueChange={setQuery} />
  <Command.List>
    <Command.Group heading="빠른 명령">
      {commandResults.map(renderCommand)}
    </Command.Group>
    <Command.Group heading="페이지">
      {pageResults.map(renderPage)}
    </Command.Group>
    <Command.Group heading="할 일">
      {taskResults.map(renderTask)}
    </Command.Group>
  </Command.List>
</Command.Dialog>
```

Search API는 150ms Debounce를 사용하되 Command Filter는 즉시 실행한다.

## 10. Page Summary와 Body 분리

현재 `get_pages`는 모든 본문을 반환한다. V3에서는 분리한다.

```ts
interface PageSummary {
  id: string;
  title: string;
  icon: string;
  parentId: string | null;
  objectTypeId: string | null;
  dateKey: string | null;
  updatedAt: string;
  status: string | null;
  taskCount: number;
  backlinkCount: number;
}

interface PageBody {
  id: string;
  bodyMarkdown: string;
  revision: number;
  contentHash: string;
}
```

Frontend API:

```ts
listPageSummaries(query: PageListQuery): Promise<PageSummary[]>
getPageBody(pageId: string): Promise<PageBody>
```

Page Body는 선택할 때 Lazy Load한다.

## 11. Context Hub

```tsx
<Tabs value={activeTab} onValueChange={setTab}>
  <TabsList aria-label="문서 보조 기능">
    <TabsTrigger value="ai">AI</TabsTrigger>
    <TabsTrigger value="outline">목차</TabsTrigger>
    <TabsTrigger value="links">링크</TabsTrigger>
    <TabsTrigger value="tasks">할 일</TabsTrigger>
    <TabsTrigger value="properties">속성</TabsTrigger>
  </TabsList>
  <TabsContent value="ai"><AiAssistantPanel /></TabsContent>
  <TabsContent value="outline"><OutlinePanel /></TabsContent>
  <TabsContent value="links"><LinksPanel /></TabsContent>
  <TabsContent value="tasks"><DocumentTasksPanel /></TabsContent>
  <TabsContent value="properties"><PropertiesPanel /></TabsContent>
</Tabs>
```

각 Tab은 선택될 때 Data를 Fetch한다. 모든 Data를 초기 Load하지 않는다.

## 12. AI State 분리

### 현재

`AIChatAssistant.tsx`가 Status Poll, Model Load, Stream, Message, Editor Apply를 모두 담당한다.

### 목표

```text
useAiRuntimeStatus()
useAiConversation()
useAiStream()
useAiProposal()
AiAssistantPanel
AiConversation
AiComposer
AiProposalCard
AiDiffDialog
```

```ts
interface AiConversationState {
  messages: AiMessage[];
  activeRequestId: string | null;
  streamingText: string;
  status: 'idle' | 'retrieving' | 'generating' | 'canceling' | 'error';
}
```

Stream Event는 `requestAnimationFrame` 또는 33ms Buffer로 UI를 갱신한다.

## 13. AI Proposal State

```ts
interface AiProposal {
  id: string;
  aiRunId: string;
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

```ts
interface TextPatch {
  anchorId?: string;
  expectedTextHash?: string;
  start?: number;
  end?: number;
  before: string;
  after: string;
}
```

## 14. Tauri Command 중앙화

```ts
export const TauriCommand = {
  ListPages: 'list_page_summaries',
  GetPageBody: 'get_page_body',
  SavePageV2: 'save_page_v2',
  Search: 'search_workspace',
  ListTasks: 'list_tasks',
  ListEvents: 'list_events',
  GenerateAi: 'local_ai_generate_v2',
  CancelAi: 'local_ai_cancel',
  CreateProposal: 'create_ai_proposal',
  ApplyProposal: 'apply_ai_proposal',
} as const;
```

컴포넌트에서 `invoke('...')`를 직접 쓰지 않는다.

## 15. CSS 구조

현재 `src/index.css`는 Build Output과 제품 Style이 섞여 있다.

목표:

```text
src/styles/tokens.css
src/styles/shell.css
src/styles/sidebar.css
src/styles/editor.css
src/styles/context-hub.css
src/styles/command-palette.css
src/styles/settings.css
```

Tailwind Utility와 제품 Class를 혼용하되, Layout 핵심 수치와 상태는 CSS Variable로 정의한다.

```css
:root {
  --memoji-topbar-height: 48px;
  --memoji-left-panel-default: 240px;
  --memoji-right-panel-default: 304px;
  --memoji-editor-read-width: 760px;
  --memoji-statusbar-height: 22px;
}
```

## 16. Frontend Test

현재 `tsx` 기반 Pure Function Test를 유지한다. Component refactor 단계에서 다음을 추가한다.

```bash
npm install -D vitest jsdom @testing-library/react @testing-library/user-event @testing-library/jest-dom
```

필수 Component Test:

1. AppShell Panel Toggle
2. Responsive Overlay
3. Ctrl+K Open/Close
4. Command Run
5. Context Tab
6. Page Navigate Flush
7. AI Cancel
8. Proposal Conflict
9. Keyboard Focus
10. 800×600 Overflow

## 17. 현재 파일 Mapping

| 현재 파일 | 처리 |
|---|---|
| `src/App.tsx` | Provider 조립으로 축소 |
| `TopBar.tsx` | `TopCommandBar.tsx`로 대체, Window Controls 분리 |
| `Sidebar.tsx` | Tree Logic 보존, View별 컴포넌트 분리 |
| `RightPanel.tsx` | `ContextHub.tsx`로 대체 |
| `SearchModal.tsx` | `CommandPalette.tsx`로 통합 |
| `MarkdownEditor.tsx` | `DocumentWorkspace.tsx`로 확장 |
| `AIChatAssistant.tsx` | AI Feature 모듈로 분리 |
| `SettingsModal.tsx` | PR #1 구조 유지 |
| `index.css` | 제품 Style 분리 후 Legacy 제거 |
