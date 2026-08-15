# Memoji 2.0 제품 요구사항과 현재 제품 진실

상태 기준일: 2026-08-16

상세 요구사항: `docs/memoji-ga/04_FUNCTIONAL_REQUIREMENTS.md`

구현 판정: `MEMOJI_2_GA_IMPLEMENTATION_REPORT.md`

## 제품 정의

Memoji는 개인 또는 단일 사용자 VDI 세션에서 Markdown 지식, 일일 기록, 프로젝트,
할 일과 일정을 로컬로 관리하는 Tauri 데스크톱 앱이다. Markdown이 canonical source이고
SQLite의 tag/link/task/FTS/AI index는 재생성 가능한 파생 데이터다. 외부 cloud LLM이나
실시간 협업을 기본 제품 범위로 삼지 않는다.

핵심 경험은 다음 한 문장으로 정의한다.

> 익숙한 3단 문서 작업공간에서 Markdown을 즉시 편집하고, 검색·업무 보기·근거 있는 로컬
> AI 변경 제안을 원본과 revision을 잃지 않고 검토한다.

## 대상 사용자와 환경

- 로컬 우선 개인 지식 작업 사용자
- cloud AI 호출이 금지된 조직 또는 VDI 사용자
- Daily/Project Markdown에서 task와 calendar를 함께 관리하려는 사용자
- 최소 UI viewport 800×600, desktop acceptance viewport 1200×800

Windows 10/11 x64와 조직 VDI가 우선 배포 대상이지만, signed installer와 실제 VDI AI
matrix가 없는 개발 호스트 결과를 Windows GA 증빙으로 간주하지 않는다.

## 제품 원칙

1. Markdown 원본을 숨기거나 vendor format으로 대체하지 않는다.
2. page 전환, view 전환, settings, export, close 전에 unsaved 내용을 flush한다.
3. AI가 원문을 사용자 승인 없이 바꾸지 않는다.
4. 기존 DB는 transaction과 pre-migration backup 없이 변경하지 않는다.
5. 실제 runtime capability와 측정값만 UI·문서에 표시한다.
6. loopback은 cloud 차단 조건이지 runtime authentication의 대체물이 아니다.
7. 코어 app, optional AI runtime, model artifact의 크기와 release status를 분리한다.

## GA 사용자 흐름

### 탐색과 편집

- left view에서 Today, Daily, Projects, Tasks, Calendar, Knowledge를 전환한다.
- page를 열면 center가 editor workspace로 돌아간다.
- Milkdown 즉시 편집과 Markdown source mode 사이에서 원본이 보존된다.
- document bar와 metadata strip에서 문서 위치, 저장 상태, mode와 compact metadata를 본다.
- focus mode에서는 panel/chrome을 숨겨도 editor와 selection AI를 사용할 수 있다.

### 검색과 명령

- `Ctrl+K`에서 command, page, task와 recent item을 찾는다.
- title/body/tag 검색은 SQLite FTS backend를 사용하고 한글 1–2자는 fallback한다.
- top bar, keyboard shortcut, palette는 동일 command registry를 사용한다.

### 지식과 업무

- page 저장 시 tag, wiki link, heading anchor, task, FTS가 갱신된다.
- Context Hub에서 outline, incoming/outgoing/unresolved link, page task를 본다.
- task status·due·priority 변경은 Markdown 원본에 새 revision으로 반영된다.
- calendar는 month/week/day에서 due task와 local event를 함께 보여준다.

### 로컬 AI

- current page/project/link 문맥에서 source를 검색하고 citation을 기록한다.
- rewrite/structure 계열 결과는 proposal로 저장하며 before/after diff를 먼저 보여준다.
- apply 시 base revision을 재확인하고 conflict면 자동 적용하지 않는다.
- 실행은 취소 가능하고 TTFT/token/TPS/runtime mode를 기록한다.
- MTP label은 target, assistant, acceptance rate가 실제 보고될 때만 보인다.

### 데이터 이전

- native file chooser에서 선택한 DB path를 Rust가 read-only로 검증한다.
- import와 migration 전에 DB snapshot을 만들고 hash와 size를 기록한다.
- export ZIP에는 Markdown, consistent DB snapshot, manifest, page/revision hash와 attachment
  목록을 담는다.

## 현재 구현 상태

P0 33개 중 31개가 구현되었다. 다음 두 항목은 GA blocker다.

- Runtime Auth: 승인된 LiteRT-LM server가 authentication을 제공하지 않는다.
- Signed Release: certificate/key와 signed Windows artifact 검증이 없다.

P1은 42개 중 25개 완료, 15개 부분 완료, Windows VDI benchmark 1개 차단, diagnostic
ZIP 1개 미구현이다. 상세 ID별 판정과 증빙은 최종 구현 보고서가 authoritative source다.

## 명시적 비범위

- cloud LLM endpoint
- 실시간 협업과 multi-user DB 동시 편집
- cloud/P2P sync
- 외부 calendar 양방향 sync
- plugin marketplace와 autonomous agent
- Canvas/whiteboard
- OCR, transcript, semantic embedding
- 사용자 승인 없는 AI 원문 수정

Object type/property/relation/saved table/board와 업무 template는 2.1 이후 범위다.

## 품질과 릴리스 수용 기준

- 1200×800에서 3단 shell, 1024/800에서 overlay/center-first 동작
- viewport 전체에서 document horizontal overflow 0
- keyboard focus, Escape, visible focus ring과 modal containment
- 기존 DB logical content/count 보존과 `PRAGMA quick_check=ok`
- 10k 합성 page에서 summary/body 분리와 SQLite FTS 측정
- typecheck, tests, production build, fmt, clippy warnings-denied, Rust tests 통과
- version 일치, dynamic artifact name, checksum, SBOM, NOTICE
- signed Windows artifact와 strict target-VDI runtime/benchmark/EDR/rollback evidence

성능 수치는 host와 fixture를 함께 기록하고 다른 환경의 보장값으로 일반화하지 않는다.
현재 local 측정은 `docs/implementation/performance-report.md`와 `artifacts/benchmark/`에 있다.

## 릴리스 판정 규칙

- P0가 구현되지 않았거나 외부 조건으로 차단되면 전체 GA는 NO-GO다.
- “스크립트가 존재함”과 “target artifact가 검증됨”을 같은 상태로 쓰지 않는다.
- AI가 없어도 editing/search/data core는 작동해야 한다.
- AI 포함 제품명·용량·성능 주장은 exact runtime/model manifest와 target VDI 결과가 있을 때만
  사용한다.
