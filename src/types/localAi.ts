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

export interface LocalAiRuntimeInfo {
  os: string;
  arch: string;
  availableParallelism: number;
  buildProfile: string;
}

export interface LocalAiGenerationStats {
  elapsedMs: number;
  promptTokens: number;
  generatedTokens: number;
  tokensPerSecond: number;
  maxNewTokens: number;
  mode: string;
  ttftMs?: number | null;
  prefillMs?: number | null;
  decodeMs?: number | null;
  peakRssBytes?: number | null;
}

export type LocalAiRuntimeFamily = 'candle' | 'open_ai_compatible_loopback' | 'lite_rt';

export interface LocalAiRuntimeCapabilities {
  family: LocalAiRuntimeFamily;
  localOnly: boolean;
  inProcess: boolean;
  streaming: boolean;
  openAiCompatible: boolean;
  managedProcess: boolean;
  targetModelVerified: boolean;
  assistantModelVerified: boolean;
  mtpVerified: boolean;
  authEnforced: boolean;
}

export interface LocalAiRuntimeMetrics {
  runtimeVersion?: string | null;
  loadMs?: number | null;
  ttftMs?: number | null;
  prefillTokens?: number | null;
  prefillMs?: number | null;
  decodeTokens?: number | null;
  decodeMs?: number | null;
  peakRssBytes?: number | null;
  mtp?: {
    targetModel: string;
    assistantModel: string;
    acceptedDraftTokens?: number | null;
    proposedDraftTokens?: number | null;
  } | null;
}

export interface LocalAiStatus {
  state: LocalAiLoadState;
  modelPath: string;
  tokenizerPath: string;
  mtpConfigured?: boolean;
  mtpEndpoint?: string | null;
  mtpModel?: string | null;
  mtpDraftModel?: string | null;
  mtpRuntimeKind?: LocalAiRuntimeKind | null;
  mtpReachable?: boolean | null;
  mtpProbeError?: string | null;
  modelExists: boolean;
  tokenizerExists: boolean;
  contextSize: number;
  modelInfo?: LocalAiModelInfo | null;
  lastError?: string | null;
  cpuFeatures: Record<string, boolean>;
  compiledFeatures: Record<string, boolean>;
  avx512RuntimeReady: boolean;
  avx512Build: boolean;
  runtimeInfo?: LocalAiRuntimeInfo;
  modelFileSizeBytes?: number | null;
  tokenizerFileSizeBytes?: number | null;
  lastLoadMs?: number | null;
  lastGeneration?: LocalAiGenerationStats | null;
  runtimeCapabilities?: LocalAiRuntimeCapabilities;
  runtimeMetrics?: LocalAiRuntimeMetrics;
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
  groundingSources?: LocalAiGroundingSource[];
}

export interface LocalAiGroundingSource {
  pageId: string;
  title: string;
  anchor?: string | null;
  headingPath: string[];
  snippet: string;
  score: number;
  start?: number | null;
  end?: number | null;
  textHash?: string | null;
}

export interface LocalAiGenerateStreamChunk {
  requestId: string;
  tokenText: string;
  generatedTokens: number;
  done: boolean;
  finishReason?: string | null;
}

export interface LocalAiBenchmarkResult {
  status: LocalAiStatus;
  loadMs?: number | null;
  cachedModel: boolean;
  generateMs: number;
  promptTokens: number;
  generatedTokens: number;
  tokensPerSecond: number;
  speedLabel: string;
  recommendation: string;
}

export interface LocalAiRuntimeConfig {
  serverEnabled: boolean;
  endpoint: string;
  model: string;
  draftModel?: string;
  runtimeKind?: LocalAiRuntimeKind;
}

export interface LocalAiRuntimeConfigView extends LocalAiRuntimeConfig {
  envConfigured: boolean;
  envTakesPrecedence: boolean;
}

export interface LocalAiRuntimeTestResult {
  ok: boolean;
  message: string;
  generatedTokens: number;
  tokensPerSecond: number;
}

export interface LocalAiManagedRuntimeStatus {
  available: boolean;
  bundled: boolean;
  modelAvailable: boolean;
  processRunning: boolean;
  endpointReachable: boolean;
  source?: string | null;
  registryPath?: string | null;
  modelPath?: string | null;
  logPath: string;
  lastError?: string | null;
  endpoint?: string | null;
  port?: number | null;
  processId?: number | null;
  sessionIsolated?: boolean;
  authConfigured?: boolean;
  authEnforced?: boolean;
}

export const LOCAL_AI_MAX_NEW_TOKENS_MIN = 32;
export const LOCAL_AI_MAX_NEW_TOKENS_MAX = 2048;
export const LOCAL_AI_MAX_NEW_TOKENS_DEFAULT = 256;
export const LOCAL_AI_MAX_NEW_TOKENS_STEP = 16;
export const LOCAL_AI_MAX_NEW_TOKENS_STORAGE_KEY = 'memoji.localAi.maxNewTokens';
export const LOCAL_AI_SETTINGS_CHANGED_EVENT = 'memoji-local-ai-settings-changed';

export type LocalAiRuntimeKind = 'builtin_candle' | 'llama_cpp' | 'litert_lm';
export const DEFAULT_LOCAL_AI_RUNTIME_KIND: LocalAiRuntimeKind = 'litert_lm';

export interface LocalAiRuntimePreset {
  id: LocalAiRuntimeKind;
  label: string;
  shortLabel: string;
  modeLabel: string;
  description: string;
  serverEnabled: boolean;
  endpoint: string;
  model: string;
  draftModel?: string;
}

export const LOCAL_AI_RUNTIME_PRESETS: LocalAiRuntimePreset[] = [
  {
    id: 'litert_lm',
    label: 'Gemma 4 E2B · LiteRT-LM',
    shortLabel: 'Gemma 4 LiteRT-LM',
    modeLabel: '고속 로컬 서버',
    description: 'VDI 배포본에 포함된 Gemma 4와 LiteRT-LM을 자동으로 실행',
    serverEnabled: true,
    endpoint: 'http://127.0.0.1:9379/v1/chat/completions',
    model: 'gemma4-e2b',
  },
];

const LEGACY_LOCAL_AI_RUNTIME_PRESETS: LocalAiRuntimePreset[] = [
  {
    id: 'builtin_candle',
    label: 'Gemma 4 E2B Q4_0',
    shortLabel: 'Gemma 4 E2B Q4_0',
    modeLabel: '로컬',
    description: '호환성용 껍데기. GGUF 모델 파일을 다시 받으면 사용 가능',
    serverEnabled: false,
    endpoint: 'http://127.0.0.1:8080/v1/chat/completions',
    model: 'google/gemma-4-E2B-it',
  },
  {
    id: 'llama_cpp',
    label: 'Gemma 4 E2B · llama.cpp',
    shortLabel: 'Gemma 4 llama.cpp',
    modeLabel: 'llama.cpp',
    description: '호환성용 껍데기. GGUF 모델과 llama-server를 다시 준비하면 사용 가능',
    serverEnabled: true,
    endpoint: 'http://127.0.0.1:8080/v1/chat/completions',
    model: 'google/gemma-4-E2B-it',
    draftModel: 'ngram speculative',
  },
];

const ALL_LOCAL_AI_RUNTIME_PRESETS: LocalAiRuntimePreset[] = [
  ...LOCAL_AI_RUNTIME_PRESETS,
  ...LEGACY_LOCAL_AI_RUNTIME_PRESETS,
];

export const findLocalAiRuntimePreset = (
  runtimeKind?: LocalAiRuntimeKind | null
): LocalAiRuntimePreset => (
  ALL_LOCAL_AI_RUNTIME_PRESETS.find((preset) => preset.id === runtimeKind) ??
  ALL_LOCAL_AI_RUNTIME_PRESETS.find((preset) => preset.id === DEFAULT_LOCAL_AI_RUNTIME_KIND) ??
  ALL_LOCAL_AI_RUNTIME_PRESETS[0]
);

export const configFromLocalAiRuntimePreset = (
  runtimeKind: LocalAiRuntimeKind
): LocalAiRuntimeConfig => {
  const preset = findLocalAiRuntimePreset(runtimeKind);
  return {
    runtimeKind: preset.id,
    serverEnabled: preset.serverEnabled,
    endpoint: preset.endpoint,
    model: preset.model,
    draftModel: preset.draftModel,
  };
};

export const runtimeKindFromLocalAiStatus = (
  status?: LocalAiStatus | null
): LocalAiRuntimeKind => {
  if (!status) return DEFAULT_LOCAL_AI_RUNTIME_KIND;
  if (!status?.runtimeCapabilities?.openAiCompatible && !status?.mtpConfigured) return 'builtin_candle';
  return findLocalAiRuntimePreset(status.mtpRuntimeKind ?? null).id;
};

export const runtimeKindFromLocalAiConfig = (
  config?: LocalAiRuntimeConfig | null
): LocalAiRuntimeKind => {
  if (!config) return DEFAULT_LOCAL_AI_RUNTIME_KIND;
  if (!config?.serverEnabled) return 'builtin_candle';
  const runtimeKind = findLocalAiRuntimePreset(config.runtimeKind ?? 'llama_cpp').id;
  return runtimeKind === 'builtin_candle' ? 'llama_cpp' : runtimeKind;
};

export const localAiRuntimeBadgeLabel = (status?: LocalAiStatus | null): string => {
  if (status?.runtimeCapabilities?.mtpVerified) return 'MTP 활성';
  if (status?.runtimeCapabilities?.openAiCompatible || status?.mtpConfigured) return '고속 로컬 서버';
  return '내장 로컬';
};

export const formatLocalAiGenerateError = (
  error: unknown,
  status?: LocalAiStatus | null
): string => {
  const rawMessage = String(error);
  if (status?.runtimeCapabilities?.openAiCompatible || status?.mtpConfigured) {
    const runtimePreset = findLocalAiRuntimePreset(status.mtpRuntimeKind ?? null);
    const endpoint = status.mtpEndpoint || runtimePreset.endpoint;
    const serverConnectionFailed =
      rawMessage.includes('error sending request') ||
      rawMessage.includes('Connection refused') ||
      rawMessage.includes('tcp connect error') ||
      rawMessage.includes('operation timed out');

    if (serverConnectionFailed) {
      return `고속 로컬 서버가 응답하지 않습니다.\n\n${endpoint} 연결을 자동으로 복구하는 중입니다. 계속 실패하면 설정에서 내장 Gemma 서버를 시작하세요.`;
    }

    return `고속 로컬 서버 오류: ${rawMessage}\n\n설정에서 endpoint와 서버 실행 상태를 확인하세요.`;
  }

  return `로컬 AI 오류: ${rawMessage}\n\n설정에서 모델 파일, 토크나이저, CPU 가속 상태를 확인해주세요.`;
};

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

export const formatLocalAiBytes = (bytes?: number | null): string => {
  if (!bytes || !Number.isFinite(bytes)) return '-';
  const units = ['B', 'KB', 'MB', 'GB'];
  let value = bytes;
  let unitIndex = 0;
  while (value >= 1024 && unitIndex < units.length - 1) {
    value /= 1024;
    unitIndex += 1;
  }
  return `${value.toFixed(unitIndex === 0 ? 0 : 1)} ${units[unitIndex]}`;
};

export const formatLocalAiSpeed = (tokensPerSecond?: number | null): string => {
  if (!Number.isFinite(tokensPerSecond ?? NaN)) return '-';
  return `${tokensPerSecond!.toFixed(2)} tok/s`;
};

export const localAiRuntimeLabel = (status?: LocalAiStatus | null): string => {
  if (!status?.runtimeInfo) return '-';
  const { os, arch, availableParallelism, buildProfile } = status.runtimeInfo;
  return `${os}/${arch} · ${availableParallelism} threads · ${buildProfile}`;
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
    const preset = findLocalAiRuntimePreset(status.mtpRuntimeKind ?? null);
    if (status.mtpReachable === false) {
      return status.mtpProbeError
        ? `${preset.modeLabel} 서버 연결 실패: ${status.mtpProbeError}`
        : `${preset.modeLabel} 내장 서버를 자동으로 시작하는 중입니다.`;
    }
    if (status.mtpReachable == null) {
      return `${preset.modeLabel} 로컬 서버 연결 상태를 확인하고 있습니다.`;
    }
    if (status.runtimeCapabilities?.mtpVerified) {
      return `MTP 활성: 대상 모델과 보조 모델(${status.mtpDraftModel})이 모두 검증되었습니다.`;
    }
    if (status.mtpDraftModel) {
      return `고속 로컬 서버로 스트리밍합니다. 보조 모델 ${status.mtpDraftModel}은 아직 검증되지 않아 MTP로 표시하지 않습니다.`;
    }
    return `${preset.modeLabel}로 로컬 스트리밍합니다.`;
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
  if (!status) return '상태 확인 중';
  if (status?.mtpConfigured) {
    return findLocalAiRuntimePreset(status.mtpRuntimeKind ?? null).shortLabel;
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

export const isLocalAiReady = (status?: LocalAiStatus | null): boolean => {
  if (status?.runtimeCapabilities?.openAiCompatible || status?.mtpConfigured) return status.mtpReachable === true;
  return status?.state === 'loaded';
};
