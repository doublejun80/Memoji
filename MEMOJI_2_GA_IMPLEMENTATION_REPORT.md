# Memoji 2.0 GA 구현 및 검증 보고서

작성일: 2026-08-16 (Asia/Seoul)

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
- 단일 `pages` 저장에서 스키마 v5, revision, tag/link/task/event/AI 파생 인덱스로 확장
- AI 직접 치환을 근거·diff·base revision·명시적 승인 흐름으로 교체
- JS byte array DB 가져오기를 네이티브 경로 기반 검증·백업·transaction 방식으로 교체
- 동적 버전, 체크섬, SBOM 생성, CI gate, provenance와 롤백 절차를 릴리스 파이프라인에 추가

그러나 **서명된 Windows VDI GA 출시는 현재 NO-GO**다. P0인 FR-078(Runtime Auth)은
현재 승인된 LiteRT-LM 0.13.1과 검토 후보 0.16.0 모두 서버 인증 옵션을 제공하지 않아
충족할 수 없고, FR-090(Signed Release)은 Windows 코드 서명 인증서·키와 실제 Windows
릴리스 실행 환경이 없어 검증되지 않았다. 코어 앱 코드는 조건부 GA 후보이지만 이 두
항목을 해결하기 전에는 “인증·서명된 Windows VDI GA”라고 배포하면 안 된다.

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
| 데이터 | legacy `pages`, JSON tag 중심 | versioned migration, revision, normalized indexes | schema v1→v5, revisions, tags, links, FTS, tasks/events, AI runs |
| AI 변경 | 생성문 삽입 중심 | proposal→diff→승인→revision guard | 영속 proposal, conflict 차단, citation navigation |
| 런타임 | 관리형 LiteRT 기반 | 실제 capability와 MTP 검증 | capability 기반 UI, 취소/metrics, 0.13.1 기본 유지 |
| 릴리스 | 하드코딩된 파일명과 느슨한 gate | 동적 버전, SBOM, signing, rollback | CI/workflow/scripts/runbook 구현, 실제 서명은 차단 |

패키지의 분석 문서는 `docs/memoji-ga/`, 실행 계획은 `docs/superpowers/`, 기계 판독 요구사항은
`requirements/`, 프로토타입과 체크리스트는 각각 `prototype/`, `checklists/`에 보존했다.
구현 전 결정과 Refero reference lock은
`docs/memoji-ga/16_IMPLEMENTATION_BASELINE_AND_REFERENCE_LOCK.md`에 기록했다.

## 3. 구현 이력

기준선 이후 기능 커밋은 다음 순서로 축적했다. 마지막 문서·증빙 커밋은 이 보고서를
포함해 `docs: finalize Memoji 2.0 GA implementation evidence` 메시지로 남긴다.

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
| `07a13b4` | LiteRT-LM 0.16 호환성 검토 |
| `577618a` | 검증된 0.13.1 GA 기본값 유지 결정 병합 |
| `91eb7ba` | VDI 규모 성능·접근성·code split 보강 |
| `59d3ba0` | 경로 기반 import, export provenance, CI/release gate |

기준선부터 마지막 기능 커밋까지 268개 파일, 35,561줄 추가, 2,360줄 삭제가 기록되었다.
대형 Lighthouse HTML/JSON과 설계 패키지 문서도 이 통계에 포함되므로 순수 제품 코드량으로
해석하면 안 된다.

## 4. P0/P1 요구사항 판정

상태 정의:

- **완료**: 코드와 자동 테스트 또는 재현 가능한 증빙이 있다.
- **부분**: 핵심 경로는 있으나 수용 기준의 일부 또는 사용자 노출 UI가 남았다.
- **차단**: 현재 호스트·외부 자격증명·상위 런타임 없이는 검증 또는 구현 완료가 불가능하다.
- **미구현**: 구현 가능한 범위지만 이번 후보에 들어가지 않았다.

### P0 — 31 완료 / 2 차단

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
| FR-031 | 완료 | page/revision/index가 하나의 transaction에서 저장 |
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
| FR-076 | 완료 | child process discover/start/status/stop 관리 |
| FR-077 | 완료 | localhost, `127.0.0.0/8`, `::1` 외 endpoint 거부 |
| FR-078 | **차단** | LiteRT-LM 0.13.1/0.16.0에 server auth flag 없음. 임의 local process 차단 불가 |
| FR-079 | 완료 | process/endpoint/model 상태를 분리 보고 |
| FR-081 | 완료 | runtime/model/tokenizer hash·size·license manifest |
| FR-086 | 완료 | native dialog path를 Rust가 직접 read-only 검증; 32 MB 제한 제거 |
| FR-089 | 완료 | legacy v1→v5 count/hash/backup/duration evidence |
| FR-090 | **차단** | Windows 인증서·키·실제 signed MSI/NSIS/EXE와 VDI 검증 없음 |
| FR-092 | 완료 | DB/app/local-AI rollback runbook |
| FR-094 | 완료 | typecheck, unit, build, fmt, clippy, cargo test gate |
| FR-095 | 완료 | 본 보고서가 구현·부분·차단·미구현을 구분 |

### P1 — 25 완료 / 15 부분 / 1 차단 / 1 미구현

| ID | 상태 | 근거 또는 남은 범위 |
|---|---|---|
| FR-005 | 부분 | Editor/Tasks/Calendar는 중앙 view, Knowledge/Search는 sidebar/palette 경로만 있음 |
| FR-006 | 완료 | Today/Daily/Projects/Tasks/Calendar/Knowledge 전환 |
| FR-008 | 완료 | 마지막 Context tab을 device storage에 저장 |
| FR-009 | 완료 | focus mode에서 panel/chrome 숨김, editor/selection AI 유지 |
| FR-013 | 부분 | page/task/command group은 있음. project 독립 group 없음 |
| FR-014 | 부분 | `title:`, `tag:` 지원. `type:`, `due:`, `project:`, `is:` 미지원 |
| FR-017 | 완료 | FTS title/body snippet에 match marker 표시 |
| FR-018 | 완료 | 빈 query에 최근 page와 command 표시 |
| FR-019 | 완료 | 한글 1–2자 title/tag fallback |
| FR-023 | 완료 | breadcrumb/title/save/mode/menu document bar |
| FR-024 | 부분 | type/project/date/tag 표시. due/status metadata 미연결 |
| FR-026 | 부분 | 다듬기/요약/task 추출 지원. 번역 미지원 |
| FR-028 | 부분 | heading 추출과 click event는 있음. editor scroll 동기화·현재 heading highlight 미연결 |
| FR-030 | 부분 | 저장 상태·수정일은 있음. revision 번호 표시 없음 |
| FR-033 | 완료 | 과거 revision restore가 새 revision을 만드는 service/API/test |
| FR-035 | 부분 | soft delete/restore backend는 있음. 휴지통 복원 UI 없음 |
| FR-036 | 완료 | normalized `tags`, `node_tags`/page tag relation |
| FR-037 | 완료 | incoming/outgoing/unresolved wiki-link index |
| FR-038 | 완료 | heading/task/text hash anchor |
| FR-039 | 부분 | 저장 시 해당 page 파생 index 재생성. 전체 reindex command 없음 |
| FR-041 | 완료 | Markdown checkbox parser/index |
| FR-042 | 완료 | marker/hash 기반 stable task identity |
| FR-043 | 완료 | task view 변경이 새 revision의 Markdown에 반영 |
| FR-044 | 완료 | Inbox/Today/Upcoming/Overdue/Completed |
| FR-045 | 부분 | priority/due/project 지원. start/assignee 미지원 |
| FR-047 | 완료 | month/week/day calendar |
| FR-048 | 완료 | due task와 event 통합 조회 |
| FR-062 | 부분 | selection/current page/project/linked retrieval은 있음. 명시적 selector UI 없음 |
| FR-063 | 부분 | summary/organize/task/rewrite 지원. decision/risk/translate 미지원 |
| FR-068 | 완료 | page/heading/rank citation 영속·표시 |
| FR-069 | 완료 | source page 전환과 matching heading scroll/focus |
| FR-071 | 완료 | TTFT/token/TPS/runtime mode 기록 |
| FR-072 | 부분 | 검증된 E2B LiteRT 선택과 optional legacy runtime만 있음. E4B preset 없음 |
| FR-080 | 부분 | 비정상 child 감지 후 다음 status/start에서 복구. 최대 재시작 횟수 정책 없음 |
| FR-082 | 완료 | version lock과 CLI/API/start/stream/restart 검증 harness |
| FR-083 | 완료 | server/model 부재 시 명확한 오류와 optional Candle 경로 |
| FR-084 | **차단** | macOS arm64에서 harness만 검증. target Windows VDI/model/EDR 없음 |
| FR-085 | **미구현** | 설정 진단 표시는 있으나 본문 제외 diagnostic ZIP exporter 없음 |
| FR-087 | 완료 | Markdown, DB snapshot, version/count/hash/attachment manifest ZIP |
| FR-088 | 완료 | migration/import backup SHA-256와 byte size 기록·표시 |
| FR-091 | 부분 | SBOM generator와 release upload 구현. Windows release artifact 실행 증빙 없음 |
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
  └─ Path import / snapshot export / runtime manager
            │
SQLite schema v5 + local files
  ├─ pages/nodes/page_revisions
  ├─ tags/links/anchors/FTS/tasks/events
  ├─ ai_runs/ai_sources/ai_proposals
  └─ backups/exports/logs
```

Markdown은 계속 canonical source다. tag/link/task/FTS는 page save transaction에서 교체 가능한
파생 데이터로 갱신된다. AI proposal은 `baseRevision`과 source anchor를 저장하며, 적용 시
현재 revision을 다시 비교한다. 대규모 workspace에서는 page summary와 body를 분리해
모든 본문을 React에 올리지 않는다.

## 6. 데이터 마이그레이션·백업·내보내기

스키마는 checksum이 있는 append-only migration v1~v5로 관리된다. legacy `pages`와
`settings` 충돌은 transaction 안에서 보존 테이블로 옮긴 뒤 새 구조로 복사한다. 기존 DB가
있으면 migration 전에 `VACUUM INTO` 백업을 만들고 SHA-256·byte size를 기록한다.

실제 legacy fixture 마이그레이션 결과는 `artifacts/migration/legacy-v1-to-v5.json`에 있다.

| 항목 | 결과 |
|---|---:|
| schema | legacy → v5 |
| duration | 2.03 ms |
| `PRAGMA quick_check` | `ok` |
| page count | 1 → 1 |
| tag/link/task count | 0/0/0 → 0/0/0 |
| logical content SHA-256 | 전·후·backup 동일 |
| source / migrated / backup bytes | 20,480 / 208,896 / 20,480 |

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

최종 실행에서 프런트엔드 19개 test file, 76 tests와 Rust 89 passed, 0 failed,
2 ignored가 통과했다. ignored 두 건은 실제 다운로드 모델이 필요한 생성 smoke test이며
일반 unit gate에서 의도적으로 제외한다.

추가 gate:

- `npm audit --omit=dev`: 0 vulnerabilities
- release YAML parse와 version consistency script
- `git diff --check`
- checksum generation smoke
- `cargo audit`: 이 호스트에 subcommand가 없어 미실행
- PowerShell SBOM script: macOS에 `pwsh`가 없어 Windows release job에서만 실행 가능

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

최신 production build의 initial shell entry는 491,198 bytes raw / 152,794 bytes gzip이다.
기준선 약 2,063 KB raw / 644 KB gzip 대비 약 76% 감소했다. Milkdown runtime
909,826 bytes raw / 287,531 bytes gzip은 문서를 열 때 지연 로드된다. 전체 JS asset 합계나
이 수치를 설치 프로그램 크기로 해석하면 안 된다.

**코어 앱 크기와 AI 번들 크기는 분리한다.** 이 호스트에서는 signed installer를 만들지
않았으므로 MSI/NSIS/EXE 크기를 주장하지 않는다. LiteRT runtime과 Gemma model은 별도
검증·서명해야 하는 multi-gigabyte 배포 자산이며, 실제 선택 모델을 준비한 Windows build의
manifest byte count가 유일한 릴리스 크기 근거다.

## 10. Local AI와 Windows VDI

기본은 LiteRT-LM 0.13.1 + `gemma4-e2b`다. 0.16.0의 공식 wheel·asset 계약과 SHA-256을
검토했지만 Windows VDI 실행 matrix가 없으므로 default를 바꾸지 않았다. 런타임은 loopback만
허용하고 session port를 고르며 child process 상태, model 존재, endpoint reachability를 분리해
보고한다.

현재 호스트에는 `litert-lm` 실행 파일과 model이 없다. 따라서
`artifacts/benchmark/litert-runtime-host.json`과 `local-ai-host.json`은 결과를 꾸미지 않고
각각 `ENOENT`, `fetch failed`, `status: blocked`를 기록한다. cold/warm, 256/1024 prompt,
64/256 output, thread 조합, restart, Korean UTF-8, memory, EDR은 target Windows VDI에서
반드시 다시 실행해야 한다.

0.13.1과 0.16.0 모두 확인된 server auth flag가 없다. 무작위 token은 향후 runtime이 auth를
지원한다고 명시할 때만 전달되며 현재 `authEnforced`는 false다. loopback과 random port는 공격
표면을 줄이지만 같은 사용자 세션의 임의 local process를 인증 차단하는 수용 기준과 같지 않다.

## 11. 보안·릴리스·롤백

CI는 프런트엔드 check와 Rust fmt/clippy/test를 통과해야 bundle 단계로 진행한다. tag와
`package.json`, Cargo, Tauri 버전 일치 여부를 검사하고 파일명은 동적 version을 사용한다.
릴리스 자산에는 SHA256SUMS, CycloneDX SBOM, NOTICE를 함께 올리도록 구성했다. workflow는
Tauri artifact-signing 변수와 Apple signing/notarization 변수를 받을 수 있지만 Windows
Authenticode certificate import·서명·검증 단계는 아직 완성되지 않았다. 따라서 signing은
구현 완료가 아니라 P0 차단으로 판정했다.

소스 기본 동작은 cloud LLM endpoint를 사용하지 않으며 외부 host 저장을 거부한다. DB는
import/migration 전에 backup하고, export snapshot에도 hash와 schema provenance를 남긴다.
현재 알려진 핵심 보안 잔여 위험은 runtime auth 부재와 실제 signed artifact 부재다.

복구 절차는 `docs/implementation/rollback-runbook.md`에 있다. 핵심 불변 조건은 앱 종료,
실패 상태 보존, DB/hash/count 기록, 새 schema DB를 이전 binary로 직접 열지 않기,
pre-upgrade DB와 이전 signed bundle을 함께 복원하기다.

## 12. 남은 작업과 릴리스 판정

### GA를 막는 필수 작업

1. 인증을 실제 강제하는 LiteRT server 버전 또는 인증 proxy+격리 backend 구조를 선택하고,
   동일 세션의 비인가 local process 요청이 실패하는 시험으로 FR-078을 닫는다.
2. Windows signing certificate/secret을 release environment에 제공하고 exact MSI/NSIS/EXE와
   runtime binary의 서명을 검증해 FR-090을 닫는다.
3. target Windows VDI에서 `verify-litert-runtime.mjs --strict`와 AI benchmark matrix,
   memory/EDR/cold-warm/restart/rollback을 실행해 FR-084과 0.16 승격 여부를 판정한다.

### P1 잔여 작업

- Knowledge/Search 독립 center view, project search group, 전체 query DSL
- due/status/revision metadata, outline scroll sync, trash/revision 사용자 UI, full reindex
- task start/assignee, explicit AI context selector, decision/risk/translate, E4B preset
- bounded runtime restart policy, 본문 제외 diagnostic ZIP
- Windows job에서 실제 SBOM artifact 생성·내용 검증

### 최종 판정

- **코어 앱 구현 후보:** 조건부 통과
- **로컬 macOS 코드·브라우저 검증:** 통과
- **기존 DB migration 증빙:** 통과
- **Windows VDI Local AI:** 차단
- **signed Windows GA 배포:** 차단
- **전체 Memoji 2.0 GA:** **NO-GO — FR-078, FR-090 해소 후 재판정**

이 판정은 구현 성과를 축소하지 않으면서도, 실행하지 않은 Windows/VDI/서명 결과를 완료로
표현하지 않기 위한 release truth다.
