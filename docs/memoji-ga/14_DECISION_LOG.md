# 14. 설계 결정 기록

## ADR-001 · 현재 3단 골격 유지

상태: 승인

결정:

- Left Navigation
- Center Workspace
- Right Context Hub

이유:

- 현재 사용 습관 유지
- 문서와 AI 동시 사용
- Desktop/VDI에 적합

기각:

- Notion식 전체 Page Dashboard
- Tana식 완전 Outliner
- AI 별도 Window만 사용

## ADR-002 · 우측 Search+AI Stack 제거

상태: 승인

결정:

- Search는 Ctrl+K
- Right는 Tab Context Hub
- Search 고정이 필요하면 임시 Tab

이유:

- 검색하지 않을 때 공간 낭비
- AI 응답 높이 부족
- Outline/Backlink/Task/Properties 수용 필요

## ADR-003 · Left Icon Rail을 별도로 추가하지 않음

상태: 승인

결정:

현재 Sidebar 안에 6개 View Switcher를 배치한다.

이유:

- 별도 40~48px Rail은 중앙 폭을 더 줄임
- 1200px VDI에서 비효율
- 현재 Daily/Project Tab과 자연스럽게 연결

## ADR-004 · 중앙은 Editor 전용이 아님

상태: 승인

결정:

Tasks, Calendar, Knowledge가 필요할 때 Center Workspace를 사용한다.

이유:

- 부가기능을 Side Panel에 계속 압축하지 않음
- Task/Calendar는 넓은 화면 필요
- Page를 열면 Editor로 복귀

## ADR-005 · Markdown 원본 유지

상태: 승인

결정:

Page 본문은 Markdown 문자열이다.

이유:

- Export/복구
- VDI
- 기존 코드 재사용
- Tool Lock-in 감소

기각:

- 모든 Block을 개별 Row로 저장
- ProseMirror JSON만 원본으로 저장

## ADR-006 · Derived Index

상태: 승인

Tag, Link, Task, Chunk, FTS는 Markdown에서 재생성한다.

이유:

- Index 손상 복구
- AI 실패와 원본 저장 분리
- Migration 단순화

## ADR-007 · AI Proposal

상태: 승인

Replace/Structure 변경은 Proposal과 Diff를 거친다.

이유:

- 동일 문자열 오치환
- 오래된 AI 결과
- Revision 충돌
- 업무 문서 신뢰성

Insert-only 변경은 위치 확인 후 직접 삽입 가능하다.

## ADR-008 · 실제 MTP만 MTP로 표시

상태: 승인

결정:

Target, Assistant, Draft Verification, Acceptance가 Runtime Capability로 확인돼야 한다.

이유:

현재 Local HTTP Streaming은 MTP와 다르다. 이름이 속도를 보장해서는 안 된다.

## ADR-009 · FTS 우선, Embedding 후순위

상태: 승인

결정:

GA는 FTS+Link+Project Scoring으로 RAG를 구성한다.

이유:

- VDI 메모리
- 구현 안정성
- Explainability
- 한국어 업무 문서에서 정확한 Keyword가 중요

Embedding은 2.2에서 Benchmark 후 도입한다.

## ADR-010 · 신규 Global State Library 보류

상태: 승인

결정:

Context+Reducer+Controller로 App State를 먼저 분리한다.

이유:

- 현재 규모
- 신규 Dependency 최소화
- Domain State는 Backend Query가 중심

필요 시 Query Cache Library를 별도 ADR로 검토한다.

## ADR-011 · 기존 의존성 활용

상태: 승인

- `react-resizable-panels`
- `cmdk`
- Radix
- Milkdown
- Sonner

추가 UI Framework를 도입하지 않는다.

## ADR-012 · PR #1 Baseline

상태: 승인

대규모 변경은 PR #1의 저장·VDI 안정화가 포함된 기준에서 시작한다.

이유:

- `flushUnsaved()`
- Save Queue
- Settings 개선
- Runtime Manager
- Stream Batch

## ADR-013 · LiteRT-LM 0.16은 검증 후

상태: 승인

결정:

PR #1 0.13.1을 바로 0.16.0으로 바꾸지 않고 Compatibility Branch를 사용한다.

이유:

- CLI/API 변경
- Bundle Script
- Model 호환
- Windows Asset
- EDR
- Rollback 필요

## ADR-014 · 800×600 지원

상태: 승인

결정:

작은 화면에서 Side Panel을 Overlay로 전환한다.

기각:

- 최소 Window를 1200으로 올리는 방법

이유:

VDI 창 크기와 Remote Session 제약을 고려해야 한다.

## ADR-015 · Object Type는 2.1

상태: 승인

GA에는 Schema 확장 가능 구조를 넣되 전체 UI는 2.1로 넘긴다.

이유:

- GA Blocker인 저장·검색·Task·AI Safety가 먼저
- 범위 폭발 방지

## ADR-016 · Search Command 통합

상태: 승인

Command Registry가 TopBar, Keyboard, Palette를 공유한다.

이유:

- 같은 Action 중복 구현 방지
- Keyboard-first
- 기능 발견성
