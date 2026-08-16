import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import type {
  LocalAiGenerateResponse,
  LocalAiGroundingSource,
  LocalAiGenerateStreamChunk,
  LocalAiRuntimeConfig,
  LocalAiStatus,
} from '../../types/localAi';
import type { AiGenerationRequest } from '../../features/ai/aiTypes';
import { getEnvironment } from '../../utils/environment';
import { TAURI_COMMANDS } from './tauriCommands';

const nativeInvoke = <T>(command: string, payload?: Record<string, unknown>): Promise<T> => {
  if (!getEnvironment().isTauri) {
    return Promise.reject(new Error('로컬 AI는 Memoji 데스크톱 앱에서 사용할 수 있습니다.'));
  }
  return invoke<T>(command, payload);
};

export interface AiApi {
  getStatus(): Promise<LocalAiStatus>;
  loadModel(): Promise<LocalAiStatus>;
  saveRuntimeConfig(config: LocalAiRuntimeConfig): Promise<unknown>;
  generate(request: AiGenerationRequest): Promise<LocalAiGenerateResponse>;
  cancel(requestId: string): Promise<void>;
  subscribeToChunks(
    listener: (chunk: LocalAiGenerateStreamChunk) => void,
  ): Promise<() => void>;
}

interface PreparedAiRun {
  runId: string;
  prompt: string;
  promptSha256: string;
  sources: LocalAiGroundingSource[];
}

const finishRun = (request: {
  id: string;
  status: 'completed' | 'failed' | 'cancelled';
  runtimeFamily?: string;
  promptTokens?: number;
  generatedTokens?: number;
  errorCode?: string;
}) => nativeInvoke<void>(TAURI_COMMANDS.finishAiRun, { request });

export const tauriAiApi: AiApi = {
  getStatus: () => nativeInvoke<LocalAiStatus>(TAURI_COMMANDS.localAiStatus),
  loadModel: () => nativeInvoke<LocalAiStatus>(TAURI_COMMANDS.localAiLoad),
  saveRuntimeConfig: (config) => nativeInvoke(TAURI_COMMANDS.localAiSaveRuntimeConfig, { config }),
  generate: async ({ requestId, request, useServer, runtimeFamily, currentPageId, currentProjectId, contextScope, objectType }) => {
    const prepared = await nativeInvoke<PreparedAiRun>(TAURI_COMMANDS.createAiRun, {
      request: {
        id: requestId,
        pageId: currentPageId,
        prompt: request.prompt,
        currentPageContext: request.pageContext,
        currentProjectId,
        contextScope,
        objectType: objectType ?? 'page',
        maxContextChars: 12_000,
      },
    });
    try {
      const response = await nativeInvoke<LocalAiGenerateResponse>(
        useServer ? TAURI_COMMANDS.localAiGenerateMtpStream : TAURI_COMMANDS.localAiGenerateStream,
        {
          requestId,
          request: { ...request, prompt: prepared.prompt, pageContext: undefined },
        },
      );
      await finishRun({
        id: requestId,
        status: 'completed',
        runtimeFamily: runtimeFamily ?? (useServer ? 'open_ai_compatible_loopback' : 'candle'),
        promptTokens: response.promptTokens,
        generatedTokens: response.generatedTokens,
      });
      return { ...response, groundingSources: prepared.sources };
    } catch (error) {
      await finishRun({
        id: requestId,
        status: 'failed',
        runtimeFamily: runtimeFamily ?? (useServer ? 'open_ai_compatible_loopback' : 'candle'),
        errorCode: 'generation_failed',
      }).catch(() => undefined);
      throw error;
    }
  },
  cancel: async (requestId) => {
    await Promise.allSettled([
      nativeInvoke<void>(TAURI_COMMANDS.localAiCancel, { requestId }),
      finishRun({ id: requestId, status: 'cancelled' }),
    ]);
  },
  subscribeToChunks: async (listener) => {
    if (!getEnvironment().isTauri) return () => undefined;
    return listen<LocalAiGenerateStreamChunk>(
      'local-ai-generate-chunk',
      (event) => listener(event.payload),
    );
  },
};
