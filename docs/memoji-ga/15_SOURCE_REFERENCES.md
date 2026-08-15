# 15. 검토 출처

## 1. Memoji 저장소

검토 대상:

- `https://github.com/doublejun80/Memoji`
- `main`
- PR #1 `codex/review-settings-vdi-performance`

주요 파일:

| 파일 | 검토 내용 |
|---|---|
| `src/App.tsx` | 고정 3단 Layout, 전역 상태, Page CRUD |
| `src/components/TopBar.tsx` | 상단 Action 구성 |
| `src/components/Sidebar.tsx` | Daily/Project/Calendar/Tree |
| `src/components/RightPanel.tsx` | Search+AI 고정 분할 |
| `src/components/MarkdownEditor.tsx` | Document Header, Milkdown |
| `src/components/AIChatAssistant.tsx` | Context 2,000자, Stream, Insert/Replace |
| `src/components/SearchModal.tsx` | Frontend Search |
| `src/components/SettingsModal.tsx` | PR #1 2-pane 설정 |
| `src-tauri/src/database.rs` | pages/settings 구조 |
| `src-tauri/src/local_ai/*` | Candle, Loopback Server Client |
| `src-tauri/tauri.conf.json` | 1200×800, 800×600 |
| `package.json` | cmdk, react-resizable-panels 등 |

PR #1에서 확인한 핵심:

- Autosave Ordering
- Navigation/Close Flush
- Settings UX
- Managed LiteRT-LM
- UTF-8 SSE
- Runtime Diagnostics
- Token Preset
- Stream Render Batch

## 2. LiteRT-LM

### v0.16.0

- Release: `https://github.com/google-ai-edge/LiteRT-LM/releases/tag/v0.16.0`
- 공개: 2026-08-11
- 확인: Versioned C API Prebuilt, v0.15 후속

### v0.15.0

- Release: `https://github.com/google-ai-edge/LiteRT-LM/releases/tag/v0.15.0`
- 공개: 2026-08-04
- PR #1의 0.13.1 이후 변경 비교 기준

### Repository

- `https://github.com/google-ai-edge/LiteRT-LM`

버전은 기준일 이후 변경될 수 있으므로 구현 시 Release API를 다시 확인한다.

## 3. Gemma 4

### MTP 공식 문서

- Overview: `https://ai.google.dev/gemma/docs/mtp/overview`
- Transformers Guide: `https://ai.google.dev/gemma/docs/mtp/mtp`

확인 내용:

- Assistant/Drafter
- Target 병렬 검증
- 4-layer Drafter
- Draft Token Schedule
- Target Activation과 KV Cache 활용

### E2B QAT Q4 GGUF

- `https://huggingface.co/google/gemma-4-E2B-it-qat-q4_0-gguf`

모델 License와 Distribution 조건은 Bundle 시 다시 검토한다.

## 4. 메모·지식·일정 UX

### Obsidian

- Changelog: `https://obsidian.md/changelog/`
- 참고: Searchable Settings, Command, Backlink, Local Markdown

### Capacities

- User Interface: `https://docs.capacities.io/reference/user-interface`
- Object Types: `https://docs.capacities.io/reference/content-types`
- Daily Note: `https://docs.capacities.io/tutorials/using-your-daily-note`
- Calendar: `https://docs.capacities.io/reference/calendar`
- Search/Command: `https://docs.capacities.io/reference/search`
- AI Assistant: `https://docs.capacities.io/reference/ai-assistant`

참고한 요소:

- Object Type
- Property
- Saved Query
- Contextual Calendar
- Floating Inspector
- Daily Capture

### Tana

- Meeting Digest 관련 Release/문서
- `https://outliner.tana.inc/`

참고한 요소:

- AI Proposed Change
- Meeting→Action
- Supertag/Live Query

### Notion

- AI Meeting Notes: `https://www.notion.com/help/ai-meeting-notes`

참고한 요소:

- Transcript Citation
- Action Item
- Calendar Link

Memoji는 Notion과 달리 기본 Offline, Local Runtime을 유지한다.

## 5. 판단 기준

외부 제품은 UI Pattern과 Information Architecture 참고용이다.

직접 복제하지 않는 것:

- Cloud-only AI
- 외부 전송 Meeting Transcript
- Plugin 의존 Core
- P2P Sync
- 모든 Content의 Block DB화

Memoji에 적용하는 것은 현재 코드와 VDI 제약에 맞는 최소 구조다.
