# Memoji 2.0 Windows VDI Conversion Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 구버전 Memoji를 복구 가능한 위치에 봉인하고, GitHub 기본 브랜치를 Tauri 2.0 전용으로 전환한 뒤 Windows VDI에서 직접 시험할 수 있는 unsigned `v2.0.0-rc.1` 실행물과 오프라인 AI 자산을 배포한다.

**Architecture:** 현재 `codex/memoji-2-ga-uiux` 작업본을 유일한 현행 소스로 사용한다. 구버전 원격 커밋은 브랜치와 태그로, 로컬 앱·미디어·DB는 체크섬이 있는 외부 보관 폴더로 이동한다. Windows VDI 산출물은 전용 GitHub Actions 워크플로에서 LiteRT-LM 0.16.0 C API와 Gemma 4 E2B를 고정 해시로 준비하고, 2GiB GitHub 릴리즈 자산 한도를 피하도록 모델을 분할해 prerelease에 게시한다.

**Tech Stack:** React 18, TypeScript 6, Vite 6, Vitest 4, Tauri 2.11, Rust 2021, SQLite/rusqlite, LiteRT-LM 0.16.0 C API, Gemma 4 E2B, PowerShell 7, GitHub Actions

## Global Constraints

- 구버전 원격 `main`은 `archive/memoji-v1-final` 브랜치와 `v1.0.0-legacy` 태그로 복구 가능해야 한다.
- 사용자 DB와 구버전 앱은 새 앱 검증 전 영구 삭제하지 않는다.
- 원격 기본 브랜치는 강제 푸시 없이 fast-forward로만 전환한다.
- Windows 시험 태그는 `v2.0.0-rc.1`, 릴리즈 표시는 `Unsigned VDI Pilot`이다.
- 정식 `v2.0.0`은 Authenticode 서명, 대상 VDI 실행, EDR 허용, 성능 기준 통과 전에는 만들지 않는다.
- 모델 바이너리, 인증서, 로컬 로그, `artifacts/`, `release/`, `src-tauri/target/`은 Git 추적 대상이 아니다.
- Windows VDI 번들은 Tauri 실행물, 벤치마크, LiteRT-LM DLL, Gemma 4 E2B, SBOM, 체크섬, 한국어 안내서를 모두 포함해야 한다.
- macOS 검증은 Windows VDI 합격 증거로 간주하지 않는다.

---

### Task 1: 현재 변경과 보관 대상을 고정한다

**Files:**
- Modify: `.gitignore`
- Create outside repository: `/Volumes/doublejun/Memoji-archive/2026-08-17/`

**Interfaces:**
- Consumes: 현재 worktree의 추적·미추적 파일, 설치 앱 `/Volumes/doublejun/application/Memoji.app`
- Produces: 복사 검증이 끝난 로컬 보관 디렉터리와 커밋 가능한 소스 목록

- [ ] **Step 1: 현재 원격·브랜치·파일 상태를 기록한다**

Run:

```bash
git fetch origin main --tags
git rev-parse origin/main
git rev-list --left-right --count origin/main...HEAD
git status --short
```

Expected: `origin/main`이 `HEAD`의 조상이며 left count가 `0`이다.

- [ ] **Step 2: 저장소 밖 보관 폴더를 만들고 미디어 산출물을 복사한다**

Run:

```bash
mkdir -p /Volumes/doublejun/Memoji-archive/2026-08-17/project-artifacts
ditto artifacts /Volumes/doublejun/Memoji-archive/2026-08-17/project-artifacts/artifacts
find artifacts -type f -print0 | sort -z | xargs -0 shasum -a 256 > /Volumes/doublejun/Memoji-archive/2026-08-17/project-artifacts/source-SHA256SUMS.txt
find /Volumes/doublejun/Memoji-archive/2026-08-17/project-artifacts/artifacts -type f -print0 | sort -z | xargs -0 shasum -a 256 > /Volumes/doublejun/Memoji-archive/2026-08-17/project-artifacts/archive-SHA256SUMS.txt
```

Expected: 원본과 보관본 파일 수가 같고 대응 파일의 해시가 같다.

- [ ] **Step 3: 생성물과 비밀 파일을 Git에서 제외한다**

Add exactly these patterns to `.gitignore`:

```gitignore
# Generated QA and media evidence is archived outside the product repository.
artifacts/

# Windows VDI payloads and signing material never enter Git history.
*.litertlm
*.pfx
*.p12
```

Run: `git rm -r --cached artifacts`

Expected: 파일은 로컬에 남아 있으나 `git status`에는 추적 삭제로만 나타난다.

- [ ] **Step 4: 비밀정보와 대용량 커밋 후보를 검사한다**

Run:

```bash
git diff -- . ':!artifacts/**' | rg -n '(BEGIN (RSA |EC |OPENSSH )?PRIVATE KEY|WINDOWS_CERTIFICATE_BASE64\s*=|TAURI_SIGNING_PRIVATE_KEY\s*=|SONIOX_API_KEY\s*=|hf_[A-Za-z0-9]{20,})'
git status --porcelain=v1 -z | while IFS= read -r -d '' entry; do path="${entry:3}"; test -f "$path" && stat -f '%z %N' "$path"; done | sort -nr | head -30
```

Expected: 비밀 패턴이 없고 100MiB 이상 파일은 커밋 후보에 없다.

- [ ] **Step 5: 보관·무시 규칙만 커밋한다**

```bash
git add .gitignore artifacts
git commit -m "chore: archive generated evidence outside product source"
```

### Task 2: RC 태그와 Windows VDI 패키징 계약을 테스트로 고정한다

**Files:**
- Create: `src/test/releaseVersion.test.ts`
- Modify: `scripts/verify-release-version.mjs`

**Interfaces:**
- Consumes: `package.json`의 `2.0.0`, `v2.0.0-rc.1` 태그
- Produces: GA 태그와 RC 태그를 구분하는 버전 검증, unsigned 경로의 명시적 테스트

- [ ] **Step 1: RC 태그 검증 실패 테스트를 작성한다**

Create `src/test/releaseVersion.test.ts` with a `spawnSync(process.execPath, ['scripts/verify-release-version.mjs', '--tag', tag])` helper and these assertions:

```ts
expect(run('v2.0.0').status).toBe(0);
expect(run('v2.0.0-rc.1').status).toBe(0);
expect(run('v2.0.1-rc.1').status).not.toBe(0);
expect(run('v2.0.0-beta.1').status).not.toBe(0);
```

- [ ] **Step 2: 테스트가 현재 RC 태그에서 실패하는지 확인한다**

Run: `npx vitest run src/test/releaseVersion.test.ts`

Expected: `v2.0.0-rc.1` 케이스가 `Tag ... does not match`로 실패한다.

- [ ] **Step 3: RC 태그 코어 버전을 검증하도록 구현한다**

Replace the exact tag comparison in `scripts/verify-release-version.mjs` with:

```js
if (tag) {
  const matched = /^v(\d+\.\d+\.\d+)(-rc\.\d+)?$/.exec(tag);
  if (!matched || matched[1] !== version) {
    throw new Error(`Tag ${tag} does not match application version v${version}`);
  }
}
```

- [ ] **Step 4: 버전 검증 테스트를 통과시킨다**

Run: `npx vitest run src/test/releaseVersion.test.ts`

Expected: GA 태그와 `v2.0.0-rc.1`은 통과하고 다른 버전과 beta 태그는 거부된다.

- [ ] **Step 5: 버전 검증 변경을 커밋한다**

```bash
git add scripts/verify-release-version.mjs src/test/releaseVersion.test.ts
git commit -m "test: define Windows VDI release contract"
```

### Task 3: 2GiB 제한을 피하는 VDI 패키징 스크립트를 구현한다

**Files:**
- Create: `src/test/windowsVdiPackagingScripts.test.ts`
- Create: `scripts/assemble-windows-vdi-model.ps1`
- Create: `scripts/package-windows-vdi-pilot.ps1`
- Modify: `scripts/build-windows-vdi.ps1`

**Interfaces:**
- Consumes: `release/memoji-vdi`, `bundle-manifest.json`, Gemma 4 E2B 모델
- Produces: `<2GiB` core zip, `<1.9GB` 모델 조각, 조립 스크립트, SBOM, `SHA256SUMS`

- [ ] **Step 1: 패키징 계약의 실패 테스트를 작성한다**

Create `src/test/windowsVdiPackagingScripts.test.ts` and load the three PowerShell scripts as UTF-8 text. Assert the following exact contracts:

```ts
expect(buildScript).toContain('[switch]$AllowUnsigned');
expect(buildScript).toContain('UNSIGNED-VDI-PILOT.txt');
expect(buildScript).toContain('verify-litert-runtime.mjs');
expect(packagingScript).toContain('1900000000');
expect(packagingScript).toContain('Assemble-Memoji-VDI.ps1');
expect(packagingScript).toContain('2000000000');
expect(assembleScript).toContain('Get-FileHash');
expect(assembleScript).toContain('CopyTo');
```

Run: `npx vitest run src/test/windowsVdiPackagingScripts.test.ts`

Expected: 새 스크립트가 없어서 실패한다.

- [ ] **Step 2: 모델 조립 스크립트를 작성한다**

`scripts/assemble-windows-vdi-model.ps1` must accept `PartsDirectory`, `OutputPath`, and `ExpectedSha256`; stream every `*.partNNN` in ordinal order into one file, compare `Get-FileHash -Algorithm SHA256`, and delete the partial output on mismatch.

- [ ] **Step 3: 릴리즈 자산 패키징 스크립트를 작성한다**

`scripts/package-windows-vdi-pilot.ps1` must:

1. Require `Memoji.exe`, `memoji-vdi-benchmark.exe`, `ai/runtime/lib/litert-lm.dll`, `ai/bundle-manifest.json`, the manifest-selected model, SBOM, and README.
2. Copy every non-model runtime file into a core staging folder.
3. Copy `assemble-windows-vdi-model.ps1` into the core as `Assemble-Memoji-VDI.ps1`.
4. Create `Memoji-<version>-windows-x64-vdi-core.zip` with `7z`.
5. Stream-split the model into `Memoji-<version>-Gemma4-E2B.litertlm.partNNN` files of at most `1900000000` bytes.
6. Write a release manifest containing model relative path, total bytes, SHA-256, part names, and unsigned status.
7. Run `node scripts/generate-checksums.mjs` over the release asset directory.
8. Fail if any single asset is `>= 2000000000` bytes.

- [ ] **Step 4: VDI 빌드 스크립트를 RC 출력에 맞춘다**

Modify `scripts/build-windows-vdi.ps1` to:

- keep `-AllowUnsigned` mandatory when signing is absent;
- run `node scripts/verify-litert-runtime.mjs --bundle $aiRoot --strict` after bundle preparation;
- write a Korean `README-VDI.txt` with offline launch, `MEMOJI_DATA_PATH`, model assembly, benchmark, log, and rollback commands;
- record `UNSIGNED-VDI-PILOT.txt` when unsigned;
- generate checksums only after every payload file exists.

- [ ] **Step 5: PowerShell 구문과 정적 계약을 확인한다**

Run:

```bash
pwsh -NoProfile -Command '$errors=$null; [System.Management.Automation.Language.Parser]::ParseFile("scripts/build-windows-vdi.ps1",[ref]$null,[ref]$errors) > $null; if($errors.Count){$errors | % Message; exit 1}'
pwsh -NoProfile -Command '$errors=$null; [System.Management.Automation.Language.Parser]::ParseFile("scripts/package-windows-vdi-pilot.ps1",[ref]$null,[ref]$errors) > $null; if($errors.Count){$errors | % Message; exit 1}'
pwsh -NoProfile -Command '$errors=$null; [System.Management.Automation.Language.Parser]::ParseFile("scripts/assemble-windows-vdi-model.ps1",[ref]$null,[ref]$errors) > $null; if($errors.Count){$errors | % Message; exit 1}'
npx vitest run src/test/windowsVdiPackagingScripts.test.ts
```

Expected: 모든 명령이 종료 코드 0이다.

- [ ] **Step 6: 패키징 구현을 커밋한다**

```bash
git add scripts/build-windows-vdi.ps1 scripts/package-windows-vdi-pilot.ps1 scripts/assemble-windows-vdi-model.ps1 src/test/windowsVdiPackagingScripts.test.ts
git commit -m "build: package unsigned Windows VDI pilot"
```

### Task 4: 전용 Windows VDI prerelease 워크플로를 구현한다

**Files:**
- Modify: `src/test/windowsSigningScripts.test.ts`
- Create: `.github/workflows/windows-vdi-pilot.yml`
- Modify: `.github/workflows/windows-dist.yml`
- Modify: `.github/workflows/release.yml`

**Interfaces:**
- Consumes: `v*-rc.*` 태그, Task 3 PowerShell 스크립트
- Produces: GitHub Actions 전체 번들 artifact와 공개 prerelease 분할 자산

- [ ] **Step 1: 전용 워크플로의 실패 테스트를 작성한다**

Extend `src/test/windowsSigningScripts.test.ts` so it loads `.github/workflows/windows-vdi-pilot.yml` and asserts:

```ts
expect(vdiWorkflow).toContain('v*-rc.*');
expect(vdiWorkflow).toContain('-AllowUnsigned');
expect(vdiWorkflow).toContain('-DownloadModel');
expect(vdiWorkflow).toContain('memoji-vdi-benchmark');
expect(vdiWorkflow).toContain('prerelease: true');
expect(vdiWorkflow).toContain('SHA256SUMS');
```

Run: `npx vitest run src/test/windowsSigningScripts.test.ts`

Expected: 전용 워크플로가 없어서 실패한다.

- [ ] **Step 2: 전용 워크플로를 작성한다**

`.github/workflows/windows-vdi-pilot.yml` must run on `v*-rc.*` tags and manual dispatch, use `windows-latest`, Node 22, stable Rust MSVC, `npm ci`, `npm run check`, Rust fmt/clippy/test, then:

```powershell
pwsh -File scripts/build-windows-vdi.ps1 -ModelPreset e2b -DownloadModel -AllowUnsigned
node scripts/verify-litert-runtime.mjs --bundle release/memoji-vdi/ai --smoke --strict --output release/memoji-vdi/windows-runtime-verification.json
pwsh -File scripts/package-windows-vdi-pilot.ps1 -BundleRoot release/memoji-vdi -OutputRoot release/windows-vdi-pilot -Version $env:RELEASE_VERSION
```

Upload `release/memoji-vdi/**` as an Actions artifact with compression level 0, and attach every `release/windows-vdi-pilot/*` file to a non-draft prerelease named `Memoji <tag> — Unsigned VDI Pilot`.

- [ ] **Step 3: 서명 GA 워크플로가 main push에서 실패하지 않게 분리한다**

Change `.github/workflows/windows-dist.yml` to manual dispatch only. Keep certificate requirements and `signtool verify /pa /all` unchanged.

- [ ] **Step 4: 일반 다중 플랫폼 릴리즈가 RC 태그에서 실행되지 않게 한다**

Add this job condition to `.github/workflows/release.yml`:

```yaml
if: ${{ github.event_name == 'workflow_dispatch' || !contains(github.ref_name, '-rc.') }}
```

- [ ] **Step 5: 워크플로 정적 검사와 전체 프런트엔드 검사를 실행한다**

Run:

```bash
npx vitest run src/test/releaseVersion.test.ts src/test/windowsSigningScripts.test.ts
npm run check
```

Expected: 타입 검사, 전체 Vitest, Vite production build가 모두 통과한다.

- [ ] **Step 6: 워크플로를 커밋한다**

```bash
git add .github/workflows/windows-vdi-pilot.yml .github/workflows/windows-dist.yml .github/workflows/release.yml src/test/windowsSigningScripts.test.ts
git commit -m "ci: publish Windows VDI release candidates"
```

### Task 5: 현재 Memoji 2.0 구현 변경을 검증하고 커밋한다

**Files:**
- Modify: 현재 `git status`에 나타난 `src/`, `src-tauri/`, `scripts/`, `docs/`, `package.json`, `Cargo.toml`, lockfiles
- Exclude: `artifacts/`, `release/`, `src-tauri/target/`, 모델 파일, 로컬 비밀 파일

**Interfaces:**
- Consumes: 이전 작업에서 구현된 UI, DB v6, 작업·일정·검색·AI·LiteRT 변경
- Produces: 재현 가능한 Tauri 2.0 소스 커밋과 통과한 검사 기록

- [ ] **Step 1: 프런트엔드 전체 검사를 실행한다**

Run: `npm run check`

Expected: TypeScript, 직접 실행 단위 테스트, Vitest, Vite build가 모두 통과한다.

- [ ] **Step 2: Rust 포맷·Clippy·테스트를 실행한다**

Run:

```bash
cargo fmt --all --manifest-path src-tauri/Cargo.toml -- --check
cargo clippy --manifest-path src-tauri/Cargo.toml --all-targets --all-features -- -D warnings
cargo test --manifest-path src-tauri/Cargo.toml --locked
```

Expected: 경고를 오류로 처리한 상태에서 모두 통과한다.

- [ ] **Step 3: 이전 DB 마이그레이션 근거를 재생성한다**

Run:

```bash
MEMOJI_MIGRATION_EVIDENCE_PATH=artifacts/migration/legacy-v1-to-v6.json cargo test --manifest-path src-tauri/Cargo.toml db::connection::tests::migrates_legacy_file_with_backup_and_content_evidence -- --exact --nocapture
```

Expected: 백업 선생성, schema version 6, quick check `ok`, 페이지 내용 해시 일치가 기록된다.

- [ ] **Step 4: 변경을 책임별로 커밋한다**

Commit order:

```bash
git add src-tauri/src src-tauri/Cargo.toml src-tauri/Cargo.lock
git commit -m "feat: complete Memoji 2.0 data and local AI runtime"

git add src vite.config.ts package.json package-lock.json
git commit -m "feat: complete Memoji 2.0 workspace interactions"

git add scripts src-tauri/resources src-tauri/tauri.conf.json src-tauri/tauri.dev.conf.json .github
git commit -m "build: finalize Memoji 2.0 release tooling"

git add docs MEMOJI_2_GA_IMPLEMENTATION_REPORT.md
git commit -m "docs: record Memoji 2.0 implementation and VDI limits"
```

Expected: `git status --short`에는 무시된 로컬 생성물만 남는다.

- [ ] **Step 5: 커밋 대상 전체를 재검사한다**

Run:

```bash
git diff --check origin/main...HEAD
git ls-tree -rl HEAD | sort -k4 -nr | head -30
git grep -n -E 'BEGIN (RSA |EC |OPENSSH )?PRIVATE KEY|SONIOX_API_KEY=|WINDOWS_CERTIFICATE_BASE64=' HEAD
```

Expected: diff 오류와 비밀정보가 없고 단일 파일 100MiB 제한을 넘지 않는다.

### Task 6: 로컬 구버전 앱과 DB를 복구 가능하게 보관하고 새 앱으로 교체한다

**Files:**
- Archive: `/Volumes/doublejun/application/Memoji.app`
- Create outside repository: `/Volumes/doublejun/Memoji-archive/2026-08-17/legacy-app/`
- Install: `/Volumes/doublejun/application/Memoji.app`

**Interfaces:**
- Consumes: 설치된 Memoji 1.0, 새 Tauri 2.0 macOS bundle
- Produces: 활성 위치의 Memoji 2.0 앱과 원상복구 가능한 구버전 앱·DB 백업

- [ ] **Step 1: 구버전 프로세스가 연 파일과 데이터 경로를 찾는다**

Run:

```bash
pgrep -fl '/Volumes/doublejun/application/Memoji.app/Contents/MacOS'
lsof -c Memoji | rg -i '(\.db|sqlite|Application Support|Containers)' || true
find "$HOME/Library/Application Support" "$HOME/Library/Containers" -maxdepth 5 -iname '*memoji*' -print 2>/dev/null
```

Expected: 보관할 실제 DB 경로를 기록하거나, DB가 없다는 근거를 남긴다.

- [ ] **Step 2: 구버전 앱을 종료하고 앱·DB를 복사 검증한다**

Run `osascript -e 'tell application id "com.memoji.app" to quit'`, then copy the explicit app and discovered DB paths into `/Volumes/doublejun/Memoji-archive/2026-08-17/legacy-app/` with `ditto`; create SHA-256 lists before moving the active app.

Expected: 실행 프로세스가 없고 보관 앱의 bundle version이 `1.0.0`이다.

- [ ] **Step 3: 새 macOS 앱을 빌드한다**

Run:

```bash
npm run tauri:build -- --bundles app
codesign --verify --deep --strict src-tauri/target/release/bundle/macos/Memoji.app
defaults read "$(pwd)/src-tauri/target/release/bundle/macos/Memoji.app/Contents/Info" CFBundleShortVersionString
```

Expected: 코드서명 구조 검사가 통과하고 version이 `2.0.0`이다.

- [ ] **Step 4: 활성 앱을 새 버전으로 교체한다**

Move the old app to `/Volumes/doublejun/Memoji-archive/2026-08-17/legacy-app/Memoji-1.0.0.app`, then `ditto` the new bundle to `/Volumes/doublejun/application/Memoji.app`.

Expected: 활성 앱의 bundle version이 `2.0.0`, identifier가 `com.memoji.app`이다.

- [ ] **Step 5: 새 앱을 실행해 대표 화면과 DB 접근을 확인한다**

Run: `open /Volumes/doublejun/application/Memoji.app`

Expected: 창 제목이 `Memoji 2.0 - 로컬 AI 마크다운 노트`이며 페이지·설정·데이터 가져오기 화면이 열린다.

### Task 7: 구버전 원격을 봉인하고 새 Tauri 2.0을 GitHub 기본 브랜치로 전환한다

**Files:**
- Remote branch: `archive/memoji-v1-final`
- Remote tag: `v1.0.0-legacy`
- Remote branch: `codex/memoji-2-ga-uiux`
- Remote default branch: `main`

**Interfaces:**
- Consumes: 검증된 Task 5 `HEAD`, 현재 `origin/main`
- Produces: 복구 가능한 구버전 ref와 새 기본 브랜치

- [ ] **Step 1: 구버전 ref가 비어 있는지 확인한다**

Run:

```bash
git ls-remote --heads origin archive/memoji-v1-final
git ls-remote --tags origin refs/tags/v1.0.0-legacy
```

Expected: 둘 다 없거나 현재 `origin/main`과 동일한 커밋이다. 다른 커밋이면 덮어쓰지 않고 중단한다.

- [ ] **Step 2: 원격 구버전 브랜치와 태그를 만든다**

Run:

```bash
legacy_commit=$(git rev-parse origin/main)
git push origin "$legacy_commit:refs/heads/archive/memoji-v1-final"
git tag -a v1.0.0-legacy "$legacy_commit" -m "Memoji legacy default before Tauri 2.0 conversion"
git push origin refs/tags/v1.0.0-legacy
```

- [ ] **Step 3: 보관 ref를 재검증한다**

Run:

```bash
git ls-remote origin refs/heads/archive/memoji-v1-final refs/tags/v1.0.0-legacy
git rev-list --left-right --count origin/main...HEAD
```

Expected: 보관 브랜치가 이전 `origin/main`, left count가 `0`이다.

- [ ] **Step 4: 새 브랜치를 먼저 푸시하고 CI를 확인한다**

Run:

```bash
git push -u origin codex/memoji-2-ga-uiux
gh run list --repo doublejun80/Memoji --branch codex/memoji-2-ga-uiux --limit 5
```

Expected: CI frontend와 Rust job이 성공한다.

- [ ] **Step 5: 원격 main을 fast-forward 전환한다**

Run:

```bash
git push origin HEAD:main
git fetch origin main
test "$(git rev-parse HEAD)" = "$(git rev-parse origin/main)"
```

Expected: 강제 옵션 없이 push가 성공하고 원격 `main`과 `HEAD`가 같다.

### Task 8: Windows VDI RC를 빌드·배포하고 내려받는다

**Files:**
- Remote tag: `v2.0.0-rc.1`
- GitHub prerelease assets
- Download outside repository: `/Volumes/doublejun/Memoji-VDI-Releases/v2.0.0-rc.1/`

**Interfaces:**
- Consumes: 원격 `main`, Windows VDI workflow
- Produces: 내려받아 VDI로 옮길 수 있는 실행물·모델 조각·체크섬

- [ ] **Step 1: RC 태그를 만들고 푸시한다**

Run:

```bash
git tag -a v2.0.0-rc.1 HEAD -m "Memoji 2.0 unsigned Windows VDI pilot"
git push origin refs/tags/v2.0.0-rc.1
```

- [ ] **Step 2: Windows VDI 워크플로를 끝까지 감시한다**

Run:

```bash
gh run list --repo doublejun80/Memoji --workflow windows-vdi-pilot.yml --limit 5
gh run watch --repo doublejun80/Memoji <run-id> --exit-status
```

Expected: Windows 품질 검사, 모델 다운로드, Tauri build, 실제 생성 smoke, 분할 패키징, prerelease upload가 성공한다.

- [ ] **Step 3: prerelease와 자산 크기를 확인한다**

Run:

```bash
gh release view v2.0.0-rc.1 --repo doublejun80/Memoji --json isPrerelease,isDraft,assets,url
```

Expected: `isPrerelease=true`, `isDraft=false`, 모든 자산이 2,000,000,000 bytes 미만이다.

- [ ] **Step 4: VDI 전달 폴더로 자산을 내려받는다**

Run:

```bash
mkdir -p /Volumes/doublejun/Memoji-VDI-Releases/v2.0.0-rc.1
gh release download v2.0.0-rc.1 --repo doublejun80/Memoji --dir /Volumes/doublejun/Memoji-VDI-Releases/v2.0.0-rc.1
```

- [ ] **Step 5: 내려받은 자산을 검증한다**

Use the downloaded `SHA256SUMS` to verify every core zip, model part, manifest, and assembly script. Extract the core zip on a local staging folder and confirm `Memoji.exe`, `memoji-vdi-benchmark.exe`, `litert-lm.dll`, Korean README, SBOM, and `Assemble-Memoji-VDI.ps1` exist.

### Task 9: 최종 상태와 미검증 경계를 문서화한다

**Files:**
- Create: `docs/implementation/memoji-2-windows-vdi-rc1-release.md`
- Modify: `MEMOJI_2_GA_IMPLEMENTATION_REPORT.md`

**Interfaces:**
- Consumes: 실제 커밋, CI run URL, 릴리즈 URL, 자산 해시, 로컬 앱 버전
- Produces: 사용자가 재현할 수 있는 릴리즈·롤백·VDI 시험 안내

- [ ] **Step 1: 실제 결과만 기록한다**

Document:

- legacy branch/tag commit;
- new `main` commit;
- macOS installed app version and backup path;
- CI run and prerelease URLs;
- downloaded Windows assets and SHA-256 values;
- Windows VDI에서 실행할 benchmark 명령;
- Authenticode와 대상 VDI/EDR 검증이 남았다는 제한.

- [ ] **Step 2: 문서 링크와 표현을 검사한다**

Run:

```bash
rg -n 'GA 완료|정식 배포 완료|서명 완료' docs/implementation/memoji-2-windows-vdi-rc1-release.md MEMOJI_2_GA_IMPLEMENTATION_REPORT.md
git diff --check
```

Expected: 미검증 GA 주장이 없고 Markdown diff 오류가 없다.

- [ ] **Step 3: 최종 문서를 커밋하고 main에 푸시한다**

```bash
git add docs/implementation/memoji-2-windows-vdi-rc1-release.md MEMOJI_2_GA_IMPLEMENTATION_REPORT.md
git commit -m "docs: publish Memoji 2.0 VDI pilot handoff"
git push origin HEAD:main
```

- [ ] **Step 4: 완료 직전 전체 검증을 반복한다**

Run:

```bash
npm run check
cargo fmt --all --manifest-path src-tauri/Cargo.toml -- --check
cargo clippy --manifest-path src-tauri/Cargo.toml --all-targets --all-features -- -D warnings
cargo test --manifest-path src-tauri/Cargo.toml --locked
git status --short
gh release view v2.0.0-rc.1 --repo doublejun80/Memoji
```

Expected: 로컬 코드 검사 통과, 추적 변경 없음, prerelease 자산 다운로드 가능. 대상 Windows VDI 실행 결과만 사용자 측 후속 승인 항목으로 남는다.
