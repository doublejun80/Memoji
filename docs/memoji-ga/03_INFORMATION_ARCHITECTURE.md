# 03. 정보 구조와 Navigation

## 1. 정보 구조의 기준

Memoji는 “페이지 목록이 많은 Markdown Editor”에서 “Markdown을 원본으로 사용하는 업무 지식 Workspace”로 확장한다. 메뉴 수를 늘리는 것이 목적이 아니다. 사용자가 현재 하려는 일을 기준으로 같은 데이터를 다른 View에서 보여준다.

```text
Workspace
├── Today
├── Daily
├── Projects
├── Tasks
├── Calendar
└── Knowledge
    ├── Object Types
    ├── Saved Views
    ├── Tags
    ├── Relations
    └── Unresolved Links
```

## 2. 주요 개념

| 개념 | 설명 |
|---|---|
| Page | Markdown 본문을 가진 기본 문서 |
| Object Type | Page를 프로젝트·회의·업체 등으로 구조화하는 유형 |
| Property | 날짜·상태·사람·숫자·Relation |
| Task | Markdown Checkbox에서 파생된 업무 인덱스 |
| Event | 일정 원본 또는 Page에 연결된 일정 |
| Relation | Page/Object 간 명시적 연결 |
| Link | Markdown Wiki Link 또는 일반 Link |
| View | 같은 Node 집합의 Filter/Sort/Layout |
| Proposal | AI가 만든 적용 전 변경안 |
| Revision | Page 원문 이력 |
| Chunk | 검색·AI 근거를 위한 Page 조각 |

## 3. Navigation State

```ts
export type LeftView =
  | 'today'
  | 'daily'
  | 'projects'
  | 'tasks'
  | 'calendar'
  | 'knowledge';

export type WorkspaceView =
  | 'editor'
  | 'tasks'
  | 'calendar'
  | 'knowledge'
  | 'search';

export type ContextHubTab =
  | 'ai'
  | 'outline'
  | 'links'
  | 'tasks'
  | 'properties'
  | 'search';

export interface WorkspaceNavigationState {
  leftView: LeftView;
  workspaceView: WorkspaceView;
  contextTab: ContextHubTab;
  selectedNodeId: string | null;
  selectedDateKey: string;
  selectedProjectId: string | null;
  searchSessionId: string | null;
}
```

## 4. 전환 규칙

| 사용 행동 | Left View | Center | Right |
|---|---|---|---|
| Daily Page 선택 | Daily | Editor | 이전 Tab 유지 |
| Project Page 선택 | Projects | Editor | 이전 Tab 유지 |
| Today에서 Task 선택 | Today | Editor 또는 Tasks | Tasks |
| Task 전체 보기 | Tasks | Tasks | Tasks |
| Calendar 날짜 선택 | Calendar | Calendar | Properties |
| Event 연결 Page 열기 | Calendar | Editor | Properties |
| Object Type 열기 | Knowledge | Knowledge | Properties |
| Wiki Link 클릭 | 해당 Context | Editor | Links |
| AI 근거 클릭 | 유지 | Editor | AI |
| Search 결과 고정 | 유지 | Search 또는 Editor | Search |

Page를 선택하면 무조건 Daily로 돌리는 현재 동작을 제거한다. 선택 Source와 Page Type에 따라 Left View를 유지한다.

## 5. Command Registry

Command를 UI Button마다 직접 구현하지 않는다.

```ts
export interface AppCommand {
  id: string;
  label: string;
  description?: string;
  keywords: string[];
  category: 'navigation' | 'create' | 'document' | 'ai' | 'view' | 'settings';
  shortcut?: string;
  enabled: (ctx: CommandContext) => boolean;
  run: (ctx: CommandContext) => void | Promise<void>;
}
```

Command 예:

```ts
const commands: AppCommand[] = [
  {
    id: 'page.new.daily',
    label: '새 데일리 메모',
    keywords: ['new', 'daily', '오늘', '메모'],
    category: 'create',
    shortcut: 'Ctrl+N',
    enabled: () => true,
    run: ({ actions }) => actions.createDailyPage(),
  },
  {
    id: 'ai.summarize.current',
    label: '현재 문서 요약',
    keywords: ['AI', 'summary', '요약'],
    category: 'ai',
    enabled: ({ currentPage }) => Boolean(currentPage?.content.trim()),
    run: ({ actions }) => actions.openAiAction('summarize'),
  },
];
```

TopBar, Overflow, Keyboard Shortcut, Command Palette는 같은 Registry를 사용한다.

## 6. Page Type별 기본 동작

| Type | Center 기본 | Right 기본 | 생성 Template |
|---|---|---|---|
| 일반 메모 | Editor | AI | 빈 Markdown |
| Daily | Editor | Tasks | 날짜 Heading |
| Project | Editor | Properties | 목적·상태·다음 액션 |
| Meeting | Editor | Tasks | 참석자·안건·결정·Action |
| Task | Tasks/Editor | Properties | Task Source |
| Decision | Editor | Links | 결정·근거·영향 |
| Risk | Editor | Properties | 심각도·대응 |
| Person | Knowledge | Links | 조직·역할 |
| Supplier | Knowledge | Links | 분야·담당·평가 |
| Item | Knowledge | Links | 제조사·모델·사양 |
| Document/RFP | Editor | AI | 버전·검토상태 |

## 7. Saved View

Saved View는 SQL 문자열을 저장하지 않는다.

```ts
export interface SavedViewDefinition {
  id: string;
  name: string;
  targetKind: 'node' | 'task' | 'event';
  layout: 'list' | 'table' | 'board' | 'calendar' | 'timeline';
  filters: FilterClause[];
  sort: SortClause[];
  groupBy?: string;
  visibleFields: string[];
}
```

DB에는 JSON으로 저장하되 Version을 포함한다.

## 8. Search 결과 동작

검색 결과 선택 방식:

1. `Enter`: Page/Task 열기
2. `Ctrl+Enter`: 새 Window 또는 향후 Split
3. `Alt+Enter`: 우측 Search Tab에 고정
4. `Tab`: 결과 Action 이동
5. `Escape`: Palette 닫기

Search가 비어 있을 때는 최근 Page와 Command를 표시한다.

## 9. Quick Capture

Quick Capture는 새로운 별도 DB가 아니다.

입력 유형:

- 일반 문장 → Inbox Page 또는 Daily Note
- `[] 업무 @due(2026-08-20)` → Task
- `@meeting` → Meeting Template
- 파일 Drag → Attachment Capture
- URL → Link Capture

Capture는 먼저 안전하게 저장하고, AI 분류는 비동기로 제안한다. AI 분류 실패로 원문 Capture를 잃지 않는다.

## 10. Project와 Daily의 관계

Daily Page에서 Project Link를 추가하면:

- 원문에는 `[[Project Name]]`
- 파생 Relation에 `daily -> project`
- Project View에서 관련 Daily Page 노출
- AI Project Context에 포함 가능

같은 문서를 복제하지 않는다.

## 11. 업무형 기본 Template

사용자 특성에 맞춰 선택 가능한 Template를 제공한다.

### 협력사/업체

```yaml
type: supplier
status: active
category:
owner:
rating:
related_projects: []
related_items: []
```

### 품목/솔루션

```yaml
type: item
manufacturer:
model:
specification:
supplier:
project:
```

### 문서/RFP

```yaml
type: document
document_type: RFP
version:
project:
review_status:
source:
```

Template는 GA Core를 막지 않도록 2.1 기능 Flag로 제공한다.
