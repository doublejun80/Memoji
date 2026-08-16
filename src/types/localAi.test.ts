import { strict as assert } from 'node:assert';
import {
  configFromLocalAiRuntimePreset,
  findLocalAiRuntimePreset,
  formatLocalAiGenerateError,
  findLocalAiModelPreset,
  LOCAL_AI_MODEL_PRESETS,
  LOCAL_AI_RUNTIME_PRESETS,
  localAiModelLabel,
  localAiRuntimeBadgeLabel,
  runtimeKindFromLocalAiConfig,
  LOCAL_AI_MAX_NEW_TOKENS_DEFAULT,
  LOCAL_AI_MAX_NEW_TOKENS_MAX,
} from './localAi';

assert.equal(LOCAL_AI_MAX_NEW_TOKENS_DEFAULT, 1024);
assert.equal(LOCAL_AI_MAX_NEW_TOKENS_MAX, 4096);

assert.deepEqual(
  LOCAL_AI_RUNTIME_PRESETS.map((preset) => preset.id),
  ['litert_lm']
);

assert.deepEqual(
  LOCAL_AI_MODEL_PRESETS.map((preset) => [preset.id, preset.minimumRamGb, preset.defaultForVdi]),
  [
    ['gemma4-e2b', 8, true],
    ['gemma4-e4b', 16, false],
  ],
);
assert.equal(findLocalAiModelPreset('gemma4-e4b').qualityLabel, '품질 우선');

assert.deepEqual(configFromLocalAiRuntimePreset('builtin_candle'), {
  runtimeKind: 'builtin_candle',
  serverEnabled: false,
  endpoint: 'http://127.0.0.1:8080/v1/chat/completions',
  model: 'google/gemma-4-E2B-it',
  draftModel: undefined,
});

assert.deepEqual(configFromLocalAiRuntimePreset('llama_cpp'), {
  runtimeKind: 'llama_cpp',
  serverEnabled: true,
  endpoint: 'http://127.0.0.1:8080/v1/chat/completions',
  model: 'google/gemma-4-E2B-it',
  draftModel: 'ngram speculative',
});

assert.deepEqual(configFromLocalAiRuntimePreset('litert_lm'), {
  runtimeKind: 'litert_lm',
  serverEnabled: true,
  endpoint: 'http://127.0.0.1:9379/v1/chat/completions',
  model: 'gemma4-e2b',
  draftModel: undefined,
});

assert.equal(findLocalAiRuntimePreset('litert_lm').modeLabel, '인프로세스 엔진');
assert.equal(findLocalAiRuntimePreset('missing' as never).id, 'litert_lm');
assert.equal(runtimeKindFromLocalAiConfig(null), 'litert_lm');
assert.equal(
  runtimeKindFromLocalAiConfig({
    serverEnabled: true,
    endpoint: 'http://127.0.0.1:8080/v1/chat/completions',
    model: 'google/gemma-4-E2B-it',
  }),
  'llama_cpp'
);

assert.equal(
  localAiModelLabel({
    state: 'loaded',
    modelPath: '/models/gemma-4-e2b-it-q4.gguf',
    tokenizerPath: '/models/tokenizer.json',
    mtpConfigured: true,
    mtpModel: 'google/gemma-4-E2B-it',
    mtpRuntimeKind: 'llama_cpp',
    modelExists: true,
    tokenizerExists: true,
    contextSize: 2048,
    cpuFeatures: {},
    compiledFeatures: {},
    avx512RuntimeReady: false,
    avx512Build: false,
  }),
  'Gemma 4 llama.cpp'
);

assert.equal(
  localAiRuntimeBadgeLabel({
    state: 'loaded',
    modelPath: '/models/gemma-4-e2b-it-q4.gguf',
    tokenizerPath: '/models/tokenizer.json',
    mtpConfigured: true,
    mtpModel: 'gemma-4-E2B-it-litert-lm',
    mtpRuntimeKind: 'litert_lm',
    runtimeCapabilities: {
      family: 'lite_rt', localOnly: true, inProcess: true, streaming: true,
      openAiCompatible: false, managedProcess: false, targetModelVerified: true,
      assistantModelVerified: false, mtpVerified: false, authEnforced: true,
    },
    modelExists: true,
    tokenizerExists: true,
    contextSize: 2048,
    cpuFeatures: {},
    compiledFeatures: {},
    avx512RuntimeReady: false,
    avx512Build: false,
  }),
  '인프로세스 AI'
);

assert.equal(
  localAiRuntimeBadgeLabel({
    state: 'loaded', modelPath: '', tokenizerPath: '', modelExists: true, tokenizerExists: true,
    contextSize: 2048, cpuFeatures: {}, compiledFeatures: {}, avx512RuntimeReady: false, avx512Build: false,
    runtimeCapabilities: {
      family: 'lite_rt', localOnly: true, inProcess: false, streaming: true,
      openAiCompatible: true, managedProcess: true, targetModelVerified: true,
      assistantModelVerified: true, mtpVerified: true, authEnforced: true,
    },
  }),
  'MTP 활성'
);

assert.equal(
  formatLocalAiGenerateError(
    'Failed to generate with local Gemma model: error sending request for url (http://127.0.0.1:9379/v1/chat/completions)',
    {
      state: 'loaded',
      modelPath: '/models/gemma-4-e2b-it-q4.gguf',
      tokenizerPath: '/models/tokenizer.json',
      mtpConfigured: true,
      mtpEndpoint: 'http://127.0.0.1:9379/v1/chat/completions',
      mtpModel: 'gemma-4-E2B-it-litert-lm',
      mtpRuntimeKind: 'litert_lm',
      modelExists: true,
      tokenizerExists: true,
      contextSize: 2048,
      cpuFeatures: {},
      compiledFeatures: {},
      avx512RuntimeReady: false,
      avx512Build: false,
    }
  ),
  '고속 로컬 서버가 응답하지 않습니다.\n\nhttp://127.0.0.1:9379/v1/chat/completions 연결을 자동으로 복구하는 중입니다. 계속 실패하면 설정에서 내장 Gemma 서버를 시작하세요.'
);
