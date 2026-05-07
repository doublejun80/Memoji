# Memoji 2.0 Handoff

작성일: 2026-05-06

## 현재 목표

Memoji를 `Typora식 즉시 렌더링 Markdown 편집 + Obsidian식 링크/태그 구조 + Windows VDI 우선 로컬 AI 노트앱`으로 재정립하는 작업을 진행 중이다.

핵심 원칙:

- 외부 네트워크 LLM 추론 금지
- OpenAI, Anthropic, Gemini, Ollama, LM Studio 호출 제거
- llama.cpp 같은 외부 런타임 금지
- Rust 안에서 Candle 기반 GGUF 로컬 추론
- `Page.content: string`은 Markdown source of truth로 유지
- 실제 `.gguf` 대형 모델은 GitHub에 커밋하지 않음

## 지금까지 완료한 작업

### 로컬 AI

- 기존 외부 LLM provider 호출 구조를 제거하고 Tauri command 기반 로컬 AI 호출로 전환했다.
- Rust 쪽에 `local_ai` 모듈 구조를 추가했다.
  - `src-tauri/src/local_ai/mod.rs`
  - `src-tauri/src/local_ai/gemma4.rs`
  - `src-tauri/src/local_ai/tokenizer.rs`
  - `src-tauri/src/local_ai/sampler.rs`
- Tauri command:
  - `local_ai_status`
  - `local_ai_load`
  - `local_ai_generate`
  - `local_ai_generate_stream`
- 모델 없음/토크나이저 없음 상태에서 크래시하지 않고 status/error를 반환하도록 처리했다.
- `Gemma 4 E2B Q4_0` 표시와 리소스 경로/문서 구조를 준비했다.
- CPU feature 상태와 AVX-512 관련 상태를 설정창에 표시한다.
- 답변 토큰 설정을 localStorage 기반으로 저장/동기화한다.

### 리소스/빌드

- `src-tauri/resources/models/` 아래에 모델/토크나이저를 둘 수 있는 구조를 잡았다.
- 실제 GGUF 모델 파일은 커밋하지 않는 방향이다.
- `tauri.conf.json` bundle resources에 모델/토크나이저 리소스 구조가 반영되어 있다.
- 일반 x64 빌드와 AVX-512 전용 빌드 문서/스크립트 방향을 정리했다.
- Windows VDI 기준은 `RUSTFLAGS="-C target-cpu=skylake-avx512"` 계열을 우선 문서화했다.

### 에디터

- 기존 800줄 이상 `MarkdownEditor.tsx`의 자체 parser/preview 중심 구조를 줄이고 Milkdown wrapper 중심으로 바꿨다.
- 기본 편집 모드는 WYSIWYG/즉시 렌더링이다.
- `편집` / `원문` 버튼만 남겼고, 버튼 안의 `Milkdown`, `MD` 보조 글자는 제거했다.
- `Page.content`는 계속 Markdown string으로 저장한다.
- 저장/태그 추출은 `useMarkdownPageEditor`와 `markdownMetadata` 유틸 쪽으로 분리했다.
- 자동 저장 debounce가 editor change listener 기반으로 동작한다.
- GFM table 입력/렌더링을 Milkdown/Crepe table 기능으로 연결했다.
- Milkdown block drag handle은 실제 드래그 이동이 안 되는 혼란을 줄이기 위해 꺼두었다.

### UI/UX

- 상단 TopBar를 그룹화했다.
  - navigation
  - document actions
  - help/settings
  - window controls
- 최소화/최대화/닫기 아이콘 크기를 다른 아이콘과 맞췄다.
- 중앙 헤더의 제목/저장 상태와 `편집`/`원문` 버튼 사이 좌우 여백을 다시 조정했다.
- `편집` / `원문` 버튼 사이 간격은 `gap-2`로 조정했다.
- 오른쪽 AI 패널은 유지하되 provider 설정 문구를 제거하고 로컬 Gemma 상태 중심으로 정리했다.
- Send 버튼은 글자가 아니라 아이콘으로 줄였다.
- AI 패널은 streaming event를 받아 생성 중 텍스트를 계속 업데이트한다.
- 이모지/페이지 아이콘 선택 UI를 사이드바에 추가했다.
- 설정 모달을 탭형 구조로 재작성했다.
  - 일반
  - 편집기
  - 로컬 AI
  - 데이터
  - 단축키
- 설정의 편집기 탭에 글자체/글자 크기 설정을 추가했다.
- 설정의 로컬 AI 탭에 모델 상태, 모델 로드, 답변 토큰, CPU/AVX-512 상태를 넣었다.
- 마크다운 도움말은 문법/작성 키를 구분해 정리했다.
- 스크롤바는 투명 처리했다.
- 체크박스 체크 표시를 중앙에 맞추도록 CSS를 고쳤다.

### Milkdown 툴바 관련 최신 수정

사용자가 긴 문서에서 스크롤하면 Milkdown 편집도구가 사라진다고 계속 지적했다.

현재 구현은 `src/components/editor/MilkdownEditor.tsx`에서 다음 방식으로 수정되어 있다.

- Crepe가 생성한 `.milkdown-top-bar`를 `MutationObserver`로 감지한다.
- 그 DOM을 문서 스크롤 영역 안이 아니라 `.memoji-milkdown-toolbar` 슬롯으로 이동한다.
- 실제 문서 본문은 `.memoji-milkdown-scroll` 안에서만 스크롤한다.
- `onWheelCapture`로 휠 이벤트를 잡아 `.memoji-milkdown-scroll`을 직접 스크롤한다.

관련 CSS는 `src/index.css`의 `.memoji-milkdown*` 블록이다.

## 최근 검증 결과

마지막으로 실행한 검증:

```bash
npm run build
```

결과: 통과

```bash
cd src-tauri
cargo check
```

결과: 통과

```bash
cd src-tauri
cargo test local_ai --lib
```

결과:

- 5 passed
- 0 failed
- 1 ignored

ignored test:

- `local_downloaded_gemma4_model_loads_and_generates_one_token`
- 실제 Gemma 4 GGUF와 tokenizer 리소스가 있어야 실행 가능하다.

외부 LLM/API 문자열 확인 시 주의:

- `src-tauri/resources/models/tokenizer.json` 안에는 토큰 vocabulary로 `OpenAI`, `Gemini` 같은 문자열이 나올 수 있다.
- 앱 호출 코드 검사에서는 `src-tauri/resources/models/tokenizer.json`과 `src-tauri/target/**`를 제외하고 확인해야 한다.

추천 확인 명령:

```bash
rg -n "OpenAI|Anthropic|Gemini|Ollama|LM Studio|@tauri-apps/plugin-http|@milkdown/plugin-table" src src-tauri package.json README.md BUILD_GUIDE.md --glob '!src-tauri/resources/models/tokenizer.json' --glob '!src-tauri/target/**'
```

## 다음 컨텍스트에서 바로 해야 할 일

### 1. 실제 앱 화면 QA

현재 Tauri dev 창은 HMR로 최신 변경이 반영되어 있었다. 다음 컨텍스트에서는 먼저 화면을 직접 확인해야 한다.

확인 항목:

- 체크박스 체크 표시가 글자 중앙선과 맞는지
- 위/아래 스크롤바가 투명인지
- 긴 Milkdown 문서에서 휠로 위/아래 이동이 되는지
- 긴 Milkdown 문서에서도 편집도구가 계속 보이는지
- 중앙 헤더에서 왼쪽 제목 영역과 오른쪽 버튼 영역의 좌우 경계 여백이 같은지
- `편집` / `원문` 버튼 사이가 붙어 보이지 않는지
- 설정 모달 제목 `설정`이 잘리지 않는지
- 설정 모달 내부가 마우스 휠로 정상 스크롤되는지
- 로컬 AI 탭에서 답변 토큰 조절이 보이는지

### 2. Milkdown 툴바가 그래도 사라지면

먼저 DOM 구조를 확인한다.

중요 클래스:

- `.memoji-milkdown`
- `.memoji-milkdown-toolbar`
- `.memoji-milkdown-scroll`
- `.memoji-milkdown-root`
- `.milkdown-top-bar`

의심 지점:

- Crepe가 `.milkdown-top-bar`를 다시 원래 위치에 삽입하는지
- `MutationObserver`가 toolbar를 이동하기 전에 스크롤이 먼저 걸리는지
- `.memoji-milkdown-toolbar:empty { display: none; }` 때문에 toolbar 이동 전 높이 변동이 생기는지
- 우측 패널/메인 에디터 부모가 `overflow-hidden`을 너무 강하게 먹고 있는지

다음 수정 후보:

- `Crepe.Feature.TopBar`를 끄고 자체 toolbar를 별도로 구현
- Milkdown command API로 bold/list/table/image 버튼을 직접 연결
- `.memoji-milkdown-toolbar`를 `MarkdownEditor` 헤더 바로 아래 React 영역으로 완전히 분리

### 3. 설정 모달이 그래도 잘리면

현재 `DialogContent` 기본 스타일이 `grid`, `gap-4`, `p-6`를 갖고 있어 inline style로 `display: flex`, `gap: 0`, `padding: 0`을 강제했다.

그래도 잘리면 다음처럼 더 강하게 간다.

- `SettingsModal` 전용 dialog content를 Radix primitive로 직접 만든다.
- 또는 `DialogContent` 공통 컴포넌트에 `unstyled` prop을 추가한다.
- 모달 높이는 `height: min(560px, calc(100vh - 96px))` 정도로 더 줄인다.
- 버튼 footer를 sticky bottom으로 고정하고 본문만 스크롤한다.

### 4. 실제 Gemma 4 모델 smoke test

현재 모델 파일이 있으면 반드시 다음 테스트를 추가로 실행해야 한다.

```bash
cd src-tauri
cargo test local_ai::gemma4::tests::local_downloaded_gemma4_model_loads_and_generates_one_token --lib -- --ignored
```

확인해야 할 것:

- 실제 `.gguf`가 `src-tauri/resources/models/gemma-4-e2b-it-q4.gguf` 또는 설정된 경로에 있는지
- tokenizer.json 경로가 맞는지
- Q4_0 모델 로드가 실제로 성공하는지
- 1 token generation이 timeout 없이 끝나는지
- VDI CPU에서 tokens/sec가 실사용 가능한지

### 5. 성능 이슈

사용자는 답변 속도가 느리다고 강하게 지적했다.

다음 확인 후보:

- Rust inference thread 수 설정
- Candle matmul/quantized path가 실제 CPU feature를 쓰는지
- release build와 dev build 속도 차이
- AVX-512 전용 빌드 산출물에서 속도 차이
- context size 기본값 2048 유지 여부
- `max_new_tokens` 기본값을 192보다 더 낮출지
- prompt template이 너무 길지 않은지
- streaming이 실제로 token 단위로 UI에 보이는지

MTP 관련:

- 사용자가 말한 “MTP로 3배 빨라진다”는 건 별도 검토가 필요하다.
- 현재 구현 범위에는 MTP/speculative decoding 계열 최적화가 들어가 있지 않다.
- 로컬/오프라인 조건을 유지하면서 가능한지 별도 조사 후 구현해야 한다.

## 주요 파일

프런트엔드:

- `src/components/MarkdownEditor.tsx`
- `src/components/editor/MilkdownEditor.tsx`
- `src/components/SettingsModal.tsx`
- `src/components/TopBar.tsx`
- `src/components/AIChatAssistant.tsx`
- `src/components/Sidebar.tsx`
- `src/index.css`
- `src/hooks/useMarkdownPageEditor.ts`
- `src/utils/markdownMetadata.ts`
- `src/utils/editorPreferences.ts`
- `src/types/localAi.ts`

Rust/Tauri:

- `src-tauri/src/lib.rs`
- `src-tauri/src/local_ai/mod.rs`
- `src-tauri/src/local_ai/gemma4.rs`
- `src-tauri/src/local_ai/tokenizer.rs`
- `src-tauri/src/local_ai/sampler.rs`
- `src-tauri/Cargo.toml`
- `src-tauri/tauri.conf.json`
- `src-tauri/capabilities/default.json`

문서/빌드:

- `README.md`
- `BUILD_GUIDE.md`
- `VDI_DEPLOYMENT_GUIDE.md`
- `scripts/`
- `src-tauri/resources/models/`

## 주의사항

- 이 workspace에서는 마지막 확인 시 `.git` 메타데이터가 없어 `git status`가 실패했다.
- 변경 내역 확인은 `git diff`가 아니라 파일 직접 확인 또는 외부 git root 확인이 필요하다.
- `dist/`, `src-tauri/target/`는 빌드 산출물이다.
- 실제 GGUF 모델 파일은 커밋 대상이 아니다.
- 사용자 요구는 화면 품질에 매우 민감하므로, 다음 작업은 코드보다 먼저 실제 앱 화면 확인부터 해야 한다.

## 다음 컨텍스트 시작용 짧은 프롬프트

```text
Memoji 2.0 작업 이어서 진행해.
먼저 /Users/doublejun_air/github/memoji/MEMOJI_2_0_HANDOFF.md 읽고,
현재 Tauri dev 화면에서 다음 UI QA부터 해:
1. 체크박스 중앙 정렬
2. 투명 스크롤바
3. 긴 Milkdown 문서에서 휠 스크롤 가능 여부
4. Milkdown 편집도구 고정 여부
5. 편집/원문 버튼 간격과 좌우 경계 여백
6. 설정 모달 헤더 잘림/내부 스크롤
문제 보이면 바로 수정하고 npm run build, cargo check까지 검증해.
```
