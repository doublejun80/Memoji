# Memoji 2.0 GA 구현 및 검증 보고서

작성일: 2026-08-16, Windows VDI 전환 갱신 2026-08-17 (Asia/Seoul)

> 2026-08-17 구버전 보관, GitHub `main`의 Memoji 2.0 전환, macOS 현행 앱 설치,
> Windows x64 unsigned VDI RC 빌드 기록은
> `docs/implementation/memoji-2-windows-vdi-rc-release.md`를 우선한다. 정식 Windows GA는
> Authenticode 서명과 대상 VDI 검증 전까지 계속 NO-GO다.

> 2026-08-16 후속 코드 리뷰와 추가 개발의 최신 판정은
> `docs/implementation/memoji-ga-hardening-status-2026-08-16.md`를 우선한다. 특히 canonical
> 저장과 파생 index transaction 분리, LiteRT FFI 수명주기, 반복 VDI benchmark, 데이터 경로
> 경고, fail-closed Authenticode gate와 남은 부분 구현이 그 문서에 갱신돼 있다.

구현 브랜치: `codex/memoji-2-ga-uiux`

GitHub 기준선: PR #1, `258ae442a069c15e312687923aebaef48fd3bdda`

요구사항 원본: `docs/memoji-ga/04_FUNCTIONAL_REQUIREMENTS.md`

## 1. 결론

Memoji 2.0의 코드·데이터·UI 업그레이드는 독립 worktree에서 구현되었고, 로컬 호스트에서
프런트엔드 검사, Rust 검사, 마이그레이션, 대규모 합성 데이터, 반응형 화면, 접근성
증빙까지 확보했다. 기존 Markdown 원본, 저장 flush, 로컬 SQLite, 3단 작업공간이라는
제품 정체성은 유지하면서 다음 구조로 전환했다.

- 고정 패널에서 크기 조절·상태 복원·반응형 overlay가 있는 작업공간 shell로 전환
- 중복 검색 UI를 `Ctrl+K` 명령 팔레트와 SQLite FTS 검색으로 통합
- 우측 검색/AI 스택을 AI·목차·링크·할 일·속성 Context Hub로 교체
- 단일 `pages` 저장에서 스키마 v6, revision, tag/link/task/event/AI 파생 인덱스로 확장
- AI 직접 치환을 근거·diff·base revision·명시적 승인 흐름으로 교체
- JS byte array DB 가져오기를 네이티브 경로 기반 검증·백업·transaction 방식으로 교체
- 동적 버전, 체크섬, SBOM 생성, CI gate, provenance와 롤백 절차를 릴리스 파이프라인에 추가
- LiteRT-LM 0.16.0 C API를 Tauri 프로세스에 직접 로드하고 Gemma 4 E2B/E4B를 선택 가능한
  인프로세스 런타임으로 승격

코어 앱과 실제 Gemma 4 E2B 생성 경로는 구현·검증됐다. 기존 Python/HTTP sidecar를 제거해
포트와 외부 요청 표면이 없는 인프로세스 구조로 바뀌었으므로 FR-078(Runtime Auth)은 더
이상 서버 인증 기능에 의존하지 않는다. GitHub Windows runner에서 unsigned
`v2.0.0-rc.4`의 실제 EXE 빌드, SBOM, E2B 토큰 생성과 분할 prerelease 게시까지 통과했다.
그러나 **서명된 Windows VDI GA 출시는 현재 NO-GO**다. FR-090(Signed Release)은 Windows
코드 서명 인증서·키가 없어 검증되지 않았다. 또한 target VDI의 EDR·peak RSS·성능 수용
증빙은 별도 외부 gate다.

## 2. GitHub 기준선과 업그레이드 패키지의 차이

GitHub 기준선은 실제 실행 코드와 PR #1의 저장/VDI 안정화가 중심이었다. 별도 제공된
`Memoji_2_0_GA_Codex_Package`는 실행 코드가 아니라 요구사항, IA, ERD, 아키텍처,
프로토타입, 테스트 체크리스트와 단계별 구현 계획을 포함한 설계 패키지였다. 따라서
패키지를 덮어쓰는 방식이 아니라 다음 대응 관계로 통합했다.

| 영역 | GitHub 기준선 | GA 패키지가 요구한 구조 | 구현 결과 |
|---|---|---|---|
| UI shell | 큰 `App.tsx`, 고정 좌·우 패널 | resizable 3-pane, responsive overlay | `WorkspaceLayout`, `WorkspaceCanvas`, 영속 상태로 분리 |
| 탐색 | 페이지 트리·분리 검색 | 업무별 left view, 통합 command palette | Today/Daily/Projects/Tasks/Calendar/Knowledge와 `Ctrl+K` |
| 우측 패널 | 검색과 AI의 고정 세로 점유 | 탭형 Context Hub | AI/Outline/Links/Tasks/Properties 탭 |
| 문서 | 편집기 중심 | Document/Metadata/Status 계층 | 문서 bar, metadata strip, selection AI, status bar |
| 데이터 | legacy `pages`, JSON tag 중심 | versioned migration, revision, normalized indexes | schema v1→v6, revisions, tags, links, FTS, tasks/events, AI runs |
| AI 변경 | 생성문 삽입 중심 | proposal→diff→승인→revision guard | 영속 proposal, conflict 차단, citation navigation |
| 런타임 | 관리형 LiteRT sidecar | 실제 capability와 MTP 검증 | 0.16.0 C API 인프로세스, E2B/E4B, 취소/metrics/3회 복구 |
| 릴리스 | 하드코딩된 파일명과 느슨한 gate | 동적 버전, SBOM, signing, rollback | CI/scripts/runbook/SBOM 구현, 실제 Windows 서명은 차단 |

패키지의 분석 문서는 `docs/memoji-ga/`, 실행 계획은 `docs/superpowers/`, 기계 판독 요구사항은
`requirements/`, 프로토타입과 체크리스트는 각각 `prototype/`, `checklists/`에 보존했다.
구현 전 결정과 Refero reference lock은
`docs/memoji-ga/16_IMPLEMENTATION_BASELINE_AND_REFERENCE_LOCK.md`에 기록했다.

## 3. 구현 이력

기준선 이후 기능 커밋은 다음 순서로 축적했다. 2026-08-16의 LiteRT-LM 0.16 네이티브
승격과 gap closure는 현재 이 독립 worktree의 검증 대상 변경으로 포함돼 있다.

| Commit | 내용 |
|---|---|
| `581cc7f` | GA 기준선과 격리 worktree 확정 |
| `c5fd13c` | 프런트엔드 컴포넌트 테스트 기반 |
| `b4902b0` | 작업공간 상태 경계 |
| `bc488ec` | resizable·VDI-safe shell |
| `8ea36e2` | command registry와 상단 command bar |
| `ff1b006` | 검색·명령 통합 palette |
| `eb22fa5` | 업무 중심 sidebar |
| `64d3a18` | document workspace와 문맥 chrome |
| `02076aa` | Context Hub |
| `6907e74` | 모듈형 AI 채팅과 취소 |
| `176dfc1` | proposal·diff·승인 흐름 |
| `6dd947d` | SQLite versioned migration |
| `f1c779b` | revisioned page와 lazy body loading |
| `2a60897` | tag/link/anchor/FTS 지식 인덱스 |
| `1aa5ba2` | Markdown-backed task 관리 |
| `06ed32f` | 오프라인 task/event calendar |
| `c5b5ca1` | 검증 capability 기반 AI runtime 모델 |
| `81fecab` | AI run·citation·proposal 영속화 |
| `07a13b4` | LiteRT-LM 0.16 초기 호환성 검토 |
| `577618a` | 당시 증빙 기준의 0.13.1 유지 결정(이후 네이티브 C API 실검증으로 대체) |
| `91eb7ba` | VDI 규모 성능·접근성·code split 보강 |
| `59d3ba0` | 경로 기반 import, export provenance, CI/release gate |
| 현재 변경 | LiteRT-LM 0.16 C API 인프로세스 승격, E2B 실생성/벤치마크, GA gap closure |

기준선부터 마지막 기능 커밋까지 268개 파일, 35,561줄 추가, 2,360줄 삭제가 기록되었다.
대형 Lighthouse HTML/JSON과 설계 패키지 문서도 이 통계에 포함되므로 순수 제품 코드량으로
해석하면 안 된다.

## 4. P0/P1 요구사항 판정

상태 정의:

- **완료**: 코드와 자동 테스트 또는 재현 가능한 증빙이 있다.
- **부분**: 핵심 경로는 있으나 수용 기준의 일부 또는 사용자 노출 UI가 남았다.
- **차단**: 현재 호스트·외부 자격증명·상위 런타임 없이는 검증 또는 구현 완료가 불가능하다.
- **미구현**: 구현 가능한 범위지만 이번 후보에 들어가지 않았다.

### P0 — 32 완료 / 1 차단

| ID | 상태 | 근거 또는 남은 조건 |
|---|---|---|
| FR-001 | 완료 | 1200×800 3단 layout 증빙 |
| FR-002 | 완료 | 좌·우 resize 범위와 rail 테스트 |
| FR-003 | 완료 | 폭·열림 상태 device storage 복원 테스트 |
| FR-004 | 완료 | 1024 right overlay, 800 center-first 증빙 |
| FR-007 | 완료 | AI/Outline/Links/Tasks/Properties Context Hub |
| FR-010 | 완료 | command/shortcut/panel keyboard path와 focus test |
| FR-011 | 완료 | page/task/command/recent 통합 `Ctrl+K` |
| FR-012 | 완료 | top bar, shortcut, palette가 같은 registry 사용 |
| FR-016 | 완료 | Rust SQLite FTS5 backend와 lazy body API |
| FR-021 | 완료 | Milkdown/Crepe와 GFM table 유지, build/test 통과 |
| FR-022 | 완료 | WYSIWYG/source 전환과 Markdown 보존 |
| FR-031 | 완료 | page/revision/job을 canonical transaction으로 저장하고 replaceable index는 commit 뒤 처리 |
| FR-032 | 완료 | revision service, Tauri API, 조회 테스트 |
| FR-034 | 완료 | base revision 불일치 시 conflict 반환 |
| FR-040 | 완료 | migration/import 전 DB backup과 실패 보존 테스트 |
| FR-061 | 완료 | AI가 Context Hub 탭 전체 높이 사용 |
| FR-064 | 완료 | 변경형 AI 결과를 persisted proposal로 저장 |
| FR-065 | 완료 | before/after·source diff dialog 증빙 |
| FR-067 | 완료 | revision drift 시 apply 차단 테스트 |
| FR-070 | 완료 | request별 cancellation token과 UI 취소 |
| FR-073 | 완료 | capability가 없는 MTP/Candle 기능은 표시하지 않음 |
| FR-074 | 완료 | target/assistant/acceptance가 모두 있을 때만 MTP 표시 |
| FR-076 | 완료 | 인프로세스 engine start/status/stop과 conversation 수명주기 관리 |
| FR-077 | 완료 | GA 경로는 listener/endpoint 없음. legacy endpoint는 loopback 외 주소 거부 |
| FR-078 | 완료 | 외부 요청 표면이 없는 C API 직접 호출로 비인가 local HTTP 접근 경로 제거 |
| FR-079 | 완료 | runtime/library/model/engine 상태와 오류를 분리 보고 |
| FR-081 | 완료 | runtime/model/tokenizer hash·size·license manifest |
| FR-086 | 완료 | native dialog path를 Rust가 직접 read-only 검증; 32 MB 제한 제거 |
| FR-089 | 완료 | legacy v1→v6 count/hash/backup/duration evidence |
| FR-090 | **차단** | Windows 인증서·키·실제 signed MSI/NSIS/EXE와 VDI 검증 없음 |
| FR-092 | 완료 | DB/app/local-AI rollback runbook |
| FR-094 | 완료 | typecheck, unit, build, fmt, clippy, cargo test gate |
| FR-095 | 완료 | 본 보고서가 구현·부분·차단·미구현을 구분 |

### P1 — 41 완료 / 1 부분

| ID | 상태 | 근거 또는 남은 범위 |
|---|---|---|
| FR-005 | 완료 | Editor/Tasks/Calendar/Knowledge/Search 중앙 view |
| FR-006 | 완료 | Today/Daily/Projects/Tasks/Calendar/Knowledge 전환 |
| FR-008 | 완료 | 마지막 Context tab을 device storage에 저장 |
| FR-009 | 완료 | focus mode에서 panel/chrome 숨김, editor/selection AI 유지 |
| FR-013 | 완료 | page/project/task/command 독립 group |
| FR-014 | 완료 | `title:`, `tag:`, `type:`, `due:`, `project:`, `is:` query DSL |
| FR-017 | 완료 | FTS title/body snippet에 match marker 표시 |
| FR-018 | 완료 | 빈 query에 최근 page와 command 표시 |
| FR-019 | 완료 | 한글 1–2자 title/tag fallback |
| FR-023 | 완료 | breadcrumb/title/save/mode/menu document bar |
| FR-024 | 완료 | type/project/date/tag/due/status metadata 표시 |
| FR-026 | 완료 | 다듬기/요약/task 추출/번역 selection action |
| FR-028 | 완료 | heading click→editor 이동과 현재 heading highlight |
| FR-030 | 완료 | 저장 상태·수정일·revision 번호 표시 |
| FR-033 | 완료 | 과거 revision restore가 새 revision을 만드는 service/API/test |
| FR-035 | 완료 | soft delete/restore backend와 중앙 휴지통 복원 UI |
| FR-036 | 완료 | normalized `tags`, `node_tags`/page tag relation |
| FR-037 | 완료 | incoming/outgoing/unresolved wiki-link index |
| FR-038 | 완료 | heading/task/text hash anchor |
| FR-039 | 완료 | durable job 기반 증분 색인과 transaction 기반 전체 재색인 command/UI |
| FR-041 | 완료 | Markdown checkbox parser/index |
| FR-042 | 완료 | marker/hash 기반 stable task identity |
| FR-043 | 완료 | task view 변경이 새 revision의 Markdown에 반영 |
| FR-044 | 완료 | Inbox/Today/Upcoming/Overdue/Completed |
| FR-045 | 완료 | priority/start/due/assignee/project Markdown annotation과 task UI |
| FR-047 | 완료 | month/week/day calendar |
| FR-048 | 완료 | due task와 event 통합 조회 |
| FR-062 | 완료 | none/page/project/linked/workspace 명시적 context selector |
| FR-063 | 완료 | summary/organize/task/rewrite/decision/risk/translate action |
| FR-068 | 완료 | page/heading/rank citation 영속·표시 |
| FR-069 | 완료 | source page 전환과 matching heading scroll/focus |
| FR-071 | 완료 | TTFT/token/TPS/runtime mode 기록 |
| FR-072 | 완료 | E2B VDI 기본값과 E4B quality preset 선택/전환 |
| FR-080 | 완료 | native engine 오류 상태와 최대 3회 bounded restart policy |
| FR-082 | 완료 | version lock과 CLI/API/start/stream/restart 검증 harness |
| FR-083 | 완료 | server/model 부재 시 명확한 오류와 optional Candle 경로 |
| FR-084 | **부분** | 실제 E2B cold/warm 네이티브 생성 통과. target Windows VDI/peak RSS/EDR 증빙 필요 |
| FR-085 | 완료 | 본문·prompt·환경변수·자격증명·절대경로 제외 diagnostic ZIP exporter |
| FR-087 | 완료 | Markdown, DB snapshot, version/count/hash/attachment manifest ZIP |
| FR-088 | 완료 | migration/import backup SHA-256와 byte size 기록·표시 |
| FR-091 | 완료 | npm/Cargo/LiteRT/model을 포함한 CycloneDX SBOM 1,073 component 생성 |
| FR-093 | 완료 | workflow/build script가 package/tauri version을 동적으로 사용 |

P2/P3는 GA 패키지 정의대로 후속 범위이며, 이 보고서가 구현을 주장하지 않는다.

## 5. 현재 아키텍처

```text
React/Tauri UI
  ├─ Workspace controller + command registry
  ├─ Left views / Center workspace / Context Hub
  ├─ Milkdown Markdown source editor
  └─ Proposal review + native data controls
            │ Tauri commands
Rust application services
  ├─ Page/revision service ── optimistic transaction
  ├─ FTS/tag/link/anchor index worker
  ├─ Task/event services
  ├─ AI retrieval/proposal/metrics services
  ├─ Path import / snapshot export / diagnostics
  └─ LiteRT-LM 0.16 native engine manager
            │
SQLite schema v6 + local files + in-process C API
  ├─ pages/nodes/page_revisions
  ├─ tags/links/anchors/FTS/tasks/events
  ├─ ai_runs/ai_sources/ai_proposals
  └─ backups/exports/logs
```

Markdown은 계속 canonical source다. page/revision과 durable index job을 먼저 commit하고,
tag/link/task/FTS는 post-commit worker의 별도 transaction에서 교체한다. 파생 처리 실패는
job에 기록되며 원본과 revision을 되돌리지 않는다. AI proposal은 `baseRevision`과 source
anchor를 저장하며, 적용 시 현재 revision을 다시 비교한다. 대규모 workspace에서는 page
summary와 body를 분리해 모든 본문을 React에 올리지 않는다.

## 6. 데이터 마이그레이션·백업·내보내기

스키마는 checksum이 있는 append-only migration v1~v6로 관리된다. legacy `pages`와
`settings` 충돌은 transaction 안에서 보존 테이블로 옮긴 뒤 새 구조로 복사한다. 기존 DB가
있으면 migration 전에 `VACUUM INTO` 백업을 만들고 SHA-256·byte size를 기록한다.

실제 legacy fixture 마이그레이션 결과는 `artifacts/migration/legacy-v1-to-v6.json`에 있다.
v6는 task의 `start_date`와 `assignee`를 append-only로 추가한다.

| 항목 | 결과 |
|---|---:|
| schema | legacy → v6 |
| duration | 4.37 ms |
| `PRAGMA quick_check` | `ok` |
| page count | 1 → 1 |
| tag/link/task count | 0/0/0 → 0/0/0 |
| logical content SHA-256 | 전·후·backup 동일 |
| source / migrated / backup bytes | 20,480 / 217,088 / 20,480 |

DB import는 native file chooser가 넘긴 path를 Rust가 직접 canonicalize하고 read-only로 연다.
SQLite header와 source schema를 확인하기 전에는 live DB를 바꾸지 않으며, 가져오기 직전에
live snapshot을 백업하고 하나의 transaction에서 merge한다. 손상 파일과 non-SQLite 파일,
32 MB 초과 fixture, target 보존 테스트가 있다.

ZIP export는 human-readable Markdown 외에 consistent SQLite snapshot, app/schema version,
page/revision counts, page별 revision과 SHA-256, DB size/hash, attachment manifest를 포함한다.

## 7. 자동 검증

최종 커밋 직전 다음 명령을 새로 실행하는 것을 release evidence로 삼는다.

```bash
npm ci
npm run check
cd src-tauri
cargo fmt --all -- --check
cargo clippy --locked --all-targets --all-features -- -D warnings
cargo test --locked
```

후속 hardening 최종 실행에서 프런트엔드 Vitest 27개 test file, 98 tests와 별도 TypeScript
unit scripts, Rust lib 103 passed와 benchmark bin 1 passed, 0 failed, 3 ignored가 통과했다.
ignored 중 official LiteRT-LM C API/E2B
실모델 test는 다운로드 bundle 경로를 명시해 별도로 실행했고 `Hello!`를 실제 stream하며
1 passed로 끝났다. 나머지 ignored 두 건은 legacy GGUF fixture가 필요한 Candle smoke다.

추가 gate:

- `npm audit --omit=dev`: 0 vulnerabilities
- release YAML parse와 version consistency script
- `git diff --check`
- checksum generation smoke
- `cargo audit`: 이 호스트에 subcommand가 없어 미실행
- cross-platform Node SBOM: 1,073 components 생성, PowerShell wrapper는 동일 generator 호출

## 8. UI/UX 검증

최종 화면 manifest는 `artifacts/ui/final-ui-evidence.json`이며 각 PNG의 SHA-256을 포함한다.
합성 페이지와 메모리 proposal만 사용했고 실제 사용자 데이터는 사용하지 않았다.

| 화면 | 확인 결과 |
|---|---|
| 1440×900 light/dark | 3단 hierarchy, editor primary, AI proposal와 dark toolbar 확인 |
| 1200×800 light | 패키지의 desktop 수용 크기에서 3단 동시 표시 |
| 1024×768 light/dark | right Context Hub overlay, backdrop, theme parity |
| 800×600 light/dark | panel을 닫은 center editor usable, 수평 overflow 0 |
| Command palette | command/page/task 검색 구조와 query hint |
| Tasks/Calendar | 독립 center workspace와 empty state |
| Settings/Data | native import/export 진입점과 storage 설명 |
| AI diff | before/after, citation, 거부/적용 action |

모든 측정 viewport에서 document-level horizontal overflow는 0이었다. 브라우저 console error는
0건이었다. 개발 모드 Milkdown의 Vue ESM feature-flag warning 1건은 production build와
렌더링에 영향을 주지 않았다. Lighthouse desktop snapshot은 Accessibility 100,
Best Practices 100, 접근성 audit 34 passed/0 failed였다.

Refero lock의 neutral canvas, 12–14px compact type, flat panes, 제한적 blue accent,
keyboard-first palette, diff-before-apply 흐름과 비교해 시각적 drift가 없음을 확인했다.
다만 이는 Chromium browser preview이며 native Tauri IPC나 Windows window chrome 검증을
대체하지 않는다.

별도 `tauri.dev.conf.json`으로 production data/identifier와 분리된 `Memoji Dev` native
process도 실행했다. 로그에서 schema v6 migration, official E2B bundle discovery,
`LiteRT-LM 0.16.0 C API 0.1.0 in-process`, CPU/XNNPACK 4 threads, application start를 확인했다.
최종 화면 캡처 시점에는 Mac이 잠겨 자동 UI 접근이 불가능했으므로 새 native screenshot은
증빙으로 주장하지 않는다. 개발 process는 사용자가 잠금 해제해 바로 볼 수 있도록 종료하지
않고 유지했다.

## 9. 성능과 용량

10,000 page, 10,000 task, 1,428 link의 83,369,984-byte 합성 DB에서 측정했다.

| 측정 | p50 | p95 |
|---|---:|---:|
| SQLite open + `SELECT 1` | 0.18 ms | 0.25 ms |
| page summary 200 rows | 6.63 ms | 6.81 ms |
| 한 page body open | <0.01 ms | 0.01 ms |
| sparse Korean FTS top 30 | 2.72 ms | 2.83 ms |
| responsive panel toggle | 49.2 ms | 49.8 ms |

측정 process RSS는 51.17 MiB다. 이는 Apple M4 macOS의 local SQLite/Node 및 Chromium
측정이며 Windows VDI end-to-end 지연이 아니다.

최신 production build의 initial shell entry는 499,800 bytes raw / 155,150 bytes gzip이다.
기준선 약 2,063 KB raw / 644 KB gzip 대비 약 76% 감소했다. Milkdown runtime
909,826 bytes raw / 287,531 bytes gzip은 문서를 열 때 지연 로드된다. 전체 JS asset 합계나
이 수치를 설치 프로그램 크기로 해석하면 안 된다.

**코어 앱 크기와 AI 번들 크기는 분리한다.** unsigned RC4의 `Memoji.exe`는 24,992,768
bytes, Windows LiteRT DLL은 48,424,448 bytes, Gemma 4 E2B 모델은 2,588,147,712 bytes다.
이는 portable 시험판의 구성요소 크기이며 signed MSI/NSIS installer 크기로 해석하지 않는다.

## 10. Local AI와 Windows VDI

기본은 LiteRT-LM 0.16.0 C API 0.1.0 + `gemma4-e2b`다. 선택형 `gemma4-e4b`도 동일한 해시
lock과 UI preset을 가진다. Rust가 공식 동적 라이브러리를 Tauri 프로세스 안에서 로드하므로
Python, child server, HTTP, loopback port가 없다. 기본 실행은 CPU/XNNPACK 4 thread이고,
streaming/cancel/model 전환/최대 3회 복구를 같은 native manager가 담당한다.

실제 2,588,147,712-byte E2B 모델과 68,444,752-byte C API library의 크기와 SHA-256을 검증한
뒤, 실모델 Rust 통합 테스트에서 생성문을 stream했다. 최신 standalone smoke는 fresh engine
load 204 ms, TTFT 552 ms, total 689 ms, warm TTFT 283 ms, total 421 ms를 기록했다. OS file
cache가 warm일 수 있으므로 이 수치를 물리 디스크 cold-start로 해석하지 않는다. 원본 JSON은
`docs/implementation/litert-native-bundle-verification.json`과
`docs/implementation/vdi-benchmark-macos-native-smoke.json`에 있다.

실행 중 `app` process에는 TCP socket이 없었고 LiteRT 기본 server port 9379 listener도
존재하지 않았다. Vite의 `[::1]:1420` listener는 Tauri 개발 UI hot reload 전용이며 배포
runtime의 AI transport가 아니다.

GitHub Windows runner에서는 RC4의 runtime/model 해시, 인프로세스 transport, Python·포트
부재와 실제 생성 smoke를 통과했다. unsigned 분할 배포물은
<https://github.com/doublejun80/Memoji/releases/tag/v2.0.0-rc.4>에 게시했다. target Windows
VDI에서는 포함된 benchmark executable로 thread/prompt/output matrix, peak RSS, EDR,
재시작을 다시 측정해야 한다. 인증서가 제공되면 app/benchmark/DLL을 SignTool로
서명·검증하는 정식 경로는 별도로 유지한다.

## 11. 보안·릴리스·롤백

CI는 프런트엔드 check와 Rust fmt/clippy/test를 통과해야 bundle 단계로 진행한다. tag와
`package.json`, Cargo, Tauri 버전 일치 여부를 검사하고 파일명은 동적 version을 사용한다.
릴리스 자산에는 SHA256SUMS, CycloneDX SBOM, NOTICE를 함께 올리도록 구성했다. 실제
CycloneDX 문서는 npm/Cargo/LiteRT C API/Gemma E2B·E4B를 포함한 1,073 components로
생성했다. Windows scripts는 서명 입력이 없으면 기본 실패하고 명시적 비-GA
`AllowUnsigned`만 예외로 허용한다. CI도 PFX secret으로 app/NSIS를 Authenticode 서명·검증한
뒤에만 업로드한다. unsigned Windows artifact는 생성됐지만 실제 인증서와 서명 artifact가
없으므로 FR-090은 P0 차단으로 판정했다.

소스 기본 동작은 cloud LLM endpoint를 사용하지 않으며 외부 host 저장을 거부한다. DB는
import/migration 전에 backup하고, export snapshot에도 hash와 schema provenance를 남긴다.
GA AI 경로는 network listener가 없어 runtime auth 부재가 노출되는 서버 표면 자체가 없다.
현재 알려진 핵심 릴리스 잔여 위험은 실제 signed Windows artifact와 target VDI/EDR 증빙의
부재다.

복구 절차는 `docs/implementation/rollback-runbook.md`에 있다. 핵심 불변 조건은 앱 종료,
실패 상태 보존, DB/hash/count 기록, 새 schema DB를 이전 binary로 직접 열지 않기,
pre-upgrade DB와 이전 signed bundle을 함께 복원하기다.

## 12. 남은 작업과 릴리스 판정

### GA를 막는 필수 작업

1. Windows signing certificate/secret을 release environment에 제공하고 exact MSI/NSIS/EXE와
   runtime binary의 서명을 검증해 FR-090을 닫는다.
2. target Windows VDI에서 native benchmark matrix와 memory/EDR/cold-warm/restart/rollback을
   실행해 FR-084의 남은 platform 수용 기준을 닫는다.

### 최종 판정

- **코어 앱 구현 후보:** 통과
- **로컬 macOS 코드·네이티브 모델 검증:** 통과
- **기존 DB migration 증빙:** 통과
- **LiteRT-LM 0.16 + Gemma 4 E2B native 경로:** 통과
- **target Windows VDI 수용 증빙:** 부분
- **signed Windows GA 배포:** 차단
- **전체 Memoji 2.0 Windows GA:** **NO-GO — FR-090과 target VDI 수용 gate 후 재판정**

이 판정은 구현 성과를 축소하지 않으면서도, 실행하지 않은 Windows/VDI/서명 결과를 완료로
표현하지 않기 위한 release truth다.
