# 09. AI UX와 Local Runtime

## 1. 현재 구현 판단

현재 `src-tauri/src/local_ai/mtp_client.rs`는 Loopback OpenAI-compatible Server에 요청하고 SSE Stream을 읽는다. `draft_model` 값을 설정에 보관하지만 Request Payload에는 Assistant Model이나 Draft 검증 설정이 전달되지 않는다.

따라서 현재 기능의 정확한 명칭은:

> **고속 로컬 AI 서버 스트리밍**

실제 MTP로 표시하려면 Runtime이 다음 정보를 반환해야 한다.

- Target Model
- Assistant/Drafter Model
- Draft Token Schedule
- Accepted Draft Tokens
- Acceptance Rate
- Target Verification

## 2. 최신 Runtime 기준

검토 기준일 2026-08-14에 LiteRT-LM 공식 최신 Release는 **v0.16.0**이며 2026-08-11 공개됐다. PR #1의 VDI Bundle은 `0.13.1` 기준이므로 단순 Version 변경이 아니라 Compatibility Track이 필요하다.

v0.16.0의 주요 의미:

- 최초 Versioned C API Prebuilt 제공
- Native Integration과 Language Binding 가능성 확대
- v0.15.0의 CLI Configuration과 API Update를 포함하는 후속 Release

Memoji에 대한 판단:

1. 단기 GA는 PR #1 Process Manager를 보존한다.
2. v0.16.0 Windows Asset/API를 별도 Branch에서 평가한다.
3. C API Prebuilt가 Windows VDI에서 사용 가능하면 Python Sidecar 제거 가능성을 검토한다.
4. 기존 `.litertlm` Model과 CLI Argument 호환을 확인한다.
5. 검증 실패 시 0.13.1을 유지하고 Upgrade Candidate로 기록한다.

## 3. Gemma 4 MTP

Google 공식 설명에서 Gemma 4 MTP는 작은 Assistant/Drafter가 여러 Token을 제안하고 Target이 병렬로 검증하는 Speculative Decoding 구조다.

E2B/E4B MTP의 핵심:

- Assistant는 4-layer Drafter
- Target Activation과 KV Cache 활용
- Input Embedding 공유
- Target이 최종 검증
- Draft Token 수는 Acceptance에 따라 조정 가능

VDI에서는 다음을 실측해야 한다.

- Target 단독 Decode TPS
- Target+Assistant Decode TPS
- Acceptance Rate
- Peak RSS 증가
- TTFT 변화
- 총 응답 시간
- CPU Overcommit 상태의 p95

“최대 3배” 같은 수치는 특정 Hardware/Prompt 조건을 벗어나면 보장되지 않는다.

## 4. Runtime Profile

```ts
interface LocalAiProfile {
  id: string;
  label: string;
  runtimeKind: 'litert_lm' | 'candle';
  targetModel: string;
  assistantModel?: string;
  quantization: string;
  contextTokens: number;
  maxOutputTokens: number;
  thinkingBudget: number;
  threadCount: number | 'auto';
}
```

권장 시작값:

| Profile | Model | Context | Output | Thinking | 용도 |
|---|---|---:|---:|---:|---|
| Speed | Gemma 4 E2B QAT Q4 | 2048 | 128 | 0 | 요약·다듬기·Task 추출 |
| Standard | E2B QAT Q4 + 검증된 MTP | 4096 | 256 | 0/Low | 일반 문서·지식 질문 |
| Quality | Gemma 4 E4B QAT Q4 | 4096 | 256 | Low | 복잡 비교·분석 |
| Fallback | Candle E2B GGUF | 2048 | 128 | 0 | LiteRT 실패 |

메모리는 공식 요구량이 아니라 해당 VDI Pool에서 Peak RSS로 확정한다.

## 5. AI Panel

### 5.1 Header

- Runtime Profile
- Ready/Starting/Error
- Local-only
- Model
- MTP는 Verified일 때만

### 5.2 Context Chip

- 선택 영역
- 현재 문서
- 연결 문서 N
- 현재 Project
- 최근 Daily
- 선택 Source 해제

사용자가 Context를 볼 수 있어야 한다. “AI가 알아서 모든 노트를 읽음”처럼 표현하지 않는다.

### 5.3 Quick Action

| Action | 기본 Context | 결과 |
|---|---|---|
| 요약 | Current Page | Proposal 또는 Copy |
| 정리 | Current Page | Section Replace Proposal |
| 다듬기 | Selection | Text Replace Proposal |
| 할 일 | Selection/Page/Project | Structured Task Proposal |
| 결정 | Meeting/Page | Decision Proposal |
| 리스크 | Project/Page | Risk Proposal |
| 번역 | Selection | Replace/Insert |
| 질문 | Retrieved Sources | Answer+Citation |

## 6. AI 상태

```ts
type AiExecutionState =
  | 'idle'
  | 'retrieving'
  | 'loading_runtime'
  | 'generating'
  | 'canceling'
  | 'completed'
  | 'error';
```

UI Copy:

| 상태 | 문구 |
|---|---|
| Retrieving | `관련 문서를 찾는 중` |
| Loading | `로컬 모델을 준비하는 중` |
| Generating | `답변 생성 중 · 42 tokens` |
| Canceling | `생성을 중단하는 중` |
| Error | Code별 안내 |
| Conflict | `문서가 변경돼 자동 적용하지 않았습니다.` |

## 7. Stream

PR #1의 `requestAnimationFrame` Batch를 유지한다.

추가:

- Request별 Stream Buffer
- 완료 Event와 Token Event 분리
- 완료 Event에 전체 Text를 다시 Token처럼 추가하지 않음
- Cancel 후 Late Event 무시
- Component Unmount 시 Listener 해제
- 한 번에 하나의 Active Generation 또는 Queue 명시

## 8. Cancellation

Rust:

```rust
struct ActiveGeneration {
    request_id: String,
    cancel: CancellationToken,
    started_at: Instant,
}
```

Tauri:

```text
local_ai_generate_v2
local_ai_cancel
```

Runtime이 Native Cancel을 지원하지 않으면:

1. UI Stream 중단
2. Response 무시
3. Child Request/Process Cancel 시도
4. 장시간 점유 시 Runtime 재시작 정책

## 9. Citation

```ts
interface AiSource {
  nodeId: string;
  title: string;
  anchorId?: string;
  headingPath?: string;
  excerpt: string;
  rank: number;
  score: number;
}
```

Citation UI:

```text
근거 1 · 구매AX Sprint1 개발회의 / 결정 사항
근거 2 · Memoji 2.0 GA / AI UX
```

Source 클릭:

1. 저장 Flush
2. Page Open
3. Anchor Scroll
4. Source Highlight
5. AI Tab 유지

## 10. Proposal

```ts
interface AiProposal {
  id: string;
  pageId: string;
  baseRevision: number;
  proposalType: 'insert' | 'replace' | 'tasks' | 'decisions' | 'properties';
  summary: string;
  patch: unknown;
  sources: AiSource[];
  status: 'pending' | 'applied' | 'rejected' | 'conflicted';
}
```

Apply:

```text
BEGIN
  SELECT current version
  IF current != baseRevision -> conflict
  ELSE apply patch
  INSERT revision
  UPDATE page
  INSERT reindex job
COMMIT
```

## 11. Prompt Template

```text
SYSTEM
You are Memoji's local workspace assistant.
Use only the supplied local sources.
Do not claim a source that is not provided.
Return the requested JSON schema when one is supplied.

ACTION
Extract decisions and action items.

OUTPUT SCHEMA
{...}

CURRENT SELECTION
...

CURRENT PAGE
...

RETRIEVED SOURCES
[S1] ...
[S2] ...

USER REQUEST
...

ASSISTANT
```

Prompt Template는 Runtime별 Chat Template로 최종 변환한다.

## 12. Context Budget

권장 기본:

| 영역 | 비율 |
|---|---:|
| System+Schema | 10% |
| Current Selection/Page | 35% |
| Retrieved Sources | 45% |
| Output Reserve | 10% 이상 별도 |

Context 초과 시 System과 Generation Prefix를 절단하지 않는다.

## 13. Benchmark 결과 Schema

```json
{
  "runtimeVersion": "0.16.0",
  "profile": "e2b-speed",
  "deviceFingerprint": "...",
  "cold": true,
  "promptTokens": 1024,
  "generatedTokens": 256,
  "loadMs": 0,
  "ttftMs": 1300,
  "prefillTokensPerSecond": 18.2,
  "decodeTokensPerSecond": 7.4,
  "totalMs": 36700,
  "peakRssMb": 5120,
  "mtp": {
    "enabled": false,
    "assistantModel": null,
    "acceptedDraftTokens": 0,
    "acceptanceRate": null
  }
}
```

## 14. Version Upgrade Gate

LiteRT-LM 0.13.1→0.16.0:

1. Bundle Script Test
2. CLI Help Snapshot
3. Process Start
4. Models Endpoint
5. Chat Completion Stream
6. UTF-8 Korean
7. Cancellation
8. 3 Model Load Cycles
9. Runtime Restart
10. 2K/4K Context
11. Model Compatibility
12. Peak RSS
13. Cold/Warm Benchmark
14. EDR Scan
15. Rollback

## 15. 개인정보와 로그

다음은 `AI_RUN`에 원문으로 저장하지 않는다.

- Prompt
- Response
- Source Excerpt

기본 저장:

- Prompt Hash
- Action Type
- Source Node ID
- Token Count
- Time
- Error Code
- Proposal ID

대화 History 저장 여부는 사용자 설정으로 분리한다.
