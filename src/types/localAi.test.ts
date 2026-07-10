import { strict as assert } from 'node:assert';
import {
  configFromLocalAiRuntimePreset,
  findLocalAiRuntimePreset,
  formatLocalAiGenerateError,
  LOCAL_AI_RUNTIME_PRESETS,
  localAiModelLabel,
  localAiRuntimeBadgeLabel,
  runtimeKindFromLocalAiConfig,
} from './localAi';

assert.deepEqual(
  LOCAL_AI_RUNTIME_PRESETS.map((preset) => preset.id),
  ['litert_lm']
);

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

assert.equal(findLocalAiRuntimePreset('litert_lm').modeLabel, 'LiteRT-LM');
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
    modelExists: true,
    tokenizerExists: true,
    contextSize: 2048,
    cpuFeatures: {},
    compiledFeatures: {},
    avx512RuntimeReady: false,
    avx512Build: false,
  }),
  'LiteRT-LM'
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
  'LiteRT-LM 서버가 켜져 있지 않습니다.\n\nhttp://127.0.0.1:9379/v1/chat/completions 에서 OpenAI 호환 서버를 먼저 실행하거나, 설정에서 사용 가능한 런타임을 선택하세요.'
);
