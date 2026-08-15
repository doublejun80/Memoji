# 10. 마이그레이션과 Release 계획

## 1. Version 판단

현재 Package, Cargo, Tauri가 이미 `2.0.0`이다.

처리:

- 외부 정식 2.0 미배포: `2.0.0-rc.1`부터 검증 후 `2.0.0`
- 이미 2.0.0 배포: 이번 구조 변경은 `2.1.0` 또는 Schema 규모에 따라 `3.0.0`
- 같은 `2.0.0` 이름으로 다른 DB Schema와 Bundle을 재배포하지 않는다.

## 2. Phase

### Phase 0 · Baseline

1. PR #1 Head 확인
2. Baseline Branch 생성
3. 기존 Check 실행
4. PR #1 Reliability 목록 확인
5. UI Snapshot과 DB Fixture 생성

Exit:

- Baseline Test 결과 기록
- Work Branch 생성
- 기존 User 변경 보존

### Phase 1 · Shell

1. AppShell
2. Panel Layout
3. Responsive Overlay
4. UI State Persist
5. Top Command Bar
6. Context Hub Empty Shell

Exit:

- 1440/1200/1024/800 Viewport
- 기존 Editor와 Sidebar 사용 가능
- Save Flush 회귀 없음

### Phase 2 · Command와 Context

1. Command Registry
2. Ctrl+K
3. Search UI 통합
4. Outline
5. Properties Empty State
6. Links/Tasks Empty State

Exit:

- 기존 SearchModal과 RightPanel 검색 제거 가능
- AI Tab 전체 높이

### Phase 3 · AI Safety

1. Cancellation
2. Proposal Type
3. Diff
4. Revision Guard
5. Citation UI
6. AI Component 분리

Exit:

- 직접 Replace 제거
- Conflict Test 통과

### Phase 4 · DB V3

1. Migration Framework
2. Node/Page/Revision
3. Tag/Link
4. FTS
5. Page Summary/Body API
6. Legacy Migration

Exit:

- 기존 DB 자동 Backup
- Count/Hash 검증
- 전체 Page Body 초기 Load 제거

### Phase 5 · Task/Calendar

1. Task Parser
2. Stable Marker
3. Task View
4. Due/Project/Status
5. Calendar Month/Week/Day
6. Task/Event 통합

Exit:

- Task View 변경과 Markdown Sync
- Calendar 기본 기능

### Phase 6 · Runtime

1. Runtime Adapter
2. Capability
3. Health
4. Cancellation
5. Benchmark V2
6. LiteRT-LM 0.16 Compatibility Branch

Exit:

- 단순 Streaming과 MTP 명칭 분리
- Diagnostic Export

### Phase 7 · Hardening

1. Performance
2. Accessibility
3. Security
4. VDI
5. Data Recovery
6. Release Workflow

Exit:

- GA Release Gate 통과
- 미검증 항목 명시

### Phase 8 · 2.1

- Object Type
- Property
- Relation
- Saved View
- RAG
- Meeting Knowledge
- Supplier/Item/RFP Template

## 3. DB Migration 절차

```text
App Start
  ↓
현재 Schema 확인
  ↓
Migration 필요?
  ├─ 아니오 → 정상 시작
  └─ 예
      ↓
    Writable 확인
      ↓
    quick_check
      ↓
    Backup+SHA256
      ↓
    BEGIN IMMEDIATE
      ↓
    Schema/Table 생성
      ↓
    데이터 Migration
      ↓
    Count/Hash 검증
      ↓
    schema_migrations INSERT
      ↓
    COMMIT
      ↓
    전체 Reindex Job
```

실패:

- Transaction Rollback
- 원본 DB 유지
- Backup 경로 표시
- Error Code와 Log
- App은 Read-only Recovery Mode 또는 종료

## 4. Migration Fixture

최소 Fixture:

1. 빈 DB
2. Page 1개
3. Daily 100개
4. Project Tree 5단계
5. Parent Cycle 손상 DB
6. 동일 Tag 중복
7. Wiki Link 해결/미해결
8. Checkbox 1,000개
9. 10MB Page
10. 오래된 Column 누락 DB
11. Import 충돌 ID
12. 한글·Emoji·Code Block

검증:

```text
before.pages == after.pages
before.content_hashes == after.content_hashes
after.orphans == 0
after.cycles == 0
after.schema_version == 3
```

Cycle은 자동 삭제하지 않고 Root로 이동하거나 Migration Report에 남긴다.

## 5. Runtime Upgrade

PR #1의 `0.13.1`은 현재 검증 자산이다. `0.16.0`으로 올릴 때 별도 Branch:

```bash
git switch -c codex/litert-lm-0.16-compat codex/memoji-2-ga-uiux
```

확인 후 Merge한다. 단순 Package Version 문자열 변경 Commit을 GA Branch에 직접 넣지 않는다.

## 6. Release Workflow

### PR Gate

```yaml
- npm ci
- npm run check
- cargo fmt --check
- cargo clippy --all-targets --all-features -- -D warnings
- cargo test
- migration fixture tests
- UI component tests
- security audit
```

### Release Build

Build Matrix:

- Windows x64 AVX2
- Windows x64 Safe
- Windows x64 AVX-512 선택
- macOS/Linux는 Core App 지원 범위를 별도 결정

### Artifact

```text
release/
├── Memoji-<version>-windows-x64-avx2.exe
├── Memoji-<version>-windows-x64-safe.exe
├── Memoji-<version>-windows-x64-setup.exe
├── Memoji-<version>-vdi-ai-bundle.zip
├── checksums.sha256
├── sbom.spdx.json
├── NOTICE.txt
└── RELEASE_NOTES.md
```

Version은 `package.json` 또는 Tauri Config에서 읽는다. Workflow에 `2.0.0`을 직접 쓰지 않는다.

## 7. 서명

서명 대상:

- Memoji.exe
- Installer
- Managed Runtime Executable
- Native DLL
- Update Manifest

모델 파일은 Code Sign 대신 SHA256 Manifest를 사용한다.

## 8. Rollback

App Rollback:

1. 이전 Installer
2. 이전 Runtime Bundle
3. Version Manifest

DB Rollback:

- Migration 직전 Backup
- Schema Version 확인
- User 선택
- 최신 DB를 덮기 전에 다시 Backup

AI Runtime Rollback:

- `runtime-manifest.json`에 Active/Previous Version
- Start 실패 시 Previous로 1회 복귀
- Silent 무한 반복 금지

## 9. GA 운영 Checklist

- [ ] Existing DB Migration
- [ ] Fresh Install
- [ ] VDI Persistent Path
- [ ] VDI Non-persistent Path Warning
- [ ] EDR
- [ ] WebView2
- [ ] Runtime Port Conflict
- [ ] Model Missing
- [ ] Runtime Crash
- [ ] Session Disconnect
- [ ] Offline
- [ ] 800×600
- [ ] 125% Display Scale
- [ ] Korean IME
- [ ] Large Markdown
- [ ] Export/Import
- [ ] Backup Restore

## 10. Release Note에 명시할 것

1. Markdown 원본 유지
2. DB 자동 Backup
3. 검색 Index 재구성 시간
4. AI Runtime 크기
5. 지원 VDI 사양
6. 실제 MTP 지원 여부
7. Migration Rollback 위치
8. 알려진 제한
9. Data Collection 없음
10. Cloud 연결 없음
