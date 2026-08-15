# AGENTS.md · Memoji 2.0 GA Implementation Rules

이 파일은 Memoji 2.0 GA 작업의 최상위 규칙이다. 하위 문서나 기존 코드가 충돌할 때 이 규칙을 우선한다.

## 1. 작업 시작 규칙

1. 저장소 상태와 현재 브랜치를 먼저 확인한다.
2. PR #1 `codex/review-settings-vdi-performance`의 최신 Head를 확인한다.
3. PR #1의 신뢰성 개선을 포함한 기준에서 새 작업 브랜치 `codex/memoji-2-ga-uiux`를 만든다.
4. 사용자가 만든 미커밋 변경을 삭제하거나 덮어쓰지 않는다.
5. 대규모 변경 전에 현재 테스트를 실행하고 결과를 기록한다.
6. 실제 VDI, 모델 파일, 서명 인증서가 없어서 확인하지 못한 항목은 “구현 완료”와 “운영 검증 대기”를 분리한다.

권장 명령:

```bash
git status --short
git fetch origin
git fetch origin pull/1/head:memoji-pr1-baseline
git switch -c codex/memoji-2-ga-uiux memoji-pr1-baseline
npm ci
npm run check
cd src-tauri && cargo fmt --check && cargo clippy --all-targets --all-features -- -D warnings && cargo test
```

## 2. 절대 변경하지 않는 제품 원칙

1. `Page.content` 또는 V3의 `PAGE.body_markdown`은 Markdown 원본이다.
2. 태그, 링크, 할 일, Chunk, FTS, Embedding은 파생 데이터다.
3. 기본 제품은 완전 오프라인이다.
4. OpenAI, Anthropic, Gemini 또는 임의 Cloud LLM을 기본 기능으로 추가하지 않는다.
5. AI HTTP Runtime은 `localhost`, `127.0.0.1`, `::1`만 허용한다.
6. 관리 Runtime에는 Memoji가 생성한 인증 토큰을 사용한다.
7. AI가 원문을 직접 덮어쓰지 않는다. 삽입을 제외한 변경은 Proposal과 Diff 승인을 거친다.
8. 기존 DB를 파괴적으로 변경하지 않는다.
9. 모든 Schema Migration 전에 DB 백업을 만든다.
10. PR #1의 저장 Flush와 Queue를 제거하거나 우회하지 않는다.

## 3. UI 원칙

1. 기존 `TopBar + Left Sidebar + Center + Right Panel` 골격을 유지한다.
2. 좌측 기본 폭은 240px, 우측 기본 폭은 304px, 중앙 최소 폭은 560px이다.
3. `react-resizable-panels`를 사용하며 폭을 localStorage 또는 settings에 저장한다.
4. 1100px 미만에서 우측은 Overlay Drawer, 900px 미만에서 좌측도 Overlay Drawer가 된다.
5. 우측 패널은 `AI / Outline / Links / Tasks / Properties` 탭이다.
6. 검색은 우측 고정 공간을 쓰지 않고 `Ctrl+K` Command Palette를 사용한다.
7. 지속 표시되는 제어 텍스트는 11px 미만으로 만들지 않는다. 기본 Sidebar/Control은 12~13px이다.
8. Icon-only 버튼은 Tooltip, `aria-label`, Keyboard Focus를 제공한다.
9. 화면 기능을 Card Grid로 남발하지 않는다. 편집기·목록·패널의 밀도를 유지한다.
10. 설정 화면은 PR #1의 좌측 분류–우측 상세 구조를 유지한다.

## 4. 프런트엔드 구조

`App.tsx`는 Provider와 AppShell 조립만 담당한다. 다음 책임을 한 파일에 다시 몰아넣지 않는다.

```text
src/
├── app/
├── commands/
├── workspace/
├── context/
├── features/
│   ├── pages/
│   ├── tasks/
│   ├── calendar/
│   ├── knowledge/
│   └── ai/
├── editor/
└── shared/
```

상태 타입은 명시적으로 정의한다.

```ts
export type WorkspaceView = 'editor' | 'tasks' | 'calendar' | 'knowledge' | 'search';
export type LeftView = 'today' | 'daily' | 'projects' | 'tasks' | 'calendar' | 'knowledge';
export type ContextHubTab = 'ai' | 'outline' | 'links' | 'tasks' | 'properties' | 'search';
```

컴포넌트가 Tauri command 이름을 문자열로 흩뿌리지 않게 `shared/api/tauriCommands.ts`를 둔다.

## 5. 데이터 규칙

1. SQLite 연결 시 `PRAGMA foreign_keys=ON`, `journal_mode=WAL`, `busy_timeout`을 적용한다.
2. `INSERT OR REPLACE` 대신 `INSERT ... ON CONFLICT DO UPDATE`를 사용한다.
3. 저장 Transaction은 Page UPSERT, Revision INSERT, Index Job INSERT를 함께 처리한다.
4. 삭제는 기본적으로 `deleted_at`을 사용하는 휴지통 방식이다.
5. Revision 복원도 새 Revision으로 기록한다.
6. 파생 인덱스 실패 때문에 Markdown 저장을 롤백하지 않는다. Index Job을 실패 상태로 남겨 재시도한다.
7. FTS를 도입한 뒤 시작 시 모든 페이지 본문을 React로 로드하지 않는다.
8. Import는 전체 DB를 JS number array로 넘기지 않는다. Tauri Dialog가 반환한 파일 경로를 Rust가 직접 읽는다.
9. 모든 외래키와 주요 검색 조건에 Index를 생성한다.
10. Migration은 버전, 이름, Checksum을 기록한다.

## 6. AI 규칙

1. `MTP`는 Target+Assistant model과 Draft 검증이 실제로 확인된 경우에만 표시한다.
2. 단순 OpenAI-compatible local server streaming을 MTP라고 부르지 않는다.
3. Runtime Adapter는 Capability를 반환해야 한다.
4. AI 실행은 Request ID와 Cancellation Token을 가진다.
5. 지표는 Cold/Warm Load, TTFT, Prefill TPS, Decode TPS, Peak RSS를 분리한다.
6. Prompt 문맥을 단순히 뒤에서 자르지 않는다. System, User, Generation Prefix를 보존한다.
7. AI 결과에는 사용한 페이지·Heading 근거를 표시한다.
8. Proposal은 `baseRevision`과 현재 Revision이 다르면 적용하지 않는다.
9. 프롬프트·문서 본문을 일반 로그에 남기지 않는다.
10. 모델과 Runtime 파일의 SHA256, License, NOTICE를 보관한다.

## 7. 테스트 규칙

기능 구현은 실패 테스트를 먼저 추가한다.

필수 검증:

```bash
npm run type-check
npm run test:unit
npm run build

cd src-tauri
cargo fmt --check
cargo clippy --all-targets --all-features -- -D warnings
cargo test
```

프런트 UI 리팩터링 단계에서 Vitest와 React Testing Library를 추가한 경우:

```bash
npm run test
npm run test:ui
```

최소 Viewport:

- 1440×900
- 1200×800
- 1024×768
- 800×600

## 8. 완료 보고

작업이 끝나면 저장소 루트에 `MEMOJI_2_GA_IMPLEMENTATION_REPORT.md`를 만든다.

반드시 포함할 내용:

1. 기준 Commit과 작업 Branch
2. 구현한 Requirement ID
3. 생성·변경·삭제 파일
4. DB Migration 버전
5. 실행한 검증 명령과 결과
6. 성능 수치
7. 확인하지 못한 Windows VDI 항목
8. 남은 위험과 Rollback 방법
9. 스크린샷 경로
10. 다음 권장 작업
