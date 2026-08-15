# 01. 현재 UI 코드 감사

검토 기준:

- 저장소: `doublejun80/Memoji`
- 기본 Branch: `main`
- 안정화 기준 후보: PR #1 `codex/review-settings-vdi-performance`
- 검토일: 2026-08-14
- 검토 방식: 실제 React/Tauri 소스, CSS, PR Patch, 창 설정을 기준으로 화면을 재구성했다.

현재 화면을 코드 기준으로 재현한 이미지는 `prototype/screenshots/current-ui-1200x800.png`에 있다.

## 1. 현재 화면 골격

```text
┌────────────────────────────────────────────────────────────────────┐
│ TopBar 52px                                                        │
├──────────────┬───────────────────────────────────┬─────────────────┤
│ Left 256px   │ Center Editor                     │ Right 256px     │
│ Daily/Project│ Title + Save + Edit/Source        │ Search          │
│ Page Tree    │ Milkdown                          │ Search Results  │
│ Mini Calendar│                                   │ AI Chat         │
└──────────────┴───────────────────────────────────┴─────────────────┘
```

`src-tauri/tauri.conf.json`의 기본 창은 1200×800이고 최소 크기는 800×600이다. `src/App.tsx`는 좌측을 `16rem`, 우측을 `w-64`로 고정한다.

1200px 기본 창의 수평 공간은 다음과 같다.

| 영역 | 폭 |
|---|---:|
| 좌측 Sidebar | 256px |
| 우측 RightPanel | 256px |
| 중앙 Editor | 약 688px |
| 합계 | 1,200px |

800px 최소 창에서는 좌우 512px을 제외하면 중앙이 약 288px에 불과하다. 현재 코드는 좌우를 Overlay로 전환하지 않으므로 최소 크기 지원과 실사용성이 충돌한다.

## 2. 파일별 책임

| 순번 | 파일 | 현재 책임 | 평가 |
|---:|---|---|---|
| 1 | `src/App.tsx` | 페이지·날짜·Panel·Modal·생성·이동·삭제·저장·내보내기 상태 | 책임 과다 |
| 2 | `src/components/TopBar.tsx` | 패널·집중·테마·저장·내보내기·단축키·설정·Window 제어 | 버튼 밀집 |
| 3 | `src/components/Sidebar.tsx` | Daily, Project, Calendar, Tree, Drag/Move, Emoji, 메뉴 | 유용하지만 대형 파일 |
| 4 | `src/components/MarkdownEditor.tsx` | 제목·저장 상태·편집/원문·Milkdown | 구조는 단순하고 유지 가치 높음 |
| 5 | `src/components/RightPanel.tsx` | 검색·검색 결과·AI Chat | 기능 확장에 취약 |
| 6 | `src/components/AIChatAssistant.tsx` | Runtime 상태·Stream·Prompt·Quick Action·삽입/치환 | AI UX와 Runtime 책임 혼합 |
| 7 | `src/components/SearchModal.tsx` | 전체 페이지 검색·키보드 이동 | Command Palette로 확장 가능 |
| 8 | `src/components/SettingsModal.tsx` | 설정 전 영역 | PR #1의 2-pane 개편 유지 |
| 9 | `src/index.css` | Tailwind 생성 결과와 제품 CSS가 한 파일에 혼합 | 관리 비용 높음 |

## 3. 유지해야 할 현재 장점

### 3.1 세 개의 명확한 작업 영역

좌측에서 문서를 찾고, 중앙에서 작성하고, 우측에서 보조 기능을 쓰는 흐름은 학습 비용이 낮다. 화면을 Notion식 Dashboard나 Tana식 Outliner로 전면 교체할 이유가 없다.

### 3.2 Daily와 Project 구분

`Sidebar.tsx`의 Daily/Project 전환은 사용자가 날짜 기반 기록과 장기 프로젝트를 분리해 찾게 한다. 데이터 모델을 확장하더라도 이 구분은 유지해야 한다.

### 3.3 Markdown Source of Truth

`MarkdownEditor.tsx`는 Milkdown과 Source Mode를 제공하며 본문을 문자열로 저장한다. 이 구조는 VDI에서 복구, Export, Migration에 유리하다.

### 3.4 집중 모드

현재 Focus Mode는 TopBar와 좌우 Panel을 숨긴다. 긴 글 작성에 실질적인 가치가 있으므로 유지한다.

### 3.5 화면 안의 로컬 AI

문서를 보면서 AI에 질문하고 결과를 삽입하는 흐름은 Memoji의 핵심 차별점이다. AI를 별도 Window로만 분리하지 않는다.

## 4. 화면별 문제

### 4.1 TopBar

현재 TopBar에는 다음 작업이 오른쪽에 연속 배치된다.

1. 집중 모드
2. 테마
3. 우측 Panel
4. 저장
5. Markdown Export
6. 단축키
7. 설정
8. 최소화
9. 최대화
10. 닫기

고빈도와 저빈도 작업이 같은 시각적 무게를 갖는다. Icon-only 버튼은 Title에 의존하며 900px 이하에서 버튼 크기를 28px로 줄인다.

개선:

- 항상 노출: 좌측 Panel, Workspace 이름, 통합 검색, 저장 상태, AI 상태, 우측 Panel, Window 제어
- Overflow 또는 Command Palette: 집중 모드, 테마, Export, 단축키, 설정
- 저장 버튼은 수동 저장보다 상태 표시를 우선하고 `Ctrl+S`는 유지한다.

### 4.2 Sidebar

`Sidebar.tsx`는 520px 이상에서 Daily와 Project를 나란히 표시하는 Wide Layout을 갖고 있다. 그러나 AppShell이 폭을 256px로 고정하므로 기본 화면에서 Wide Layout은 사실상 도달하지 않는다.

현재 Daily 화면의 하단 Mini Calendar는 페이지 목록 높이를 항상 줄인다. Project 화면에는 Calendar가 없어서 View 간 구조도 다르다.

개선:

- Wide Layout 분기를 제거하거나 별도 Workspace 화면에 사용한다.
- 상단 View Switcher를 `오늘·데일리·프로젝트·할 일·일정·지식`으로 확장한다.
- Calendar는 Daily/Calendar View에서만 표시한다.
- Page/Folder Tree 로직은 유지한다.
- 프로젝트 Tree 재귀 보호와 Map 기반 조회는 PR #1 변경을 보존한다.

### 4.3 중앙 Editor

현재 Header가 제공하는 정보는 제목, 저장 상태, 편집/원문뿐이다.

기능 확장 시 필요한 정보:

- Breadcrumb
- Object Type
- Project
- Date/Due
- Tags
- Revision
- Index 상태
- Document Menu
- AI Proposal 상태

이 정보를 모두 Header 한 줄에 넣으면 복잡해진다. `DocumentBar + Compact Metadata Strip + StatusBar` 세 층으로 나누는 것이 적절하다.

### 4.4 RightPanel

현재 우측은 다음처럼 강제 분할된다.

```text
검색 입력·필터
검색 결과 최대 180px
AI Assistant 나머지 공간
```

문제:

1. 검색하지 않아도 검색 영역이 공간을 차지한다.
2. 결과가 많아도 180px만 사용한다.
3. AI 응답이 길수록 Composer와 결과가 좁다.
4. Outline, Backlink, Properties, Task를 추가할 자리가 없다.
5. 검색과 AI가 서로 관련 없는 상태를 공유한다.
6. `onDateSelect`, `selectedDate`, `datesWithPages` Props가 UI 책임과 맞지 않는다.

개선:

- 우측을 선택형 Context Hub로 전환한다.
- 검색은 `Ctrl+K` Palette로 이동한다.
- AI 탭은 우측 전체 높이를 사용한다.
- Search 결과를 우측에 고정하고 싶을 때만 임시 `Search` 탭을 Pin한다.

### 4.5 AI Assistant

현재 AI는 문서 Context를 끝 2,000자로 자른다. Selection 변경은 문자열 `indexOf`로 찾고 즉시 치환한다.

위험:

- 동일 문장이 두 번 있으면 첫 문장이 바뀔 수 있다.
- AI 응답 후 사용자가 문서를 수정해도 오래된 결과를 적용할 수 있다.
- 근거 문서와 위치가 없다.
- AI Chat, Runtime 설정, Prompt 작성, Editor 변경이 한 컴포넌트에 섞여 있다.
- `main`은 Token마다 React State를 갱신한다. PR #1의 `requestAnimationFrame` 배치를 유지해야 한다.
- `main`의 `keydown`과 `keyup` 두 Handler는 Enter에서 중복 전송 가능성이 있다. PR #1의 `keyup` 제거를 유지한다.

개선:

- Selection은 Stable Anchor 또는 Source Offset+Text Hash를 사용한다.
- 변경 결과는 Proposal로 저장한다.
- `baseRevision` 검증 후 적용한다.
- 근거 페이지·Heading을 함께 보여준다.
- Runtime 상태와 Chat UI의 책임을 Hook/Service로 분리한다.

### 4.6 Settings

PR #1은 Settings를 `일반·편집기·로컬 AI·데이터` 좌측 Navigation과 우측 상세 화면으로 개편했다. 이 구조는 메인 화면 개편의 기준으로 삼는다.

추가할 것은 Settings 검색과 Workspace/Layout 설정이며, 다시 단일 긴 Scroll Modal로 되돌리지 않는다.

## 5. 사용성 문제 우선순위

| 순번 | 문제 | 영향 | 우선순위 | 조치 |
|---:|---|---|---|---|
| 1 | 우측 검색+AI 고정 분할 | AI와 부가기능 확장 불가 | P0 | Context Hub |
| 2 | 800px에서 중앙 폭 288px | 최소 창 실사용 불가 | P0 | Responsive Overlay |
| 3 | AI 즉시 문자열 치환 | 잘못된 원문 변경 | P0 | Proposal+Revision |
| 4 | `App.tsx` 책임 과다 | 기능 추가 시 회귀 | P0 | AppShell/State 분리 |
| 5 | 전체 페이지 본문 Frontend 검색 | 데이터 증가 시 지연 | P1 | SQLite FTS |
| 6 | 검색 Modal과 RightPanel 검색 중복 | UX와 코드 중복 | P1 | Command Palette 통합 |
| 7 | Header 메타데이터 부족 | Task/Calendar/Object 연결이 안 보임 | P1 | Metadata Strip |
| 8 | Sidebar Wide Layout 사문화 | 복잡도만 유지 | P1 | 제거/재정의 |
| 9 | 8~10px 지속 텍스트 | VDI 가독성 저하 | P1 | 12~13px 기준 |
| 10 | Icon-only TopBar 과밀 | 발견성·접근성 저하 | P1 | 고빈도만 유지 |
| 11 | Mini Calendar 상시 점유 | 목록 공간 감소 | P2 | Contextual 표시 |
| 12 | Outline/Backlink/Properties 없음 | 지식화 기능 발견 불가 | P2 | Context Hub 탭 |

## 6. PR #1에서 반드시 가져올 변경

1. `MarkdownEditorHandle.flushUnsaved()`
2. Page/Date/Settings/Export/Close 전 Flush
3. Serialized Save Queue
4. Page Tree Cycle Guard
5. Stream Update `requestAnimationFrame` 배치
6. AI Enter 중복 전송 제거
7. 64/256/512 Token Preset
8. Settings 2-pane UX
9. Managed LiteRT-LM Runtime
10. Data Path 고정 및 VDI Backup 개선

메인 UI 리팩터링은 이 안정화 변경을 기준으로 시작해야 한다.
