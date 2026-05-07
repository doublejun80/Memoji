export type LocalAiLoadState =
  | 'missing_model'
  | 'missing_tokenizer'
  | 'not_loaded'
  | 'loading'
  | 'loaded'
  | 'unsupported'
  | 'error';

export interface LocalAiModelInfo {
  architecture: string;
  name?: string | null;
  quantizationVersion?: number | null;
  fileType?: number | null;
  tensorCount: number;
  metadataCount: number;
  tokenizerVocabSize?: number | null;
  contextSize: number;
}

export interface LocalAiStatus {
  state: LocalAiLoadState;
  modelPath: string;
  tokenizerPath: string;
  mtpConfigured?: boolean;
  mtpEndpoint?: string | null;
  mtpModel?: string | null;
  mtpDraftModel?: string | null;
  modelExists: boolean;
  tokenizerExists: boolean;
  contextSize: number;
  modelInfo?: LocalAiModelInfo | null;
  lastError?: string | null;
  cpuFeatures: Record<string, boolean>;
  compiledFeatures: Record<string, boolean>;
  avx512RuntimeReady: boolean;
  avx512Build: boolean;
}

export interface LocalAiGenerateRequest {
  prompt: string;
  pageContext?: string;
  maxNewTokens?: number;
  temperature?: number;
  topP?: number;
}

export interface LocalAiGenerateResponse {
  text: string;
  promptTokens: number;
  generatedTokens: number;
  finishReason: string;
}

export interface LocalAiGenerateStreamChunk {
  requestId: string;
  tokenText: string;
  generatedTokens: number;
  done: boolean;
  finishReason?: string | null;
}

export const LOCAL_AI_MAX_NEW_TOKENS_MIN = 32;
export const LOCAL_AI_MAX_NEW_TOKENS_MAX = 2048;
export const LOCAL_AI_MAX_NEW_TOKENS_DEFAULT = 192;
export const LOCAL_AI_MAX_NEW_TOKENS_STEP = 16;
export const LOCAL_AI_MAX_NEW_TOKENS_STORAGE_KEY = 'memoji.localAi.maxNewTokens';
export const LOCAL_AI_SETTINGS_CHANGED_EVENT = 'memoji-local-ai-settings-changed';

export const clampLocalAiMaxNewTokens = (value: number): number => {
  if (!Number.isFinite(value)) return LOCAL_AI_MAX_NEW_TOKENS_DEFAULT;
  return Math.round(value / LOCAL_AI_MAX_NEW_TOKENS_STEP) * LOCAL_AI_MAX_NEW_TOKENS_STEP;
};

export const readLocalAiMaxNewTokens = (): number => {
  if (typeof window === 'undefined') return LOCAL_AI_MAX_NEW_TOKENS_DEFAULT;

  const stored = window.localStorage.getItem(LOCAL_AI_MAX_NEW_TOKENS_STORAGE_KEY);
  const parsed = stored ? Number(stored) : LOCAL_AI_MAX_NEW_TOKENS_DEFAULT;
  const stepped = clampLocalAiMaxNewTokens(parsed);

  return Math.min(
    LOCAL_AI_MAX_NEW_TOKENS_MAX,
    Math.max(LOCAL_AI_MAX_NEW_TOKENS_MIN, stepped)
  );
};

export const writeLocalAiMaxNewTokens = (value: number): number => {
  const nextValue = Math.min(
    LOCAL_AI_MAX_NEW_TOKENS_MAX,
    Math.max(LOCAL_AI_MAX_NEW_TOKENS_MIN, clampLocalAiMaxNewTokens(value))
  );

  window.localStorage.setItem(LOCAL_AI_MAX_NEW_TOKENS_STORAGE_KEY, String(nextValue));
  window.dispatchEvent(new CustomEvent(LOCAL_AI_SETTINGS_CHANGED_EVENT));
  return nextValue;
};

export const localAiStateLabel = (state?: LocalAiLoadState): string => {
  switch (state) {
    case 'missing_model':
      return '모델 없음';
    case 'missing_tokenizer':
      return '토크나이저 없음';
    case 'not_loaded':
      return '로드 필요';
    case 'loading':
      return '모델 준비 중';
    case 'loaded':
      return '로드됨';
    case 'unsupported':
      return 'Decoder 미지원';
    case 'error':
      return '오류';
    default:
      return '상태 확인 중';
  }
};

export const localAiStateHelp = (status?: LocalAiStatus | null): string => {
  if (!status) return '로컬 Gemma 상태를 확인하고 있습니다.';
  if (status.mtpConfigured) {
    return status.mtpDraftModel
      ? `VDI MTP 서버로 스트리밍합니다. Drafter: ${status.mtpDraftModel}`
      : 'VDI 내부 로컬 추론 서버로 스트리밍합니다. Drafter는 서버 실행 옵션에서 설정됩니다.';
  }

  switch (status.state) {
    case 'missing_model':
      return 'resources/models 아래에 Gemma 4 E2B GGUF 파일을 준비하세요.';
    case 'missing_tokenizer':
      return 'resources/models/tokenizer.json 파일이 필요합니다.';
    case 'not_loaded':
      return '설정에서 로컬 모델을 로드하세요.';
    case 'loading':
      return '로컬 GGUF 메타데이터와 토크나이저를 읽는 중입니다.';
    case 'loaded':
      return '외부 네트워크 없이 로컬 모델로 생성합니다.';
    case 'unsupported':
      return status.lastError || 'Gemma 4 decoder adapter가 미지원 상태입니다.';
    case 'error':
      return status.lastError || '로컬 모델 로드 중 오류가 발생했습니다.';
    default:
      return '로컬 Gemma 상태를 확인하고 있습니다.';
  }
};

export const localAiModelLabel = (status?: LocalAiStatus | null): string => {
  if (status?.mtpConfigured && status.mtpModel) {
    return status.mtpModel;
  }

  const path = status?.modelPath?.toLowerCase() || '';
  if (path.includes('q4')) return 'Gemma 4 E2B Q4_0';
  if (path.includes('q3')) return 'Gemma 4 E2B Q3';

  const name = status?.modelInfo?.name?.trim();
  if (name && name.toLowerCase() !== 'gemma4') {
    return name;
  }

  return 'Gemma 4 E2B';
};

export const isLocalAiReady = (status?: LocalAiStatus | null): boolean =>
  status?.state === 'loaded' || status?.mtpConfigured === true;
