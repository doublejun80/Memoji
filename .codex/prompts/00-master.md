# Codex Master Prompt · Memoji 2.0 GA

당신은 `doublejun80/Memoji` 저장소에서 Memoji 2.0 GA를 구현하는 Principal Engineer다. 현재 저장소에 이 패키지의 `AGENTS.md`, `docs/memoji-ga/`, `docs/superpowers/`, `.codex/prompts/`, `requirements/`, `diagrams/`가 존재한다고 가정한다.

## 목표

현재 Memoji의 3단 화면 골격과 Markdown 편집 경험을 보존하면서 다음을 구현한다.

1. Resizable 3-pane App Shell
2. 좌측 `오늘·데일리·프로젝트·할 일·일정·지식` 보기
3. 중앙 `Editor·Tasks·Calendar·Knowledge·Search` Workspace
4. 우측 `AI·Outline·Links·Tasks·Properties` Context Hub
5. `Ctrl+K` 통합 검색·명령 Palette
6. Page Revision, SQLite FTS5, Tags, Links, Tasks, Events 기반 DB V3
7. AI Proposal, Diff 승인, Citation, Cancellation, Runtime Capability
8. PR #1의 Autosave/Flush/VDI Runtime 안정성 보존
9. 기본 완전 오프라인 및 Loopback-only AI
10. Windows VDI GA Release Gate

## 읽기 순서

작업 전에 반드시 다음 파일을 순서대로 읽는다.

1. `AGENTS.md`
2. `00_README_START_HERE.md`
3. `docs/memoji-ga/01_CURRENT_UI_AUDIT.md`
4. `docs/memoji-ga/02_UIUX_TARGET_SPEC.md`
5. `docs/memoji-ga/04_FUNCTIONAL_REQUIREMENTS.md`
6. `docs/memoji-ga/05_NON_FUNCTIONAL_REQUIREMENTS.md`
7. `docs/memoji-ga/06_FRONTEND_ARCHITECTURE.md`
8. `docs/memoji-ga/07_DATA_MODEL_AND_ERD.md`
9. `docs/memoji-ga/09_AI_UX_AND_RUNTIME.md`
10. `docs/superpowers/specs/2026-08-14-memoji-2-0-ga-uiux-design.md`
11. `docs/superpowers/plans/2026-08-14-memoji-2-0-ga-implementation-plan.md`
12. `requirements/memoji-ga-requirements.yaml`

## 기준 Branch 구성

현재 Branch에서 바로 대규모 변경을 시작하지 않는다.

```bash
git status --short
git remote -v
git fetch origin
git fetch origin pull/1/head:memoji-pr1-baseline
git switch -c codex/memoji-2-ga-uiux memoji-pr1-baseline
```

이미 동명의 Branch가 있다면 새 Branch를 만들지 말고 상태와 Commit을 확인한다. 사용자 변경을 삭제하지 않는다. PR #1 Head를 가져오지 못하면 현재 Branch가 PR #1 변경을 포함하는지 `MarkdownEditorHandle.flushUnsaved`, `local_ai_managed_runtime_status`, 2-pane Settings 코드로 확인한다.

## 실행 방식

`docs/superpowers/plans/2026-08-14-memoji-2-0-ga-implementation-plan.md`의 Task 순서대로 작업한다.

각 Task마다 다음 절차를 지킨다.

1. 실패 테스트 또는 검증 스크립트 작성
2. 최소 구현
3. 대상 테스트 실행
4. 전체 관련 테스트 실행
5. Diff 검토
6. 작은 Commit 생성
7. 다음 Task 진행

외부 인증서, 실제 모델 파일, Windows Golden Image처럼 환경상 없는 항목 외에는 중간 승인을 기다리지 말고 끝까지 진행한다. 환경 검증이 불가능한 경우 코드를 임의로 성공 처리하지 말고 `MEMOJI_2_GA_IMPLEMENTATION_REPORT.md`에 정확히 기록한다.

## 중요한 금지사항

- PR #1의 저장 Queue, `flushUnsaved()`, 종료 보호를 제거하지 않는다.
- Markdown Source of Truth를 Block DB로 교체하지 않는다.
- Cloud AI Provider를 추가하지 않는다.
- `draft_model` 문자열이 있다는 이유만으로 UI에 MTP를 표시하지 않는다.
- AI 치환을 즉시 원문에 적용하지 않는다.
- 기존 DB를 사전 백업 없이 Migration하지 않는다.
- UI를 Card Dashboard 형태로 전면 변경하지 않는다.
- 10px 이하의 지속 표시 텍스트를 만들지 않는다.
- 기존 사용자 데이터를 Test Fixture로 덮지 않는다.
- 실제 VDI Test를 하지 않았는데 “VDI 검증 완료”라고 쓰지 않는다.

## 필수 검증

```bash
npm ci
npm run check

cd src-tauri
cargo fmt --check
cargo clippy --all-targets --all-features -- -D warnings
cargo test
```

추가한 Script가 있으면 Windows PowerShell에서도 실행 가능한지 확인한다.

UI는 다음 Viewport에서 확인하고 Screenshot을 저장한다.

```text
artifacts/ui/1440x900/
artifacts/ui/1200x800/
artifacts/ui/1024x768/
artifacts/ui/800x600/
```

검증할 핵심 흐름:

1. 페이지 작성 → 자동 저장 → 페이지 전환 → 복귀
2. 앱 종료 직전 입력 → 재실행 → 내용 유지
3. Ctrl+K → 페이지 검색 → 이동
4. 좌측 업무 보기 전환
5. Context Hub 탭 전환
6. AI 생성 → 취소
7. AI Proposal → Diff → 적용
8. Proposal 생성 후 원문 변경 → Revision 충돌 차단
9. 기존 DB Migration → Page/Tag/Link/Task 수 검증
10. LiteRT Runtime 실패 → Candle 또는 오류 안내

## LiteRT-LM 버전 처리

PR #1의 번들은 `0.13.1` 기준이다. 기준일 현재 공식 최신 Release는 `0.16.0`이다. 그러나 버전 문자열만 올리지 않는다.

별도 Compatibility 작업에서 다음을 확인한다.

1. Windows 배포 자산 존재 여부
2. PR의 Python/CLI Process Manager와 CLI 인자 호환성
3. `/v1/models`와 `/v1/chat/completions` 동작
4. 기존 `.litertlm` 모델 호환성
5. Cold/Warm Load, TTFT, Decode TPS, Peak RSS
6. Bundled Runtime 전체 SHA256
7. 실패 시 0.13.1 Rollback

0.16.0이 Windows VDI에서 검증되지 않으면 기본 번들은 0.13.1을 유지하고, 보고서에 Upgrade Candidate로 남긴다.

## 완료 산출물

저장소에 다음 결과를 남긴다.

- 구현 코드 및 Migration
- 신규·수정 테스트
- `MEMOJI_2_GA_IMPLEMENTATION_REPORT.md`
- `artifacts/ui/` Screenshot
- `artifacts/benchmark/` Benchmark JSON/Markdown
- `artifacts/migration/` Migration 검증 결과
- Release Gate 결과

마지막 응답에는 Commit 목록, 테스트 결과, 미검증 VDI 항목, 남은 P1/P2 요구사항을 정확히 보고한다.
