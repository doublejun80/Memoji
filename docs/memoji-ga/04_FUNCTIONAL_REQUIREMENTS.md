# 04. 기능 요구사항

Priority:

- **P0**: GA Blocker
- **P1**: GA 필수
- **P2**: 2.1 권장
- **P3**: 후속 또는 조건부

## 1. App Shell과 Navigation

| ID | 요구사항 | 우선순위 | 수용 기준 |
|---|---|---|---|
| FR-001 | 3단 Layout 유지 | P0 | Left, Center, Right 구조가 1200×800에서 동시에 보인다. |
| FR-002 | Panel Resize | P0 | Left 220~360px, Right 288~440px 범위에서 Drag 가능하다. |
| FR-003 | Panel 상태 저장 | P0 | 폭·열림 상태가 재실행 후 복원된다. |
| FR-004 | Responsive Overlay | P0 | 1100px 미만에서 Right, 900px 미만에서 Left가 Overlay가 된다. |
| FR-005 | Workspace View | P1 | Editor, Tasks, Calendar, Knowledge, Search를 중앙에 렌더링한다. |
| FR-006 | Left View | P1 | Today, Daily, Projects, Tasks, Calendar, Knowledge를 전환한다. |
| FR-007 | Context Hub | P0 | AI, Outline, Links, Tasks, Properties Tab을 제공한다. |
| FR-008 | Context Tab 기억 | P1 | 마지막 Tab이 Device Setting에 저장된다. |
| FR-009 | Focus Mode | P1 | Side Panel과 Chrome이 숨겨지고 Editor/Selection AI는 사용 가능하다. |
| FR-010 | Keyboard Navigation | P0 | Mouse 없이 주요 View와 Panel을 탐색한다. |

## 2. Command Palette와 Search

| ID | 요구사항 | 우선순위 | 수용 기준 |
|---|---|---|---|
| FR-011 | Ctrl+K Palette | P0 | Page, Task, Command, Recent를 같은 Dialog에서 찾는다. |
| FR-012 | Command Registry | P0 | TopBar, Shortcut, Palette가 같은 Command 정의를 사용한다. |
| FR-013 | Search Group | P1 | Page, Task, Project, Command별 Group을 표시한다. |
| FR-014 | Search Query DSL | P1 | `title:`, `tag:`, `type:`, `due:`, `project:`, `is:`를 처리한다. |
| FR-015 | Search Pin | P2 | 검색 결과를 우측 Search Tab에 고정할 수 있다. |
| FR-016 | FTS Backend | P0 | 검색이 Frontend Page Array 전수 순회에 의존하지 않는다. |
| FR-017 | Search Highlight | P1 | 제목·본문 Snippet에 Match를 표시한다. |
| FR-018 | Empty Search | P1 | 검색어가 없을 때 최근 Page와 Command를 표시한다. |
| FR-019 | Korean Short Query | P1 | 1~2글자 검색은 별도 Fallback을 사용한다. |
| FR-020 | Search Source Anchor | P2 | 결과 클릭 시 Page의 Heading 또는 Chunk 위치로 이동한다. |

## 3. Editor와 Document Context

| ID | 요구사항 | 우선순위 | 수용 기준 |
|---|---|---|---|
| FR-021 | Milkdown 유지 | P0 | 기존 Markdown WYSIWYG와 GFM Table이 회귀하지 않는다. |
| FR-022 | Source Mode 유지 | P0 | Edit/Source 전환 후 Markdown이 보존된다. |
| FR-023 | Document Bar | P1 | Breadcrumb, Title, Save State, Mode, Menu가 보인다. |
| FR-024 | Metadata Strip | P1 | Type, Project, Date/Due, Status, Tags가 Compact하게 보인다. |
| FR-025 | Status Bar | P2 | Word, Revision, Index, Runtime, Storage가 보인다. |
| FR-026 | Selection Toolbar | P1 | Selection에서 다듬기·요약·할 일·번역을 실행한다. |
| FR-027 | Link Hover | P2 | Wiki Link Hover 시 연결 Page Preview를 보여준다. |
| FR-028 | Outline Sync | P1 | Heading Click과 Scroll 위치가 동기화된다. |
| FR-029 | Editor Read Width | P2 | 560~860px 설정을 저장한다. |
| FR-030 | Revision Indicator | P1 | 현재 Revision과 저장 시간을 확인한다. |

## 4. Page, Tag, Link와 Revision

| ID | 요구사항 | 우선순위 | 수용 기준 |
|---|---|---|---|
| FR-031 | Transactional Save V2 | P0 | Page, Revision, Index Job이 한 Transaction으로 저장된다. |
| FR-032 | Revision History | P0 | 저장된 변경 이력을 조회한다. |
| FR-033 | Revision Restore | P1 | 과거 Revision 복원이 새 Revision으로 기록된다. |
| FR-034 | Optimistic Conflict | P0 | Base Revision 불일치 시 덮어쓰지 않는다. |
| FR-035 | Trash | P1 | 기본 삭제는 `deleted_at`, 복원 가능하다. |
| FR-036 | Tag Normalize | P1 | `tags`, `node_tags` 테이블로 정규화한다. |
| FR-037 | Wiki Link Index | P1 | Incoming, Outgoing, Unresolved Link를 계산한다. |
| FR-038 | Stable Anchor | P1 | Heading/Task/AI Source 위치를 안정적으로 식별한다. |
| FR-039 | Reindex | P1 | 파생 인덱스를 원문에서 전체 재생성한다. |
| FR-040 | Import Backup | P0 | Migration/Import 전 자동 DB 백업을 만든다. |

## 5. Task와 Calendar

| ID | 요구사항 | 우선순위 | 수용 기준 |
|---|---|---|---|
| FR-041 | Task Parser | P1 | `- [ ]`, `- [x]`를 Task Index로 만든다. |
| FR-042 | Stable Task Marker | P1 | 동일 문장 또는 순서 변경에도 Task를 식별한다. |
| FR-043 | Task Status Sync | P1 | Task View의 완료 변경이 Markdown 원문에 반영된다. |
| FR-044 | Task Views | P1 | Inbox, Today, Upcoming, Overdue, Completed를 제공한다. |
| FR-045 | Task Metadata | P1 | Priority, Start, Due, Project, Assignee를 지원한다. |
| FR-046 | Repeating Task | P2 | RRULE 또는 동등한 반복 규칙을 지원한다. |
| FR-047 | Calendar Views | P1 | Month, Week, Day를 제공한다. |
| FR-048 | Task+Event Calendar | P1 | Due Task와 Event를 같은 Calendar에서 본다. |
| FR-049 | Event Link | P2 | Event가 Source Page와 연결된다. |
| FR-050 | ICS Import/Export | P2 | 오프라인 ICS 파일을 가져오고 내보낸다. |

## 6. Object Type와 Knowledge

| ID | 요구사항 | 우선순위 | 수용 기준 |
|---|---|---|---|
| FR-051 | Object Type | P2 | Page를 사용자 정의 Type으로 분류한다. |
| FR-052 | Property Definition | P2 | Text, Number, Boolean, Date, Select, Relation을 정의한다. |
| FR-053 | Property Value | P2 | Type별 Property를 Page에 저장한다. |
| FR-054 | Typed Relation | P2 | Project-Person, Supplier-Item 등 Relation을 저장한다. |
| FR-055 | Saved View | P2 | Filter, Sort, Group, Field를 저장한다. |
| FR-056 | Table View | P2 | Object/Task를 Table로 본다. |
| FR-057 | Board View | P2 | Status Property 기준 Kanban을 제공한다. |
| FR-058 | Timeline | P3 | Date 범위가 있는 Object를 Timeline으로 본다. |
| FR-059 | Knowledge Dashboard | P2 | Type, Tag, Relation, Unresolved Link를 탐색한다. |
| FR-060 | 업무 Template | P2 | Project, Meeting, Decision, Risk, Supplier, Item, RFP Template를 제공한다. |

## 7. AI UX

| ID | 요구사항 | 우선순위 | 수용 기준 |
|---|---|---|---|
| FR-061 | AI Full-height Tab | P0 | Search 때문에 AI 높이가 고정 축소되지 않는다. |
| FR-062 | Context Selector | P1 | Selection, Current Page, Project, Linked Pages를 선택한다. |
| FR-063 | Quick Action | P1 | Summary, Organize, Task, Decision, Risk, Rewrite, Translate를 제공한다. |
| FR-064 | AI Proposal | P0 | Replace/Structure 변경은 Proposal로 저장된다. |
| FR-065 | Diff Preview | P0 | 적용 전 변경 위치와 내용을 비교한다. |
| FR-066 | Proposal Partial Apply | P2 | 추출된 Task/Decision 일부만 적용한다. |
| FR-067 | Proposal Conflict | P0 | Revision이 바뀌면 자동 적용하지 않는다. |
| FR-068 | AI Citations | P1 | Page, Heading, Rank를 결과에 표시한다. |
| FR-069 | Citation Navigation | P1 | Source 클릭 시 해당 Page/Anchor로 이동한다. |
| FR-070 | AI Cancellation | P0 | 실행 중 취소하고 Runtime 자원을 회수한다. |
| FR-071 | AI Metrics | P1 | TTFT, Token, TPS, Runtime Mode를 기록한다. |
| FR-072 | Runtime Selector | P1 | E2B Speed, E4B Quality, Candle Fallback을 선택한다. |
| FR-073 | Capability Display | P0 | 실제 지원 기능만 UI에 표시한다. |
| FR-074 | MTP Verification | P0 | Target, Assistant, Acceptance Rate가 있어야 MTP로 표시한다. |
| FR-075 | AI Run History | P2 | 실행 결과와 Source, Proposal 상태를 조회한다. |

## 8. Runtime와 VDI

| ID | 요구사항 | 우선순위 | 수용 기준 |
|---|---|---|---|
| FR-076 | Managed Runtime | P0 | 앱이 Local Runtime 상태를 확인·시작·종료한다. |
| FR-077 | Loopback Only | P0 | 외부 Host Endpoint 저장을 거부한다. |
| FR-078 | Runtime Auth | P0 | Managed Runtime에 임의 Local Process가 요청하지 못한다. |
| FR-079 | Runtime Health | P0 | Process, Endpoint, Model을 구분해 확인한다. |
| FR-080 | Runtime Recovery | P1 | 비정상 종료 시 제한된 횟수로 재시작한다. |
| FR-081 | Model Manifest | P0 | Model, Runtime, Tokenizer의 SHA256과 License를 기록한다. |
| FR-082 | Runtime Compatibility | P1 | LiteRT-LM 버전별 CLI/API 호환 테스트를 자동화한다. |
| FR-083 | Candle Fallback | P1 | Server 실패 시 내장 Runtime 또는 명확한 오류를 제공한다. |
| FR-084 | VDI Benchmark | P1 | Cold/Warm, Prompt, Output, Thread 조합을 측정한다. |
| FR-085 | Diagnostic Export | P1 | 본문 없이 환경·오류·Benchmark를 ZIP으로 내보낸다. |

## 9. Import, Export와 Release

| ID | 요구사항 | 우선순위 | 수용 기준 |
|---|---|---|---|
| FR-086 | Path-based DB Import | P0 | JS Byte Array 없이 Rust가 File Path를 읽는다. |
| FR-087 | Markdown ZIP Export | P1 | Page, Metadata, Manifest, Attachment 목록을 Export한다. |
| FR-088 | Backup Checksum | P1 | Backup SHA256과 크기를 기록한다. |
| FR-089 | Migration Report | P0 | Page/Tag/Link/Task 전후 Count를 기록한다. |
| FR-090 | Signed Release | P0 | EXE/MSI/NSIS와 Runtime Binary를 서명한다. |
| FR-091 | SBOM | P1 | Frontend, Rust, Runtime Dependency SBOM을 제공한다. |
| FR-092 | Rollback | P0 | 이전 DB와 App Bundle로 복원 절차가 있다. |
| FR-093 | Dynamic Version | P1 | Workflow 파일명에 `2.0.0`을 하드코딩하지 않는다. |
| FR-094 | Release Test Gate | P0 | Typecheck, Unit, Build, Clippy, Cargo Test가 통과해야 Bundle한다. |
| FR-095 | GA Report | P0 | 구현·검증·미검증 항목을 명시한 보고서를 만든다. |

## 10. 하면 좋은 순서

| 순번 | 항목 | 범위 |
|---:|---|---|
| 1 | PR #1 검증·Baseline | GA |
| 2 | Save/Flush 회귀 테스트 | GA |
| 3 | AppShell 분리 | GA |
| 4 | Resizable Panel | GA |
| 5 | Responsive Overlay | GA |
| 6 | Context Hub | GA |
| 7 | Command Palette | GA |
| 8 | Document Bar·Metadata | GA |
| 9 | AI Proposal·Diff | GA |
| 10 | DB Schema Migration Framework | GA |
| 11 | Revision·Conflict | GA |
| 12 | FTS Search | GA |
| 13 | Tag·Link Index | GA |
| 14 | Task Parser·Task View | GA |
| 15 | Calendar 기본 View | GA |
| 16 | Runtime Capability·Cancellation | GA |
| 17 | VDI Benchmark·Diagnostic | GA |
| 18 | Release Sign·SBOM | GA |
| 19 | Object Type·Property | 2.1 |
| 20 | Saved View·Table·Board | 2.1 |
| 21 | AI Retrieval·Citation | 2.1 |
| 22 | Meeting→Decision/Action/Risk | 2.1 |
| 23 | Supplier·Item·RFP Template | 2.1 |
| 24 | Attachment·PDF Text | 2.2 |
| 25 | OCR·Transcript | 2.2 |
| 26 | Semantic Embedding | 2.2 |
| 27 | Plugin/Automation | 2.3 |
| 28 | Sync·Collaboration | 3.0 이후 |

## 11. 넣고 뺄 항목

### 유지

- Tauri
- React
- Milkdown
- SQLite
- Markdown Source of Truth
- Daily/Project
- Focus Mode
- Local AI
- ZIP Export
- PR #1 Settings와 Runtime 안정화

### 교체

| 현재 | 교체 |
|---|---|
| 고정 256/256 Panel | Resizable+Responsive |
| Right Search+AI Stack | Context Hub |
| SearchModal+Right Search 중복 | Command Palette |
| `INSERT OR REPLACE` | UPSERT |
| Tags JSON | Tag Relation |
| Page Array Search | SQLite FTS |
| 문자열 즉시 치환 | Proposal+Diff |
| MTP 이름만 표시 | Capability 기반 표시 |
| JS DB Byte Array Import | Path 기반 Import |

### GA에서 제외

- 실시간 협업
- Cloud AI
- P2P Sync
- Plugin Marketplace
- Canvas/Whiteboard
- 자율 Agent의 무승인 원문 수정
- 외부 Calendar 양방향 Sync
