# Memoji 2.0

로컬 SQLite와 Markdown을 원본으로 사용하는 Tauri 데스크톱 지식 작업공간입니다.
Milkdown 즉시 편집, page/tag/wiki link, task/calendar, SQLite FTS 검색, revision-safe AI
proposal을 하나의 3단 workspace에 묶습니다. 기본 AI 경로는 외부 cloud가 아닌 같은 세션의
LiteRT-LM loopback runtime입니다.

현재 구현·검증 범위와 GA 차단 항목은
[MEMOJI_2_GA_IMPLEMENTATION_REPORT.md](MEMOJI_2_GA_IMPLEMENTATION_REPORT.md)를 먼저 확인하세요.
코어 코드는 조건부 후보이지만 runtime 인증과 signed Windows artifact가 없어 전체 Windows
VDI GA 판정은 아직 NO-GO입니다.

## 핵심 기능

- 크기 조절 가능한 Left / Center / Context Hub와 1024/800 responsive overlay
- Today, Daily, Projects, Tasks, Calendar, Knowledge 탐색
- page/task/command/recent를 묶은 `Ctrl+K` command palette
- Milkdown/Crepe WYSIWYG와 Markdown source mode, GFM table
- checksum 기반 SQLite schema v5 migration과 pre-migration backup
- page revision, optimistic conflict, normalized tag/link/anchor/FTS index
- Markdown-backed task와 month/week/day offline calendar
- source citation, before/after diff, user approval이 필요한 AI proposal
- path-based native DB import와 DB snapshot을 포함한 Markdown ZIP export
- 동적 version, checksum, SBOM, NOTICE, CI/release gate와 rollback runbook

## 개발 시작

필수 도구는 Node.js 20 이상, npm, Rust 1.77.2 이상과 Tauri 2 platform prerequisite입니다.

```bash
npm ci
npm run dev
```

네이티브 개발 창:

```bash
npm run tauri:dev
```

전체 로컬 gate:

```bash
npm run check
cd src-tauri
cargo fmt --all -- --check
cargo clippy --locked --all-targets --all-features -- -D warnings
cargo test --locked
```

`npm run check`는 typecheck, unit/component tests, production Vite build를 순서대로 실행합니다.

## 데이터와 VDI

데이터 경로는 다음 우선순위로 한 번 결정됩니다.

1. `MEMOJI_DATA_PATH`
2. 실행 파일 옆의 쓰기 가능한 `data` 폴더
3. OS local app data의 `Memoji/data`

비영구 Windows VDI에서는 관리자가 보존하는 사용자별 경로를 명시하세요.

```powershell
setx MEMOJI_DATA_PATH "H:\Memoji\data"
```

새 세션에서 Settings → Data의 실제 `memoji.db` 경로를 확인하고 로그아웃, 재접속, golden
image reset 후 보존을 시험해야 합니다. 같은 DB를 여러 VDI가 동시에 열거나 열린 SQLite
파일을 양방향 동기화하지 마세요. 자세한 운영 조건은
[VDI_SETUP_GUIDE.md](VDI_SETUP_GUIDE.md)와
[VDI_DEPLOYMENT_GUIDE.md](VDI_DEPLOYMENT_GUIDE.md)에 있습니다.

## Local AI

기본 runtime lock은 LiteRT-LM 0.13.1과 `gemma4-e2b`입니다. 0.16.0은 검토 후보이며 target
Windows VDI matrix를 통과하기 전에는 기본값으로 승격하지 않습니다. 앱은 loopback endpoint만
허용하고 managed child process의 model/process/endpoint 상태를 분리해 표시합니다.

AI 자산은 코어 앱과 별도입니다.

- 코어 JS shell: 최신 build 기준 491,198 bytes raw / 152,794 bytes gzip
- deferred Milkdown runtime: 909,826 bytes raw / 287,531 bytes gzip
- signed MSI/NSIS/EXE 크기: 이 호스트에서 만들지 않았으므로 미확정
- LiteRT+Gemma bundle: 선택한 verified model/runtime manifest의 실제 byte count를 사용

JS chunk 크기를 installer 크기로 보거나, 예전 문서의 임의 “약 3 GB” 값을 릴리스 근거로
사용하면 안 됩니다.

VDI AI bundle 준비:

```powershell
npm run ai:bundle:vdi
```

준비 스크립트는 lock된 runtime asset의 크기와 SHA-256을 검증합니다. 최종 package는 Windows
VDI에서 runtime compatibility, cold/warm benchmark, EDR, memory, signing을 별도로 통과해야
합니다. 현재 LiteRT-LM에는 확인된 server auth flag가 없어 “인증된 managed runtime”을
주장하지 않습니다.

## 빌드와 릴리스

일반 Tauri bundle:

```bash
npm run tauri:build
```

Windows 전용 build script:

```powershell
.\scripts\build-windows-x64.ps1
.\scripts\build-windows-avx512.ps1
```

산출물 이름은 `package.json`, `src-tauri/Cargo.toml`, `src-tauri/tauri.conf.json`의 일치하는
version에서 동적으로 결정됩니다. 정확한 release gate, signing secret, SBOM/checksum,
tag 절차는 [RELEASE.md](RELEASE.md)와 [BUILD_GUIDE.md](BUILD_GUIDE.md)를 따르세요.

## 구조

```text
src/                         React workspace, editor, tasks/calendar, AI review UI
src-tauri/src/               Tauri commands, services, SQLite, indexing, local AI
src-tauri/resources/         runtime compatibility and model manifests
docs/memoji-ga/              approved GA requirements and architecture
docs/implementation/         baseline, performance, compatibility, rollback evidence
artifacts/                   synthetic benchmark, migration, UI evidence
scripts/                     release, VDI bundle, benchmark and verification tools
```

## 라이선스와 지원

저장소의 [LICENSE](LICENSE)와 [NOTICE.md](NOTICE.md)를 확인하세요. 문제를 보고할 때 본문이나
모델 파일을 첨부하지 말고 app version, OS/VDI image, 재현 단계, 로그의 민감정보 제거 여부를
포함하세요.
