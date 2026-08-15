# 13. Design Token과 화면 문구

## 1. Layout Token

```css
:root {
  --memoji-topbar-height: 48px;
  --memoji-statusbar-height: 22px;

  --memoji-left-panel-default: 240px;
  --memoji-left-panel-min: 220px;
  --memoji-left-panel-max: 360px;

  --memoji-right-panel-default: 304px;
  --memoji-right-panel-min: 288px;
  --memoji-right-panel-max: 440px;

  --memoji-center-min: 560px;
  --memoji-editor-read-width: 760px;
  --memoji-editor-read-width-min: 560px;
  --memoji-editor-read-width-max: 860px;
}
```

## 2. Spacing

| Token | 값 | 용도 |
|---|---:|---|
| `space-1` | 4px | Icon 간격 |
| `space-2` | 8px | Control 내부 |
| `space-3` | 12px | Panel Padding |
| `space-4` | 16px | Section |
| `space-5` | 20px | 큰 Section |
| `space-6` | 24px | Dialog |
| `space-8` | 32px | Editor Section |

Panel 내부에 24px 이상 Padding을 반복 사용하지 않는다. VDI Desktop은 정보 밀도가 필요하다.

## 3. Radius

| 요소 | Radius |
|---|---:|
| Icon Button | 6px |
| Input | 6px |
| Panel Tab | 6px |
| Proposal | 8px |
| Dialog | 10px |
| Chip | 5px 또는 Pill |

Card마다 12~16px Radius를 사용해 모바일 UI처럼 보이지 않게 한다.

## 4. Typography

```css
:root {
  --font-ui: "Pretendard", "Noto Sans KR", "Malgun Gothic", "Segoe UI", sans-serif;
  --font-content: "Noto Sans KR", "Malgun Gothic", sans-serif;
  --font-mono: "D2Coding", "Cascadia Mono", Consolas, monospace;

  --text-status: 10px;
  --text-meta: 11px;
  --text-control: 12px;
  --text-sidebar: 12px;
  --text-body-ui: 13px;
  --text-editor: 16px;
  --text-title: 18px;
}
```

규칙:

- 8px 버튼 문구 금지
- 9px Persistent Label 금지
- Status와 Metadata만 10~11px 허용
- Editor Body 15~16px
- 한글 Line Height 1.65~1.8

## 5. Color Role

색상값 자체보다 역할을 사용한다.

```css
--background
--foreground
--surface
--surface-elevated
--muted
--muted-foreground
--border
--accent
--accent-foreground
--success
--warning
--destructive
--focus-ring
```

Status는 Icon+Text를 함께 쓴다.

## 6. Control 크기

| Control | 최소 |
|---|---:|
| Main Button | 32px |
| Icon Button | 30px |
| Compact Panel Button | 28px |
| Tab | 34px |
| Input | 32px |
| Composer | 64px |
| Click Target | 28×28px |

## 7. 문구 기준

### 7.1 저장

| 상황 | 문구 |
|---|---|
| 저장됨 | `저장됨` |
| 저장 중 | `저장 중` |
| 저장 실패 | `저장하지 못했습니다` |
| Conflict | `다른 변경이 있어 자동 저장하지 않았습니다` |
| Index | `인덱스 완료` |
| Index 대기 | `검색 인덱스 대기` |

`저장 성공했습니다!`처럼 매번 Toast를 띄우지 않는다. 수동 저장 또는 실패 때만 Toast를 사용한다.

### 7.2 AI

| 상황 | 문구 |
|---|---|
| 준비 | `로컬 AI 준비됨` |
| 시작 | `로컬 모델을 준비하는 중` |
| Retrieval | `관련 문서를 찾는 중` |
| 생성 | `답변 생성 중` |
| 취소 | `생성을 중단했습니다` |
| 서버 | `고속 로컬 AI 서버` |
| MTP | `MTP 활성`은 Capability 확인 시만 |
| 오류 | `로컬 AI에 연결하지 못했습니다` |
| Model 없음 | `AI 모델 파일이 없습니다` |
| Conflict | `문서가 변경돼 자동 적용하지 않았습니다` |

### 7.3 Proposal

| Action | 문구 |
|---|---|
| Preview | `Diff 보기` |
| Apply | `적용` |
| Partial | `선택 항목 적용` |
| Reject | `폐기` |
| Copy | `복사` |
| Recalculate | `새 Diff 계산` |
| Applied | `Revision 13에 적용됨` |

### 7.4 Empty State

- `페이지를 선택하거나 새 메모를 만드세요.`
- `이 보기의 할 일이 없습니다.`
- `아직 연결된 페이지가 없습니다.`
- `현재 문서에 제목이 없습니다.`
- `일치하는 페이지나 명령이 없습니다.`
- `원본 DB는 변경되지 않았습니다.`

## 8. Tooltip

Title Attribute만 사용하지 않고 Tooltip Component를 쓴다.

형식:

```text
현재 문서 요약
Ctrl+Shift+S
```

Tooltip Delay 400~600ms. 동일 Toolbar 안에서 연속 이동 시 즉시 표시.

## 9. Icon

Lucide를 기본으로 사용한다.

| 기능 | Icon |
|---|---|
| Left Panel | PanelLeft |
| Right Hub | PanelRight |
| Search | Search |
| Command | Command |
| Today | CircleDot |
| Daily | CalendarDays |
| Project | FolderTree |
| Task | CheckSquare |
| Calendar | Calendar |
| Knowledge | Network |
| AI | Sparkles |
| Outline | ListTree |
| Link | Link2 |
| Properties | SlidersHorizontal |
| Revision | History |
| Save | CheckCircle2 |

문자 `X`, `AI`, `•••`로 Icon을 임시 대체한 기존 부분은 정식 Icon으로 통일한다.

## 10. Motion

- Panel: 120~180ms
- Tab: 100~150ms
- Tooltip: Fade
- AI Stream: Text만 갱신, Bubble Layout Animation 금지
- Reduced Motion: Panel Transition 최소화

## 11. Proposal Visual

Proposal는 일반 Chat Bubble과 구분한다.

- Accent Border
- Header: 유형, Base Revision
- Body: 변경 요약
- Sources
- Footer Action
- Applied/Conflict Status

위험한 Replace는 Primary Action 색상만 강조하고 자동 적용하지 않는다.

## 12. Density

사용자 설정:

- Compact
- Comfortable

GA 기본은 Compact와 Comfortable 중간이다.

Compact에서 줄어드는 것:

- Row Height 32→28
- Panel Padding 12→8
- Metadata Chip Height 24→22

Text는 11px 아래로 줄이지 않는다.
