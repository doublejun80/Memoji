# Memoji 2.0 GA handoff

갱신일: 2026-08-16

브랜치: `codex/memoji-2-ga-uiux`

기준선: PR #1 `258ae442a069c15e312687923aebaef48fd3bdda`

## 지금 상태

GA 패키지의 구조를 실제 GitHub 기준선 위에 구현했다. 최종 판단과 전체 requirement matrix는
[MEMOJI_2_GA_IMPLEMENTATION_REPORT.md](MEMOJI_2_GA_IMPLEMENTATION_REPORT.md)가 authoritative
source다. 이전 2026-05 handoff의 “Candle-only”, “외부 runtime 금지”, “portable.txt”, 고정
2.0.0 filename과 완료되지 않은 VDI 주장들은 더 이상 현재 상태가 아니다.

- 코어 app 구현 후보: 조건부 통과
- local TypeScript/Rust/build/migration/browser QA: 통과 예정 최종 gate 재실행
- signed Windows VDI GA: NO-GO
- P0 blocker: managed LiteRT runtime auth, signed Windows release
- P1 external blocker: target Windows VDI AI benchmark/EDR matrix
- P1 미구현: body-free diagnostic ZIP

## 작업 위치와 보존 조건

구현 worktree:

```text
/Volumes/mac_dock/github/Memoji/.worktrees/memoji-2-ga-uiux
```

원래 `main` checkout에는 사용자 소유의 uncommitted 변경과 원본
`Memoji_2_0_GA_Codex_Package/`가 있으므로 reset, checkout overwrite, clean을 실행하지 않는다.
현재 branch를 병합·PR·보존하는 방법은 사용자 선택 전까지 바꾸지 않는다.

## 주요 변경 경계

### Frontend

- `src/app/`: workspace reducer, 상태 persistence, keyboard binding
- `src/workspace/`: resizable shell, top command bar, sidebar, center canvas, status bar
- `src/commands/`: shared command registry, search parser, command palette
- `src/editor/`: document bar, metadata, selection AI, editor workspace
- `src/context/`: AI/Outline/Links/Tasks/Properties Context Hub
- `src/features/tasks/`, `src/features/calendar/`: Markdown task와 offline event workspace
- `src/features/ai/`: streaming, cancellation, citation, proposal, diff review
- `src/shared/api/`: Tauri API boundary와 browser preview fallback

### Rust/SQLite

- `src-tauri/src/db/`: checksum migration v1~v5, repositories, backup
- `src-tauri/src/services/page_service.rs`: transactional save, revision/conflict/trash/restore
- `src-tauri/src/indexing/`, `search/`: tag/link/anchor/task/FTS 파생 index
- `src-tauri/src/tasks/`, `calendar/`: source-backed task/event service
- `src-tauri/src/ai/`: retrieval, sources, runs, proposals, metrics, runtime abstraction
- `src-tauri/src/local_ai/`: LiteRT process/status와 optional Candle path
- `src-tauri/src/lib.rs`, `database.rs`: path import, DB snapshot export, Tauri commands

### Release/evidence

- `.github/workflows/ci.yml`, `release.yml`, `windows-dist.yml`
- `scripts/generate-checksums.mjs`, `generate-sbom.ps1`, `verify-release-version.mjs`
- `scripts/verify-litert-runtime.mjs`, `benchmark-local-ai.mjs`
- `docs/implementation/rollback-runbook.md`
- `artifacts/benchmark/`, `artifacts/migration/`, `artifacts/ui/`

## 정확한 검증 명령

```bash
cd /Volumes/mac_dock/github/Memoji/.worktrees/memoji-2-ga-uiux
npm ci
npm run check
npm audit --omit=dev
node scripts/verify-release-version.mjs
git diff --check

cd src-tauri
cargo fmt --all -- --check
cargo clippy --locked --all-targets --all-features -- -D warnings
cargo test --locked
```

legacy migration evidence 재생성:

```bash
cd src-tauri
MEMOJI_MIGRATION_EVIDENCE=../artifacts/migration/legacy-v1-to-v5.json \
  cargo test db::connection::tests::migrates_legacy_file_with_backup_and_content_evidence \
  -- --nocapture
```

대규모 합성 DB:

```bash
node scripts/generate-large-workspace-fixture.mjs \
  --output /tmp/memoji-large-workspace.db
node scripts/measure-search.mjs \
  --db /tmp/memoji-large-workspace.db \
  --output artifacts/benchmark/large-workspace-performance.json
```

## 최종 증빙 위치

- 구현·요구사항 판정: `MEMOJI_2_GA_IMPLEMENTATION_REPORT.md`
- 기준선: `docs/implementation/baseline-report.md`
- 성능/접근성: `docs/implementation/performance-report.md`
- LiteRT 0.16 결정: `docs/implementation/litert-lm-0.16-compatibility.md`
- rollback: `docs/implementation/rollback-runbook.md`
- migration JSON: `artifacts/migration/legacy-v1-to-v5.json`
- UI manifest/screens: `artifacts/ui/final-ui-evidence.json`, `artifacts/ui/final-*.png`
- browser/10k benchmark: `artifacts/benchmark/*.json`

## 다음 운영자가 반드시 할 일

### 1. Runtime authentication 결정

LiteRT-LM 0.13.1과 0.16.0 CLI에는 확인된 server auth flag가 없다. 현재 app의 random token은
runtime이 auth 지원을 명시한 경우에만 적용되며 기본 `authEnforced=false`다. loopback/random
port를 FR-078 통과로 취급하지 않는다.

다음 중 승인된 구조가 필요하다.

- server-side API key를 실제 강제하는 LiteRT release
- 인증 proxy 뒤에 backend를 격리해 direct backend access도 막는 Windows 구조
- 동일 수준의 OS IPC/runtime 대체안

비인가 동일-session process 요청 실패 test를 남겨야 한다.

### 2. Windows signed release

Windows certificate/secret을 CI에 연결하고 EXE, MSI/NSIS, 포함 runtime binary의 signature를
독립 검증한다. exact artifact에 SHA256SUMS, SBOM, NOTICE를 붙이고 clean Windows VM에서
설치/실행/제거를 확인한다. unsigned artifact를 GA로 게시하지 않는다.

### 3. Target VDI strict matrix

승인할 exact image에서 실행한다.

```powershell
node scripts\verify-litert-runtime.mjs --strict
node scripts\benchmark-local-ai.mjs --strict
```

model/runtime version·hash, cold/warm, prompt/output/thread, Korean UTF-8, cancellation, 세 번의
restart, port collision, peak RSS, EDR, rollback을 보존한다. 0.16.0 승격은 이 matrix가
0.13.1보다 나쁘지 않고 모든 gate가 통과한 뒤에만 한다.

### 4. P1 잔여 구현

우선순위는 diagnostic ZIP, bounded restart, 전체 reindex, trash/revision UI, search DSL,
outline scroll sync, task start/assignee, AI context/decision/risk/translate다. 세부 ID는 최종
보고서의 P1 table을 따른다.

## 배포·복구 주의

- 실제 data path는 Settings → Data를 authoritative source로 사용한다.
- 같은 `memoji.db`를 여러 VDI가 동시에 열지 않는다.
- newer schema DB를 older app으로 직접 열지 않는다.
- import/migration backup과 app version을 쌍으로 보존한다.
- AI bundle이 실패해도 editing/search core는 사용할 수 있어야 한다.
- 코어 app chunk size와 optional multi-GB model bundle size를 섞어 보고하지 않는다.

## 완료 정의

FR-078과 FR-090을 닫고, Windows VDI strict evidence와 signed provenance가 있으며, 최종 CI와
rollback rehearsal가 통과했을 때만 Memoji 2.0 Windows VDI GA를 GO로 바꾼다.
