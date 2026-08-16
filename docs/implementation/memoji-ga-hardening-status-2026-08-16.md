# Memoji 2.0 GA 추가 개발·코드 리뷰·검증 현황

작성일: 2026-08-16 (Asia/Seoul)

대상 worktree: `.worktrees/memoji-2-ga-uiux`

대상 브랜치: `codex/memoji-2-ga-uiux`

이 문서는 `MEMOJI_2_GA_IMPLEMENTATION_REPORT.md` 이후 실시한 코드 리뷰와 추가 개발의
truth source다. 기존 보고서의 기능 설명은 유지하되, 저장 transaction, LiteRT 실행 이력,
진단, Windows 서명 상태와 남은 부분 구현은 이 문서의 판정을 우선한다.

## 1. 현재 결론

- React/Tauri/Rust 코어 구현은 로컬 코드 품질 gate를 통과했다.
- Gemma 4 E2B는 LiteRT-LM 0.16 C API를 통해 현재 코드에서 다시 실생성했다.
- Markdown 원본과 revision은 파생 인덱스 실패와 분리되어 보존된다.
- Windows 배포 스크립트와 CI는 서명 없이 GA 산출물을 만들지 않도록 fail-closed로 바뀌었다.
- Windows 설치 파일은 만들지 않았고, 실제 Authenticode 서명과 target VDI 수용 검증은 아직
  외부 gate다.
- 전체 Windows GA 판정은 여전히 **NO-GO**다. 코드 미구현 때문이 아니라 실제 인증서,
  exact artifact, Windows VDI/EDR/메모리 증빙이 없기 때문이다.

## 2. 이번 추가 개발

### 2.1 Canonical 저장과 파생 데이터 분리

이전 구조는 page/revision과 FTS·tag·link·anchor·task 파생 데이터가 같은 저장 transaction에
있었다. FTS table 또는 파생 parser가 실패하면 Markdown 원본까지 저장되지 않는 문제가 있었다.

현재 구조:

1. `pages`, `nodes`, `page_revisions`와 `index_page:{page}:{revision}` job을 하나의 canonical
   transaction으로 commit한다.
2. commit 뒤 job worker가 tag/link/anchor/FTS/task를 별도 transaction으로 교체한다.
3. 파생 처리 실패는 `jobs.status=failed`, bounded attempts, 최대 500자 오류로 기록한다.
4. 원본 page body와 revision은 성공으로 반환된다.
5. save, revision restore, AI proposal apply, 앱 시작 때 처리 가능한 job을 drain한다.

회귀 테스트는 `page_fts`를 의도적으로 제거한 상태에서 저장한 뒤 body/revision이 남고 job만
실패하는 것을 확인한다.

### 2.2 LiteRT-LM FFI 수명주기

- stream consumer 또는 WebView event 전달이 실패해도 함수가 중간 `?`로 빠져나가지 않고
  공통 cleanup 경로로 이동한다.
- 오류 시 conversation cancel을 요청한다.
- native conversation을 먼저 삭제한 뒤 C callback data를 해제한다.
- stream consumer 실패와 누적 상태 보존을 단위 테스트로 고정했다.
- 공식 E2B bundle을 사용한 ignored 통합 테스트를 현재 코드에서 별도 실행해 `Hello!` 실생성을
  다시 확인했다.

### 2.3 실제 Command Palette Task 검색

- `Ctrl/Cmd+K`가 열릴 때 native `list_tasks({filter: "all"})`를 호출한다.
- Markdown task DTO를 command search snapshot으로 변환한다.
- page/command와 함께 실제 backend task 제목이 표시된다.
- browser/unit adapter가 전달한 task가 있으면 기존 injected snapshot을 우선한다.
- task를 선택하면 Tasks workspace로 이동한다.

### 2.4 AI 실행 계약과 빠른 작업

- 실행 요청에 실제 `runtimeFamily`를 전달하고 AI run history에 `lite_rt`,
  `open_ai_compatible_loopback`, `candle` 중 실제 값을 기록한다.
- 인프로세스 LiteRT는 외부 요청 표면이 없으므로 `authEnforced=true`라고 표시하지 않는다.
  `authApplicable=false`, `externalRequestSurface=false`로 명시한다.
- 현재 문서에서 Markdown task list를 만드는 `작업` 빠른 작업을 추가했다.
- none/page/project/linked/workspace context scope를 AI run 생성 계약에 전달한다.

### 2.5 진단 ZIP과 VDI 벤치마크

진단 ZIP에 다음 privacy-safe 항목을 추가했다.

- runtime version
- load/TTFT/prefill/decode/peak RSS의 사용 가능한 최신 값
- 원문 오류 대신 `runtime_library_missing`, `model_missing`, `unsupported_runtime`,
  `generation_cancelled`, `model_load_failed`, `runtime_error` 구조화 코드

문서 본문, AI prompt/response, 환경 변수, credential, absolute path는 계속 제외한다.

`memoji-vdi-benchmark`는 다음과 같이 바뀌었다.

- `--iterations` 추가, 기본 10회, 허용 범위 1~100회
- 각 row에 iteration 기록
- cold/warm, thread, prompt chars, output tokens 조합별 median/p95 집계
- load, TTFT, total, decode tokens/s 집계
- current LiteRT C API가 prompt token count를 제공하지 않는다는 한계 명시
- peak RSS와 EDR/page-fault는 Windows host 측정이 필요하다는 한계 명시

### 2.6 VDI 데이터 경로와 로그 privacy

- `get_data_path_status` command가 DB 경로, 경로 출처, 쓰기 가능 여부, 영속성 경고를 반환한다.
- 경로 출처는 `policy_env`, `portable`, `os_local_fallback`으로 구분한다.
- OS-local fallback이면 비영구 VDI에서 로그아웃 후 데이터가 삭제될 수 있음을 Settings에
  명시하고 `MEMOJI_DATA_PATH` 사용을 안내한다.
- TagInput의 사용자 tag 값 debug log를 제거했다.
- 정상 startup/migration log에서 data/database/resource/model/backup absolute path를 제거했다.

### 2.7 Task 메타데이터 검증

- `YYYY-MM-DD` 모양만 보던 검증을 `chrono::NaiveDate`의 실제 달력 날짜 검증으로 교체했다.
- `2026-02-30` 같은 날짜를 거부한다.
- assignee는 80자 이하이며 control character, `(`, `)`를 포함할 수 없다.
- newline과 annotation 종료 문자를 이용한 Markdown task 주입을 patch 전에 거부한다.
- priority는 1~3만 허용한다.

### 2.8 Tauri command 계약 중앙화

- frontend production invoke 이름 51개를 `src/shared/api/tauriCommands.ts` 한 곳에 모았다.
- AI/page/search/task/calendar/proposal/settings/legacy storage adapter가 이 registry를 사용한다.
- registry 값 중복과 주요 GA command 포함 여부를 자동 테스트한다.
- production source에 직접 작성된 `invoke("command_name")` 문자열이 남지 않았음을 확인했다.

### 2.9 Windows 서명 gate

로컬 PowerShell:

- `build-windows-x64.ps1`, `build-windows-avx512.ps1`, `build-windows-vdi.ps1`는 기본적으로
  `SignToolPath`와 `CertificateThumbprint`가 없으면 시작 전에 실패한다.
- 비-GA 테스트 산출물만 명시적 `-AllowUnsigned`로 허용한다.
- 앱/NSIS/VDI benchmark/LiteRT DLL의 해당 산출물을 서명하고 `signtool verify /pa /all`을
  통과해야 다음 단계로 진행한다.
- checksum은 서명된 최종 byte 뒤에 생성한다.

GitHub Actions:

- `WINDOWS_CERTIFICATE_BASE64`, `WINDOWS_CERTIFICATE_PASSWORD` secret이 없으면 실패한다.
- 앱과 NSIS setup을 Authenticode 서명하고 verify한 뒤에만 provenance/checksum/upload를 한다.
- NSIS setup이 생성되지 않아도 실패한다.

## 3. 전체 구현 상태

| 영역 | 현재 상태 | 판정 근거 |
|---|---|---|
| 3-pane/responsive workspace | 완료(로컬) | resizable shell, overlay, focus mode, persisted UI state |
| 업무 workspace | 완료(로컬) | editor/tasks/calendar/knowledge/search center views |
| Context Hub | 완료(로컬) | AI/outline/links/tasks/properties |
| Command Palette | 완료(로컬) | command/page/project/backend task 검색 |
| Markdown 저장/revision/conflict | 완료(로컬) | optimistic revision과 canonical transaction |
| 파생 index 안정성 | 완료(로컬) | durable job + post-commit worker + failure regression |
| FTS/tag/link/anchor | 완료(로컬) | incremental replacement와 full reindex |
| Markdown Task | 완료(로컬) | stable marker, task view update, 날짜/담당자 validation |
| Calendar | 완료(로컬) | event와 due task 통합, ICS |
| AI proposal 안전성 | 완료(로컬) | persisted proposal, diff, revision/anchor conflict |
| AI context/retrieval | 완료(로컬) | explicit scope와 ranked source persistence |
| LiteRT E2B native | 완료(macOS 검증) | current-code real model stream 1 passed |
| LiteRT E4B native | 부분 | preset/discovery/manifest는 있으나 E4B 실모델 실행 증빙 없음 |
| Candle fallback | 부분 | code path는 있으나 현재 배포용 GGUF/tokenizer bundle과 smoke evidence 없음 |
| 진단 ZIP | 완료(로컬) | privacy exclusion + sanitized metrics/error code test |
| VDI benchmark harness | 완료(도구) | 반복/median/p95 JSON 생성 가능 |
| target Windows VDI 성능 | 외부 차단 | exact VDI pool에서 실행하지 않음 |
| Windows Authenticode pipeline | 완료(코드) | local/CI fail-closed와 verify 구현 |
| signed Windows artifact | 외부 차단 | 인증서 secret과 실제 artifact 없음 |
| standard Windows installer의 AI bundle | 부분 | 일반 installer는 native AI bundle을 포함하지 않으며 VDI offline bundle이 별도 경로 |
| SBOM/checksum/rollback | 완료(로컬 도구) | generator, manifest, runbook 존재 |
| native Tauri 개발 실행 | 실행 중 | `target/debug/app`, Vite `[::1]:1420` HTTP 200 |

## 4. 남은 부분 구현과 개선 가능성

### A. 로컬 코드로 추가 구현 가능

| 우선순위 | 개선 항목 | 가능 여부 | 권장 방식 |
|---|---|---|---|
| P1 | failed job 자동 재시도/운영 가시성 | 가능 | 주기적 bounded drain, Settings job count/재시도 button, dead-letter 상태 |
| P1 | Palette에서 선택한 task 직접 focus | 가능 | selected task id를 Tasks workspace로 전달하고 `all` filter/scroll/focus 적용 |
| P1 | query DSL을 전부 backend metadata search로 통합 | 가능 | Rust request AST와 FTS/task query planner로 client snapshot 의존 제거 |
| P1 | selection을 독립 AI context scope로 승격 | 가능 | editor selection store를 AI request/context source에 직접 연결 |
| P1 | managed engine stop/restart UI | 가능 | explicit Tauri stop/restart command와 active request guard 추가 |
| P1 | large controller 분리 | 가능 | `App.tsx`, `SettingsModal.tsx`, Rust `lib.rs`를 command/service/controller 단위로 단계적 분리 |
| P1 | Windows workflow PowerShell 실행 테스트 | 가능(Windows) | Pester 또는 parser step을 Windows CI quality gate에 추가 |
| P2 | benchmark process memory 자동 수집 | 플랫폼별 가능 | Windows Job Object/PerformanceCounter, macOS task_info adapter |

현재 job worker는 앱 시작과 save/restore/proposal 시점에 drain된다. 별도 background scheduler나
dead-letter UI는 아직 없다. 저장 안정성은 확보됐지만 장시간 실행 중 외부 원인으로 3회 실패한
job의 자동 복구 UX는 후속 개선 대상이다.

### B. 자산 또는 배포 정책 결정이 필요한 구현

| 항목 | 필요한 결정/자산 |
|---|---|
| 일반 Windows installer AI 포함 여부 | 수 GB model을 installer에 포함할지 별도 offline bundle로 유지할지 배포 채널 결정 |
| Candle fallback 실운영 | 검증된 GGUF/tokenizer, license, checksum, 용량 정책 |
| E4B 실검증 | E4B official model bundle과 목표 RAM pool |
| updater signing | Tauri updater key와 Authenticode certificate의 별도 운영/회전 정책 |

### C. 외부 환경 없이는 완료 판정 불가

- Windows code-signing certificate와 protected secret
- exact signed EXE/NSIS/VDI bundle
- target Windows VDI CPU/RAM/storage/profile 정책
- EDR/백신 allowlist와 실행 지연
- cold boot, warm run, peak RSS, page fault, 10회 이상 median/p95
- 강제 종료/재시작, 데이터 영속성, rollback rehearsal

## 5. 이번 검증 결과

| 명령/검증 | 결과 |
|---|---|
| `npm run check` | 통과: typecheck, TS scripts, Vitest 27 files/98 tests, production build |
| `cargo fmt --all -- --check` | 통과 |
| `cargo clippy --locked --all-targets --all-features -- -D warnings` | 통과 |
| `cargo test --locked` | 통과: Rust lib 103 passed/3 ignored, benchmark bin 1 passed |
| official E2B ignored integration test 별도 실행 | 통과: 1 passed, 실제 `Hello!` stream |
| `npm audit --omit=dev` | 0 vulnerabilities |
| `git diff --check` | 통과 |
| Windows signing static contract tests | 통과: scripts 3개 + CI workflow |
| PowerShell parser | 미실행: 현재 macOS host에 `pwsh` 없음 |
| `cargo audit` | 미실행: 현재 host에 `cargo-audit` 없음 |
| Windows build/sign/install | 의도적으로 미실행 |
| Tauri dev server | 실행 중: Vite `[::1]:1420` HTTP 200, native app process active |

full Rust test의 ignored 3개 중 E2B LiteRT native test는 별도 실행해 통과했다. 남은 ignored 2개는
다운로드한 Candle GGUF/tokenizer fixture가 필요한 legacy fallback test다.

## 6. 코드 리뷰 최종 판정

현재 변경에서 새 P0 correctness defect는 발견되지 않았다. 저장 실패 전파, callback data
수명, task annotation 주입, runtime history 오표기, native auth 오표기, unsigned release 허용은
이번 추가 개발에서 수정됐다.

다만 다음 사항은 release truth에 계속 반영해야 한다.

1. macOS E2B 실생성은 Windows VDI 성능·호환성 증빙이 아니다.
2. 서명 코드가 존재하는 것은 signed artifact가 존재한다는 뜻이 아니다.
3. benchmark harness가 peak RSS/EDR를 자동으로 증명하지 않는다.
4. 일반 Windows installer와 VDI offline AI bundle은 현재 서로 다른 배포 경로다.
5. 대형 controller 분리는 유지보수 개선이며, 현재 기능 gate를 통과했다는 이유로 완료 처리하지
   않는다.

따라서 현재 판정은 다음과 같다.

- **코어 기능 후보:** GO
- **macOS native LiteRT E2B 코드 경로:** GO
- **Windows 배포 파이프라인 코드:** GO, 실제 secret/runner 검증 대기
- **signed Windows artifact:** NO-GO
- **target Windows VDI acceptance:** NO-GO
- **Memoji 2.0 Windows GA 전체:** NO-GO

## 7. 변경 관리 메모

- 기존 GA worktree에 이미 다수의 미커밋 변경이 있어 이번 작업은 commit을 만들지 않았다.
- unrelated 변경을 reset하거나 덮어쓰지 않았다.
- Windows artifact는 생성하지 않았다.
- 개발용 Tauri process는 사용자가 현재 화면을 볼 수 있도록 종료하지 않았다.
