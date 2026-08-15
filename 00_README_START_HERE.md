# Memoji 2.0 GA · Codex 실행 패키지

작성 기준일: **2026-08-14**  
대상 저장소: `doublejun80/Memoji`  
권장 기준 브랜치: **PR #1 `codex/review-settings-vdi-performance` 검증본**

이 패키지는 현재 Memoji의 좌측 탐색–중앙 Markdown 편집–우측 검색/AI 구조를 유지하면서, 기능이 늘어나도 화면이 무너지지 않도록 프런트엔드와 데이터 구조를 재설계한 실행 자료다. 단순 아이디어 목록이 아니라 Codex가 저장소에서 바로 작업을 시작할 수 있도록 파일 경로, 타입, 상태 모델, 마이그레이션 순서, 테스트 명령과 단계별 프롬프트를 포함한다.

## 1. 먼저 볼 파일

| 순번 | 파일 | 용도 |
|---:|---|---|
| 1 | `CODEX_RUN_PROMPT.md` | Codex에 그대로 붙여 넣는 전체 실행 명령 |
| 2 | `AGENTS.md` | 구현 중 반드시 지켜야 할 프로젝트 규칙 |
| 3 | `docs/memoji-ga/01_CURRENT_UI_AUDIT.md` | 현재 화면 코드 구조와 문제점 |
| 4 | `docs/memoji-ga/02_UIUX_TARGET_SPEC.md` | 유지할 화면과 목표 UI/UX |
| 5 | `docs/superpowers/specs/2026-08-14-memoji-2-0-ga-uiux-design.md` | 승인된 제품·화면 설계 사양 |
| 6 | `docs/superpowers/plans/2026-08-14-memoji-2-0-ga-implementation-plan.md` | 파일 단위 구현 계획 |
| 7 | `prototype/memoji-ga-shell.html` | 목표 화면 인터랙티브 프로토타입 |
| 8 | `requirements/memoji-ga-requirements.yaml` | Codex가 읽기 쉬운 요구사항 원본 |

## 2. 권장 사용 방법

### 방법 A: 패키지를 저장소 루트에 풀고 전체 실행

```powershell
cd <Memoji 저장소>
Expand-Archive .\Memoji_2_0_GA_Codex_Package.zip -DestinationPath . -Force
```

그다음 `CODEX_RUN_PROMPT.md`의 본문을 Codex에 붙여 넣는다.

### 방법 B: 먼저 화면만 검토

```powershell
start .\prototype\current-layout.html
start .\prototype\memoji-ga-shell.html
```

프로토타입은 외부 CDN이나 네트워크 요청이 없는 단일 로컬 화면이다. 좌·우 패널, 업무 보기, Context Hub 탭, `Ctrl+K` Command Palette가 동작한다.

## 3. 핵심 설계 판단

1. **현재 3단 구조는 유지한다.**
2. 좌측 패널은 페이지 트리만 늘리지 않고 `오늘·데일리·프로젝트·할 일·일정·지식` 보기를 전환한다.
3. 중앙은 항상 문서 편집기만 두지 않고 `Editor·Tasks·Calendar·Knowledge·Search` Workspace로 전환한다.
4. 우측 검색과 AI의 고정 세로 분할을 제거하고 `AI·목차·링크·할 일·속성` Context Hub로 바꾼다.
5. 검색은 `Ctrl+K` 통합 검색·명령창으로 이동한다.
6. AI의 문장 치환은 즉시 적용하지 않고 `baseRevision + Diff + 명시적 승인` 흐름을 사용한다.
7. Markdown은 계속 원본이다. 태그·링크·할 일·Chunk·FTS는 재생성 가능한 파생 인덱스다.
8. PR #1의 자동 저장 직렬화, 종료 전 Flush, VDI 데이터 경로, LiteRT-LM 관리 코드는 되돌리지 않는다.

## 4. 포함 자료

```text
Memoji_2_0_GA_Codex_Package/
├── 00_README_START_HERE.md
├── AGENTS.md
├── CODEX_RUN_PROMPT.md
├── docs/memoji-ga/                 # 분석·요구사항·아키텍처·ERD
├── docs/superpowers/specs/         # 확정 설계
├── docs/superpowers/plans/         # Codex 구현계획
├── .codex/prompts/                 # 단계별 재실행 프롬프트
├── diagrams/                       # Mermaid 원본
├── prototype/                      # 현재/목표 UI 프로토타입과 이미지
├── requirements/                   # 기계 판독 요구사항
├── checklists/                     # UI·VDI·릴리스 검증표
└── manifest.json
```

## 5. 기준 브랜치 주의

`main`에는 PR #1의 저장 안정성 및 VDI Runtime 개선이 병합되지 않은 상태일 수 있다. 대규모 UI 변경을 오래된 `main`에서 바로 시작하면 다음 변경을 다시 구현하거나 잃을 수 있다.

- 페이지·날짜·설정·내보내기·창 닫기 전 `flushUnsaved()`
- 직렬 저장 Queue
- Settings 2-pane UX
- LiteRT-LM 관리 프로세스
- SSE UTF-8 처리 및 React 스트림 배치
- VDI 데이터 경로 안정화

Codex는 먼저 PR #1을 기준으로 작업 브랜치를 구성하고, 실제 Windows VDI 검증이 안 된 항목은 구현 완료와 운영 검증을 구분해 보고해야 한다.

## 6. 결과물 기준

완료된 구현은 최소한 다음을 만족해야 한다.

- 1200×800에서 기존 Memoji의 익숙한 3단 구조가 유지된다.
- 800×600에서도 중앙 작업 영역을 사용할 수 있다.
- 우측 AI가 검색 결과 때문에 잘리지 않는다.
- `Ctrl+K`에서 페이지·명령·할 일을 찾는다.
- AI 변경 제안은 Revision 충돌 시 적용되지 않는다.
- 기존 `memoji.db`는 사전 백업 후 마이그레이션된다.
- 기본 프로필에서 외부 네트워크를 사용하지 않는다.
- `npm run check`, `cargo fmt --check`, `cargo clippy`, `cargo test`가 통과한다.
