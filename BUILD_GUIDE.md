# Memoji 2.0 build guide

릴리스 게시 절차와 signing 조건은 [RELEASE.md](RELEASE.md), 현재 GA 판정은
[MEMOJI_2_GA_IMPLEMENTATION_REPORT.md](MEMOJI_2_GA_IMPLEMENTATION_REPORT.md)를 따릅니다.

## 요구 환경

- Node.js 20 이상과 npm
- Rust 1.77.2 이상
- Tauri 2 platform prerequisite
- Windows: Visual Studio Build Tools와 WebView2
- macOS: Xcode command-line tools

## clean dependency와 quality gate

```bash
npm ci
npm run check
node scripts/verify-release-version.mjs

cd src-tauri
cargo fmt --all -- --check
cargo clippy --locked --all-targets --all-features -- -D warnings
cargo test --locked
```

release build 전에 위 gate를 생략하지 않습니다. `npm install` 대신 lockfile을 지키는
`npm ci`를 사용합니다.

## 일반 Tauri bundle

```bash
npm run tauri:build
```

실제 산출물은 Tauri가 출력한 `src-tauri/target/.../release/bundle/` 경로를 확인하세요.
filename과 version은 build manifest에서 동적으로 결정되므로 문서에 `2.0.0`을 고정하지
않습니다.

## Windows x64와 AVX-512

일반 Windows x64:

```powershell
.\scripts\build-windows-x64.ps1
```

승인된 Cascade Lake급 VDI 전용 AVX-512 후보:

```powershell
.\scripts\build-windows-avx512.ps1
```

두 script는 package version을 읽어 `release/windows-x64`와
`release/windows-avx512`에 구분합니다. AVX-512 artifact는 CPU feature가 확인된 전용 pool에만
배포하고 일반 x64 fallback을 보존합니다.

## Optional Windows VDI AI bundle

이미지 준비 PC에서 승인된 LiteRT/model을 준비한 뒤 실행합니다.

```powershell
.\scripts\build-windows-vdi.ps1
```

또는 AI 자산만 준비합니다.

```powershell
npm run ai:bundle:vdi
```

결과의 `ai/bundle-manifest.json`에서 runtime/model version, source, byte size, SHA-256,
license를 확인합니다. 코어 executable만 복사하면 AI가 포함되지 않습니다. 모델/runtime
크기는 고정된 “약 3 GB”가 아니라 이 manifest의 실제 합계를 사용합니다.

기본 lock은 LiteRT-LM 0.13.1입니다. 0.16.0은
`docs/implementation/litert-lm-0.16-compatibility.md`의 target Windows VDI matrix를 통과한
뒤에만 기본값으로 승격합니다.

## Build artifact 검증

각 platform에서 최소한 다음을 확인합니다.

- app/Cargo/Tauri/tag version 일치
- clean install, launch, save, restart, uninstall
- new page, Milkdown/source 전환, table, search, task/calendar
- 설정에 표시되는 실제 storage path
- DB import backup path/hash/size와 transactional merge
- export ZIP의 Markdown, DB snapshot, manifest hash 검증
- AI가 없는 코어 package에서 편집/search 정상 동작과 명확한 AI error
- AI 포함 package에서 exact runtime/model hash와 strict VDI matrix

Windows GA는 EXE, MSI/NSIS와 포함 runtime binary의 Authenticode 검증이 필수입니다.
unsigned binary를 바이러스 오탐의 정상 상태로 간주하거나 공개 GA로 배포하지 않습니다.

## Provenance 생성

```bash
node scripts/generate-checksums.mjs --input <artifact-directory>
```

```powershell
.\scripts\generate-sbom.ps1 -OutputPath .\release\sbom.cdx.json
```

artifact와 함께 다음을 보존합니다.

- `SHA256SUMS`
- `sbom.cdx.json`
- `NOTICE.md`
- exact commit/tag/workflow run
- signature 검증 결과
- runtime/model manifest
- target VDI benchmark, EDR와 rollback evidence

## 데이터와 개발 fixture

앱의 실제 data path는 Settings → Data가 authoritative source입니다. 개발 fixture를 지우기
위해 사용자 data directory를 추정하거나 broad delete command를 사용하지 마세요. 합성 대형
DB는 명시한 `/tmp` 경로에 생성하며 기존 파일을 덮어쓰려면 `--force`가 필요합니다.

```bash
node scripts/generate-large-workspace-fixture.mjs \
  --output /tmp/memoji-large-workspace.db
```

## 문제 해결

- frontend failure: `npm ci` 후 `npm run check`의 첫 실패를 해결합니다.
- Rust failure: `cargo fmt`, `cargo clippy`, `cargo test`를 분리 실행해 최초 원인을 봅니다.
- version failure: 세 manifest와 tag를 맞추고 `verify-release-version.mjs`를 다시 실행합니다.
- AI bundle failure: model path와 compatibility manifest의 platform/version/hash를 확인합니다.
- VDI failure: loopback, EDR, write permission, persistent data path, model registry를 확인합니다.

build folder를 지워서 증빙을 없애기 전에 실패 artifact와 log/hash를 보존하세요.
