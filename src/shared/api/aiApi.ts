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
}) => nativeInvoke<void>('finish_ai_run', { request });

export const tauriAiApi: AiApi = {
  getStatus: () => nativeInvoke<LocalAiStatus>('local_ai_status'),
  loadModel: () => nativeInvoke<LocalAiStatus>('local_ai_load'),
  saveRuntimeConfig: (config) => nativeInvoke('local_ai_save_runtime_config', { config }),
  generate: async ({ requestId, request, useServer, currentPageId, currentProjectId, objectType }) => {
    const prepared = await nativeInvoke<PreparedAiRun>('create_ai_run', {
      request: {
        id: requestId,
        pageId: currentPageId,
        prompt: request.prompt,
        currentPageContext: request.pageContext,
        currentProjectId,
        objectType: objectType ?? 'page',
        maxContextChars: 12_000,
      },
    });
    try {
      const response = await nativeInvoke<LocalAiGenerateResponse>(
        useServer ? 'local_ai_generate_mtp_stream' : 'local_ai_generate_stream',
        {
          requestId,
          request: { ...request, prompt: prepared.prompt, pageContext: undefined },
        },
      );
      await finishRun({
        id: requestId,
        status: 'completed',
        runtimeFamily: useServer ? 'open_ai_compatible_loopback' : 'candle',
        promptTokens: response.promptTokens,
        generatedTokens: response.generatedTokens,
      });
      return { ...response, groundingSources: prepared.sources };
    } catch (error) {
      await finishRun({
        id: requestId,
        status: 'failed',
        runtimeFamily: useServer ? 'open_ai_compatible_loopback' : 'candle',
        errorCode: 'generation_failed',
      }).catch(() => undefined);
      throw error;
    }
  },
  cancel: async (requestId) => {
    await Promise.allSettled([
      nativeInvoke<void>('local_ai_cancel', { requestId }),
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
