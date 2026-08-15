# 05. 비기능 요구사항

## 1. VDI 환경

### NFR-VDI-001 영구 데이터 경로

- App이 시작할 때 Data Root를 한 번 결정한다.
- Session 중 Data Root가 바뀌지 않는다.
- `MEMOJI_DATA_PATH`가 있으면 관리자 정책을 우선한다.
- Writable Probe를 실행한다.
- 비영구 Profile 경로면 Warning을 표시할 수 있어야 한다.

### NFR-VDI-002 Local Disk 우선

AI Model과 Runtime Cache는 Network Drive보다 Local Writable Disk를 우선한다. 사용자 원본 DB는 관리 정책에 따라 영구 경로를 사용한다.

### NFR-VDI-003 CPU Feature

Runtime과 Build의 AVX2, AVX-512, FMA, F16C를 구분한다. `target-cpu=native` 단일 배포를 금지한다.

권장 Build Flavor:

- `windows-vdi-avx2`
- `windows-vdi-avx512`
- `windows-portable-safe`

### NFR-VDI-004 다중 Session

한 OS에 여러 사용자가 접속하는 환경에서는 사용자별 3~5GB Model 중복 로드 여부를 측정한다. 공용 Runtime을 쓸 경우 Request Context와 파일 접근을 사용자별로 격리한다.

## 2. 성능 목표

| 지표 | 목표 |
|---|---|
| Shell Interactive | AI Model Load 제외 2초 이내 |
| Page List First Paint | 300ms 이내 |
| Page Body Open | p95 200ms 이내, 1MB 이하 Page |
| Search | 10,000 Page Warm p95 150ms 이내 |
| Panel Toggle | 100ms 이내 |
| Typing Input Delay | p95 50ms 미만 |
| Autosave Debounce | 기본 500~800ms |
| Save Flush | 일반 Page p95 300ms 이내 |
| Context Tab Change | 100ms 이내 |
| AI Stream UI Update | 16~50ms Batch |
| App Core Idle Memory | AI Runtime 제외 측정 |
| AI Peak RSS | Model Profile별 별도 기준 |

검색 목표는 실제 한국어 Content와 10,000 Page Fixture로 검증한다.

## 3. AI Benchmark

측정 조합:

| 변수 | 값 |
|---|---|
| Model | E2B QAT Q4, E4B QAT Q4 |
| Runtime | LiteRT-LM, Candle |
| MTP | Off, Verified On |
| State | Cold, Warm |
| Prompt | 256, 1024, 4096 Token |
| Output | 64, 256, 512 Token |
| Thread | 2, 4, Physical Core |
| Context | 2K, 4K, 8K |
| Storage | Local Disk, Managed Profile Disk |
| Load | Idle, Normal Office Load |

수집:

- Load ms
- TTFT
- Prefill TPS
- Decode TPS
- Total ms
- Peak RSS
- CPU
- Page Fault
- MTP Acceptance
- Cancellation Recovery
- Runtime Restart

10회 측정하고 Median과 p95를 기록한다. 1회 16 Token 평균만으로 Runtime을 판정하지 않는다.

## 4. 데이터 무결성

### NFR-DATA-001

사용자에게 `저장됨`을 표시한 Content는 App Process가 종료돼도 복구돼야 한다.

### NFR-DATA-002

Page Save는 다음을 한 Transaction으로 처리한다.

1. Page UPSERT
2. Revision INSERT
3. Index Job INSERT

### NFR-DATA-003

Derived Index 실패는 Markdown Save를 잃게 하지 않는다. Job을 실패 상태로 남기고 재시도한다.

### NFR-DATA-004

Migration 전:

1. `PRAGMA quick_check`
2. Backup
3. Backup SHA256
4. Migration
5. Count/Hash 검증
6. 실패 시 Rollback

### NFR-DATA-005

AI Proposal은 `baseRevision`과 현재 Revision이 다르면 적용되지 않는다.

## 5. 보안

| ID | 규칙 |
|---|---|
| NFR-SEC-001 | 기본 Outbound Network 없음 |
| NFR-SEC-002 | AI Endpoint Loopback Only |
| NFR-SEC-003 | Redirect 비활성화 |
| NFR-SEC-004 | Managed Runtime Token 인증 |
| NFR-SEC-005 | CSP 최소 권한 |
| NFR-SEC-006 | Prompt·본문 일반 로그 금지 |
| NFR-SEC-007 | Runtime/Model SHA256 |
| NFR-SEC-008 | Signed Bundle |
| NFR-SEC-009 | Dependency Audit |
| NFR-SEC-010 | Diagnostic Export에서 본문 제외 |

Runtime Error Body는 길이를 제한하고 Token/Secret 형태를 Redact한다.

## 6. 접근성

- WCAG 2.2 AA Contrast
- 모든 기능 Keyboard 사용
- Icon-only 버튼 Tooltip과 `aria-label`
- Dialog Focus Trap
- `Escape` 닫기
- Focus Ring 제거 금지
- 색상만으로 상태 전달 금지
- Text Zoom 125%에서 기능 손실 없음
- Persistent Text 11px 미만 금지
- Click Target 28px 이상, 주요 Action 32px 이상
- Motion Reduced 설정 존중

## 7. 반응형

800×600에서:

- Center가 Screen을 우선 차지한다.
- Left/Right는 Overlay로 열린다.
- Overlay 밖 클릭과 Escape로 닫힌다.
- Editor Header Action은 Overflow로 축소된다.
- Command Palette Width는 Viewport-32px 이하이다.
- Dialog Footer가 화면 밖으로 나가지 않는다.

## 8. 유지보수

- 한 React 파일 500줄 초과 시 분리 검토
- 제품 CSS와 Tailwind Build Output 분리
- Tauri Command Name 중앙화
- DB Query는 Repository 계층
- Migration은 Immutable File
- Feature Flag에 Version과 Removal Plan
- Error Code를 String Parsing에 의존하지 않음
- Public Type에 JSDoc 또는 Rust Doc

## 9. 품질 Gate

### Frontend

```bash
npm ci
npm run type-check
npm run test:unit
npm run build
```

UI Test 도입 후:

```bash
npm run test
npm run test:ui
```

### Rust

```bash
cd src-tauri
cargo fmt --check
cargo clippy --all-targets --all-features -- -D warnings
cargo test
```

### Security

```bash
npm audit --omit=dev
cargo audit
```

`cargo audit` 설치가 필요한 경우 CI에 고정 Version으로 추가한다.

### VDI

- Fresh User
- Existing DB
- Non-persistent Profile
- Network Drive DB
- CPU Feature 제한
- Runtime Port 충돌
- EDR 차단
- Model 누락
- Runtime 비정상 종료
- Session Disconnect/Reconnect

## 10. 로그

운영 로그에 허용:

- Timestamp
- App Version
- OS/Arch
- Runtime Kind
- Error Code
- Request ID
- Token Count
- Duration
- File Size
- Migration Version

기본 금지:

- Page Title
- Markdown Body
- Prompt
- AI Response
- Person/Supplier 이름
- Attachment Text
- API Key

사용자가 진단 Export를 만들 때도 본문은 기본 제외한다.
