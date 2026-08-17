# Memoji 2.0 Windows VDI RC 전환 기록

작성일: 2026-08-17 (Asia/Seoul)

## 결론

Memoji의 현행 소스와 GitHub 기본 브랜치는 React/TypeScript, Tauri/Rust, SQLite,
Milkdown, LiteRT-LM 0.16.0 C API 기반의 Memoji 2.0으로 전환했다. 구버전은 삭제 대신
복구 가능한 브랜치·태그·외부 보관본으로 봉인했다.

Windows VDI 배포 후보는 서명되지 않은 시험판으로만 만든다. GitHub Windows runner에서
Rust 품질 검증과 실제 `app.exe` 빌드는 통과했다. 다만 최종 분할 자산 게시와 대상 VDI의
EDR·실행·성능 검증은 아직 완료 전이므로 정식 GA 또는 서명 완료 상태로 판정하지 않는다.

## 1. 구버전 보관과 현행 기준선

| 항목 | 위치 또는 기준 |
|---|---|
| 구버전 최종 커밋 | `e71aa2d4d2db67657d18244f35065a4b080b24f8` |
| 구버전 원격 브랜치 | `archive/memoji-v1-final` |
| 구버전 원격 태그 | `v1.0.0-legacy` |
| 현행 GitHub 기본 브랜치 | `main` — Memoji 2.0 전용 |
| 개발 이력 브랜치 | `codex/memoji-2-ga-uiux` |
| 프로젝트 생성물 보관 | `/Volumes/doublejun/Memoji-archive/2026-08-17/project-artifacts/` |
| 구버전 앱·DB 보관 | `/Volumes/doublejun/Memoji-archive/2026-08-17/legacy-app/` |
| macOS 현행 앱 | `/Volumes/doublejun/application/Memoji.app` — 2.0.0 |
| macOS 현행 DB | `~/Library/Application Support/Memoji/data/memoji.db` |

기존 사용자 DB는 v1에서 v6으로 마이그레이션했다. 5개 페이지의 논리 콘텐츠 해시가
마이그레이션 전후 동일함을 확인했고, 변환 전 백업을 별도 보관했다. macOS 앱 설치 확인
화면은 `Memoji-2.0-installed-validation.png`로 구버전 보관 폴더에 남겼다.

## 2. Windows VDI 배포 구조

Windows 배포 후보는 GitHub Actions의 `windows-latest` MSVC 환경에서 생성한다.

- `Memoji.exe`: Tauri 2.0 본체
- `memoji-vdi-benchmark.exe`: VDI 성능 측정 도구
- `ai/runtime/lib/litert-lm.dll`: LiteRT-LM 0.16.0 C API
- `ai/models/...litertlm`: Gemma 4 E2B 오프라인 모델
- `ai/bundle-manifest.json`: 런타임·모델 버전, 크기, SHA-256, 라이선스 계약
- `README-VDI.txt`: 설치, 데이터 경로, 모델 조립, 벤치마크, 로그, 롤백 안내
- CycloneDX SBOM과 SHA-256 체크섬

GitHub Release의 파일당 2 GiB 제한을 피하기 위해 본체와 런타임은 core ZIP으로 묶고,
모델은 각 1,900,000,000바이트 이하의 `partNNN` 파일로 나눈다. 사용자는 core ZIP 안의
`Assemble-Memoji-VDI.ps1`을 실행해 모델을 스트리밍 결합하며, 결합 결과의 SHA-256이
manifest와 다르면 부분 결과를 삭제하고 실패 처리한다.

서명 인증서가 없는 배포는 `-AllowUnsigned`를 명시해야만 생성된다. 산출물에는
`UNSIGNED-VDI-PILOT.txt`가 포함되며 prerelease 이름에도 `Unsigned VDI Pilot`을 표시한다.
정식 `v2.0.0` 경로는 Authenticode 서명과 검증을 계속 강제한다.

## 3. RC 실행 이력과 수정 근거

### `v2.0.0-rc.1`

- GitHub Windows runner에서 Rust 테스트가 임시 DB 삭제 단계에서 실패했다.
- 원인은 Windows가 열린 SQLite 파일 핸들을 삭제하지 못하는 플랫폼 차이였다.
- 두 테스트에서 target connection을 정리 전에 명시적으로 `drop`하도록 수정했다.
- 수정 후 Windows Rust 품질 gate는 다음 후보에서 전부 통과했다.

### `v2.0.0-rc.2`

- 실행 기록: <https://github.com/doublejun80/Memoji/actions/runs/31962714845>
- Rust 품질 gate 통과: 26분 39초
- release profile `app.exe`와 `memoji-vdi-benchmark.exe` 실제 빌드 성공
- 전체 실행은 SBOM 생성 단계에서 `spawnSync npm ENOENT`로 실패
- 원인은 Windows에서 npm 실행 파일이 `npm.cmd`인 점을 고려하지 않은 플랫폼 호출이었다.
- Windows에서는 `npm.cmd`, 그 외 플랫폼에서는 `npm`을 사용하도록 수정했다.
- 로컬에서 SBOM 1,073개 구성요소 생성과 계약 테스트를 통과했다.

### `v2.0.0-rc.3`

- 실행 기록: <https://github.com/doublejun80/Memoji/actions/runs/32016984886>
- Windows Rust 품질 gate와 실제 `app.exe`·benchmark release 빌드는 다시 통과했다.
- `npm.cmd`를 직접 `spawnSync`한 SBOM 호출이 Node.js 22에서 `EINVAL`로 실패했다.
- 실패 후 Rust build cache를 정상 저장해 다음 후보가 재사용할 수 있게 했다.
- Windows에서는 배치 파일 대신 현재 `node.exe`가 함께 설치된 npm의 `npm-cli.js`를 직접
  실행하도록 변경했다. 이 방식은 `cmd.exe` shell·인자 quoting·배치 실행에 의존하지 않는다.

### 다음 RC

다음 RC에는 위 `npm-cli.js` 직접 실행 수정을 포함한다. 태그와 최종 Release URL, 자산
크기·체크섬은 실제 게시 성공 후 이 문서에 확정한다.

## 4. 현재 검증 결과

2026-08-17 현행 소스에서 다음 검사를 새로 실행했다.

```text
npm run check                                      PASS
cargo fmt --manifest-path src-tauri/Cargo.toml     PASS
cargo clippy --locked --all-targets -D warnings    PASS
cargo test --locked                                PASS
```

Rust 결과는 108개 통과(라이브 모델 자산이 필요한 3개 ignored 포함)이며 실패는 0개다.
프런트엔드 검사는 Vitest, TypeScript 검사와 Vite production build를 포함한다.

라이브 모델 테스트가 ignored인 것은 소스 저장소에 수 GiB 모델을 넣지 않기 때문이다.
Windows 전용 workflow는 모델과 런타임을 다운로드한 뒤 strict manifest 검증, 실제 1회 생성
smoke, 벤치마크를 실행하도록 구성했다.

## 5. 사용자 데이터와 롤백

- Windows 기본 portable 데이터는 실행물 옆 `data`에 저장하며 `MEMOJI_DATA_PATH`로 VDI
  영속 드라이브를 지정할 수 있다.
- 가져오기 전에 기존 DB를 백업하고, SQLite header·schema·quick check가 통과한 경우에만
  transaction으로 병합한다.
- 구버전 DB의 모든 page revision을 보존하며 충돌 ID는 덮어쓰지 않고 새 ID로 복제한다.
- 문제가 생기면 앱을 종료하고 `data/memoji.db`를 보관한 뒤 가장 최근 backup DB를 복사해
  되돌린다. 앱 자체는 core ZIP을 새 폴더에 다시 풀어 교체할 수 있다.

## 6. 아직 완료로 부르지 않는 항목

- Authenticode 서명 및 서명 체인 검증
- 실제 대상 Windows VDI에서 실행·종료·재실행 후 데이터 영속성 확인
- 대상 VDI EDR/보안 정책에서 DLL·모델 mmap·로컬 파일 접근 허용 확인
- cold/warm TTFT, TPS, peak RSS와 10회 반복 안정성 측정
- 실제 운영 VDI에 적합한 배포 위치와 `MEMOJI_DATA_PATH` 확정

따라서 이번 산출물의 정확한 등급은 **Windows x64 unsigned VDI 시험판**이다. GitHub
Windows runner의 네이티브 빌드와 모델 smoke가 성공하더라도, 대상 VDI 검증 전에는
`Signed GA` 또는 `VDI 검증 완료`로 표기하지 않는다.
