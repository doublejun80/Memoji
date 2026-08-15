# Memoji 2.0 릴리스 절차

이 문서는 구현된 workflow와 실제 GA 승인 조건을 설명합니다. signing credential, target
Windows VDI evidence 또는 필수 provenance가 없으면 draft release를 게시하지 마세요.

## 1. 사전 조건

- clean release commit과 승인된 tag
- `package.json`, `src-tauri/Cargo.toml`, `src-tauri/tauri.conf.json`의 동일 version
- Windows code-signing certificate와 CI secret
- macOS 배포 시 Apple signing/notarization credential
- 승인된 LiteRT runtime/model manifest와 SHA-256
- target Windows VDI에서 runtime/benchmark/EDR/rollback evidence

현재 2.0 후보의 전체 판정은
[MEMOJI_2_GA_IMPLEMENTATION_REPORT.md](MEMOJI_2_GA_IMPLEMENTATION_REPORT.md)에 있습니다.
FR-078과 FR-090이 닫히기 전에는 Windows VDI GA tag를 게시하면 안 됩니다.

## 2. 로컬 release gate

repository root에서 실행합니다.

```bash
npm ci
npm run check
node scripts/verify-release-version.mjs
cd src-tauri
cargo fmt --all -- --check
cargo clippy --locked --all-targets --all-features -- -D warnings
cargo test --locked
```

추가 확인:

```bash
npm audit --omit=dev
git diff --check
```

실제 model이 있는 release host에서는 ignored model smoke test와 local-AI harness를 별도로
실행합니다. target VDI에서는 `--strict`가 `blocked` evidence를 성공으로 취급하지 않도록 합니다.

```powershell
node scripts\verify-litert-runtime.mjs --strict
node scripts\benchmark-local-ai.mjs --strict
```

## 3. 버전과 tag

세 파일의 version을 한 commit에서 바꾸고 검증합니다. workflow나 filename에 `2.0.0`을 직접
하드코딩하지 않습니다.

```bash
node scripts/verify-release-version.mjs
git tag v<version>
git push origin v<version>
```

`release.yml`은 tag version과 manifest version의 불일치를 거부합니다. 수동 workflow도
동일 gate를 거칩니다.

## 4. CI와 bundle gate

`.github/workflows/ci.yml`은 pull request와 push에서 다음을 실행합니다.

1. npm clean install
2. typecheck, unit/component test, production build
3. Rust fmt
4. Rust clippy with warnings denied
5. Rust tests

`.github/workflows/release.yml`과 `windows-dist.yml`은 위 gate와 version 검사를 통과한 뒤에만
bundle을 만듭니다. 플랫폼 matrix와 bundle 종류는 workflow가 실제 생성한 artifact를
기준으로 확인해야 하며 문서의 예상 filename만으로 성공을 판정하지 않습니다.

## 5. Signing과 provenance

Windows release는 EXE, MSI/NSIS installer와 포함되는 runtime binary의 Authenticode 서명을
검증해야 합니다. 인증서 또는 secret이 없을 때 unsigned artifact를 “테스트용”으로 공개 GA에
올리지 않습니다. macOS 외부 배포는 Developer ID signing과 notarization evidence가 필요합니다.

각 release에 다음 파일을 보존합니다.

- platform installer/bundle
- `SHA256SUMS`
- `sbom.cdx.json`
- `NOTICE.md`
- exact commit/tag and workflow run URL
- app/runtime/model version, size, SHA-256, license manifest
- signing certificate subject/thumbprint와 검증 결과
- VDI runtime/benchmark/EDR/rollback evidence JSON

체크섬과 SBOM 생성:

```bash
node scripts/generate-checksums.mjs --input <artifact-directory>
```

```powershell
.\scripts\generate-sbom.ps1 -OutputPath .\release\sbom.cdx.json
```

SBOM script는 npm과 Cargo dependency를 함께 기록하며 Windows release job에서 실제 생성·검증
후 업로드합니다.

## 6. AI bundle 승격

현재 기본 lock은 LiteRT-LM 0.13.1입니다. 0.16.0은
`docs/implementation/litert-lm-0.16-compatibility.md`의 모든 promotion gate를 통과해야 합니다.

필수 matrix:

- `--version`, `--help`, `serve --help`, `/v1/models`
- start/stop와 세 번의 crash/restart cycle
- Korean UTF-8 streaming과 cancellation
- 2K/4K context
- E2B 256/1024 prompt × 64/256 output × cold/warm × thread 조합
- TTFT, total latency, tokens/s, peak RSS
- port collision, missing model, EDR policy
- runtime/model hash와 rollback rehearsal

코어 app bundle과 AI bundle은 서로 다른 artifact로 계산·승인합니다. 모델을 포함하지 않은 app
크기로 AI 포함 배포 크기를 주장하지 않습니다.

## 7. Draft 검수와 게시

workflow는 release를 draft 상태로 만들어야 합니다. 게시 전 독립 검수자는 다음을 확인합니다.

- 모든 required job이 green이고 ignored/blocked가 숨겨지지 않았음
- version/tag/file metadata 일치
- installer와 runtime signature 유효
- `SHA256SUMS`가 실제 다운로드 artifact와 일치
- SBOM/NOTICE/license 포함
- clean Windows VM 설치/실행/제거
- target VDI 데이터 보존, import/export, offline editing/search
- AI를 포함한 경우 runtime auth와 strict matrix 통과
- rollback runbook rehearsal와 복구 데이터 hash/count 일치

모든 조건이 충족된 뒤에만 draft를 게시합니다.

## 8. 실패와 rollback

배포 중 문제가 발생하면 release를 unpublished/draft로 유지하고 새 artifact로 조용히 교체하지
마세요. 실패 artifact와 hash를 보존하고 새 build number 또는 patch version을 만듭니다.
데이터와 app version 복구는
[docs/implementation/rollback-runbook.md](docs/implementation/rollback-runbook.md)를 따릅니다.

특히 newer schema DB를 older binary로 직접 열지 말고 pre-upgrade DB와 이전 signed app을 한 쌍으로
복원해야 합니다.
