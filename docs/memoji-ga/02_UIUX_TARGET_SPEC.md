# 02. Memoji 2.0 GA 목표 UI/UX 사양

## 1. 목표 화면

목표는 “새 제품처럼 전면 변경”이 아니다. 현재 화면을 알아볼 수 있는 상태에서 기능 수용력을 높인다.

```text
┌────────────────────────────────────────────────────────────────────────┐
│ Top Command Bar                                                       │
├────────────────┬────────────────────────────────────┬──────────────────┤
│ Workspace      │ Workspace Canvas                   │ Context Hub      │
│ Sidebar        │ Editor / Tasks / Calendar /        │ AI / Outline /  │
│                │ Knowledge / Search                 │ Links / Tasks / │
│                │                                    │ Properties       │
└────────────────┴────────────────────────────────────┴──────────────────┘
```

목표 화면 이미지는 다음 위치에 있다.

- `prototype/screenshots/target-ui-1200x800.png`
- `prototype/screenshots/target-ui-1440x900.png`
- `prototype/memoji-ga-shell.html`

## 2. 설계 원칙

1. **작성 중인 문서가 항상 중심이다.**
2. **부가기능은 필요할 때 선택한다.**
3. **검색과 명령은 한 진입점에서 처리한다.**
4. **AI는 결과보다 근거와 적용 통제가 중요하다.**
5. **Daily, Project, Task, Calendar를 서로 다른 저장소로 만들지 않는다.**
6. **Markdown 원문과 구조화 View가 양방향으로 연결된다.**
7. **VDI의 작은 화면, 낮은 CPU, 끊기는 Session을 기본 조건으로 본다.**
8. **기능을 숨기기보다 위치와 계층을 정리한다.**

## 3. 화면 크기와 Panel 규칙

| 항목 | 기본 | 최소 | 최대 | 저장 |
|---|---:|---:|---:|---|
| Top Command Bar | 48px | 48px | 48px | 고정 |
| Left Sidebar | 240px | 220px | 360px | Device별 |
| Right Context Hub | 304px | 288px | 440px | Device별 |
| Center Canvas | 가변 | 560px | 제한 없음 | 해당 없음 |
| Status Bar | 22px | 22px | 22px | 설정에서 숨김 가능 |
| Editor 읽기 폭 | 760px | 560px | 860px | 사용자 설정 가능 |

### 3.1 Responsive 규칙

| Viewport | 동작 |
|---|---|
| 1360px 이상 | 좌·중·우 동시 표시 |
| 1100~1359px | 우측 288px, 중앙 우선 |
| 900~1099px | 우측은 Overlay Drawer |
| 800~899px | 좌·우 모두 Overlay Drawer |
| Focus Mode | Editor 중심, Side Panel 숨김, Selection AI 사용 가능 |

`react-resizable-panels`가 이미 의존성에 있으므로 새 Layout Library를 추가하지 않는다.

## 4. Top Command Bar

### 4.1 항상 노출

왼쪽:

1. Left Panel Toggle
2. Memoji Icon
3. Workspace Name

중앙:

4. `페이지, 할 일 또는 명령 검색`
5. `Ctrl+K` Key Hint

오른쪽:

6. Save Status
7. Local AI Runtime Status
8. Context Hub Toggle
9. Overflow
10. Window Controls

### 4.2 Overflow로 이동

- Focus Mode
- Theme
- Export
- Keyboard Shortcut
- Settings
- Diagnostics

### 4.3 상태 표현

| 상태 | 표시 |
|---|---|
| 저장됨 | 녹색 Dot + `저장됨` |
| 저장 중 | 회전 Indicator + `저장 중` |
| 저장 실패 | 적색 Dot + `저장 실패` |
| Index 대기 | Status Bar에 `인덱스 대기` |
| AI 준비 | `Gemma 4 E2B · 로컬` |
| AI 서버 미응답 | `AI 확인 필요` |
| 실제 MTP | Runtime Capability가 Target/Assistant를 보고할 때만 `MTP` |

## 5. Left Workspace Sidebar

### 5.1 View Switcher

기본 항목:

1. 오늘
2. 데일리
3. 프로젝트
4. 할 일
5. 일정
6. 지식

각 항목은 Icon, Tooltip, `aria-label`을 갖는다. 256px 화면에서 Icon+짧은 Label을 모두 표시할 수 있다.

### 5.2 오늘

한 화면에서 다음을 보여준다.

- 오늘 작성한 페이지
- 미완료 Task
- 오늘 Event
- 최근 Project
- 검토 대기 AI Proposal

전체 Dashboard Card를 만들지 않는다. 기존 Page List 밀도를 유지한 Section 목록으로 구성한다.

### 5.3 데일리

- 선택 날짜
- 해당 날짜 Page List
- 새 Daily Page
- Mini Calendar
- 날짜가 있는 Task/Event 요약

Mini Calendar는 Daily View에서만 Bottom에 표시한다.

### 5.4 프로젝트

기존 Folder/Page Tree를 유지한다.

추가:

- Project Status Dot
- 미완료 Task Count
- Pin
- 최근 항목
- Context Menu의 Move/Archive

### 5.5 할 일

왼쪽에는 Filter만 둔다.

- Inbox
- Today
- Upcoming
- Overdue
- Completed
- Project별 Group

실제 Task List는 중앙 Workspace에 표시한다.

### 5.6 일정

왼쪽에는 Mini Calendar와 Calendar Source Filter를 둔다. 중앙은 Day/Week/Month View를 표시한다.

### 5.7 지식

- Object Type 목록
- Saved View
- Tag
- Unresolved Link
- Recently Updated

Object Type 기본 Template:

- 프로젝트
- 회의
- 할 일
- 의사결정
- 이슈·리스크
- 사람
- 업체·협력사
- 품목·솔루션
- 문서·RFP
- 일반 메모

## 6. Workspace Canvas

중앙은 현재 선택한 `WorkspaceView`를 렌더링한다.

```ts
type WorkspaceView =
  | 'editor'
  | 'tasks'
  | 'calendar'
  | 'knowledge'
  | 'search';
```

### 6.1 Editor Workspace

#### Document Bar

- Breadcrumb
- Icon
- Editable Title
- Save State
- Edit/Source
- Overflow

#### Metadata Strip

기본 노출:

- Object Type
- Project
- Date 또는 Due
- Status
- 주요 Tag
- `+ 속성`

전체 Property 편집은 우측 Properties 탭에서 처리한다.

#### Editor Body

- Milkdown 유지
- 읽기 폭 760px
- Heading·Table·Task List·Wiki Link 유지
- Selection AI Toolbar
- AI Proposal Highlight
- Link Hover Preview

#### Status Bar

- Word Count
- Revision
- Index State
- Markdown
- Runtime
- Local Storage

### 6.2 Tasks Workspace

중앙 전체 폭을 사용한다.

구성:

- 상단 Filter/Sort/Group
- Task List 또는 Board
- Due, Project, Source Page
- Task를 열면 Source Page와 Stable Anchor로 이동
- 완료 체크 시 Markdown 원문을 Patch하고 새 Revision 생성

### 6.3 Calendar Workspace

- Month
- Week
- Day
- Task Due와 Event 통합
- Event 클릭 시 연결 Page 또는 Event Inspector
- Drag 변경은 원문/이벤트 DB 동기화 전에 Confirmation

### 6.4 Knowledge Workspace

GA 이후 2.1 범위:

- Object Table
- Saved Query
- Relation
- Backlink
- Unresolved Link
- Table/Kanban/Timeline

## 7. Context Hub

```ts
type ContextHubTab =
  | 'ai'
  | 'outline'
  | 'links'
  | 'tasks'
  | 'properties'
  | 'search';
```

기본 Tab은 AI다. 마지막 선택 Tab은 Device별로 기억한다.

### 7.1 AI

구성:

1. Runtime/Model Selector
2. Context Source Chip
3. Quick Action
4. Conversation
5. Proposal
6. Sticky Composer

Quick Action:

- 요약
- 정리
- 할 일
- 결정
- 리스크
- 선택 문장 다듬기
- 번역

선택된 문장이 있으면 Quick Action 우선 Context가 Selection으로 바뀐다.

### 7.2 Outline

- Heading 계층
- 현재 Scroll 위치
- Heading Click 이동
- Heading별 Task/Link Count
- 긴 문서에서 Mini Map 역할

### 7.3 Links

- Incoming Link
- Outgoing Link
- Unresolved Link
- Mention
- Relation

### 7.4 Tasks

- 현재 문서에서 추출한 Task
- Project Task
- 완료/미완료
- Due
- Source Anchor 이동

### 7.5 Properties

- Object Type
- Property
- Relation
- Tag
- Created/Updated
- Revision
- Attachment
- History

### 7.6 Search

기본 Tab이 아니다. Command Palette 결과에서 `우측에 고정`을 선택했을 때만 열린다.

## 8. Command Palette

`Ctrl+K` 하나로 다음을 처리한다.

### 8.1 결과 Group

1. 빠른 명령
2. 페이지
3. 할 일
4. 프로젝트
5. 최근
6. 설정

### 8.2 빠른 명령 예

- 새 데일리 메모
- 빠른 캡처
- 새 프로젝트
- AI Panel 열기
- 현재 문서 요약
- Task View
- Calendar View
- Export
- Settings
- Focus Mode
- Left/Right Panel Toggle

### 8.3 검색 문법

| 문법 | 의미 |
|---|---|
| `title:구매AX` | 제목 |
| `tag:Sprint1` | Tag |
| `type:회의` | Object Type |
| `due:today` | 오늘 마감 |
| `project:Memoji` | Project |
| `is:task` | Task |
| `before:2026-08-01` | 날짜 |
| 일반 문자열 | FTS 통합 검색 |

## 9. AI 결과 적용 UX

### 9.1 Insert

새 Section 추가처럼 기존 원문을 훼손하지 않는 작업은 바로 삽입할 수 있다. 삽입 전 위치를 보여준다.

### 9.2 Replace

문장 또는 Section 치환은 Proposal이 필요하다.

Proposal Card:

- 제안 유형
- Base Revision
- 변경 요약
- 근거
- Diff 보기
- 복사
- 폐기
- 적용

### 9.3 Extract

Task, Decision, Risk 추출은 구조화 결과를 먼저 보여준다.

예:

```text
할 일 4건
[ ] 8월 20일 미팅 자료 준비
[ ] LiteRT-LM 0.16.0 회귀 테스트
[ ] FTS5 Migration 검토
[ ] AI Proposal UI 구현
```

사용자는 전체 또는 일부만 선택해 적용한다.

### 9.4 Conflict

Proposal 생성 뒤 문서 Revision이 바뀌면:

```text
현재 문서가 제안 생성 이후 변경됐습니다.
자동 적용하지 않았습니다.
[새 Diff 계산] [복사] [폐기]
```

## 10. Selection Toolbar

문장을 Drag하면 선택 영역 근처에 작은 Toolbar를 표시한다.

- 다듬기
- 요약
- 할 일
- 번역
- AI에 질문

Toolbar는 편집 영역을 가리지 않도록 위/아래 위치를 자동 결정한다. Focus Mode에서도 사용할 수 있다.

## 11. Typography

현재 8~10px 문구가 많은 문제를 수정한다.

| 용도 | 크기 |
|---|---:|
| Editor Body | 15~16px |
| Sidebar Row | 12px |
| Control | 12px |
| Status/Metadata | 10~11px |
| Tooltip | 11px |
| Persistent 최소 | 11px |
| H1 | 26~30px |
| H2 | 19~21px |

## 12. 키보드

| 키 | 기능 |
|---|---|
| `Ctrl+K` | 통합 검색·명령 |
| `Ctrl+N` | 현재 Context의 새 Page |
| `Ctrl+Shift+N` | 빠른 캡처 |
| `Ctrl+S` | Flush 저장 |
| `Ctrl+E` | 편집/원문 |
| `Ctrl+Shift+A` | AI Context Hub |
| `Alt+1` | 오늘 |
| `Alt+2` | 데일리 |
| `Alt+3` | 프로젝트 |
| `Alt+4` | 할 일 |
| `Alt+5` | 일정 |
| `Alt+6` | 지식 |
| `F11` | 집중 모드 |
| `Escape` | Overlay/Palette 닫기 |

## 13. 화면 상태 저장

Device Setting:

- Left Width
- Right Width
- Left Open
- Right Open
- Left View
- Workspace View
- Context Tab
- Editor Read Width
- Focus Mode
- Theme

Page/Workspace Setting과 Device Setting을 분리한다.

## 14. 빈 상태

| 화면 | 문구 | 기본 행동 |
|---|---|---|
| Page 없음 | `페이지를 선택하거나 새 메모를 만드세요.` | 새 메모 |
| Task 없음 | `이 보기의 할 일이 없습니다.` | Task 추가 |
| Link 없음 | `아직 연결된 페이지가 없습니다.` | Link 만들기 |
| AI 없음 | `로컬 AI를 준비하고 있습니다.` | 상태 확인 |
| Search 없음 | `일치하는 페이지나 명령이 없습니다.` | 검색어 지우기 |
| Migration 오류 | `원본 DB는 변경되지 않았습니다.` | 로그/백업 열기 |

## 15. 현재 구조에서 유지·변경

| 영역 | 유지 | 변경 |
|---|---|---|
| TopBar | Window 제어, Panel Toggle | Command Search 중심으로 단순화 |
| Sidebar | Daily/Project Tree | 6개 View와 Contextual Footer |
| Editor | Milkdown, Source Mode | Document Bar, Metadata, Status |
| RightPanel | AI 위치 | Context Hub 탭 |
| Search | Ctrl+K | Modal+Right 검색을 Command Palette로 통합 |
| Settings | PR #1 2-pane | Search/Layout 설정 추가 |
| Focus | 전체 화면 | Selection AI 유지 |
