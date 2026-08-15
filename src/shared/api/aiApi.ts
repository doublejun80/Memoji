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
}) => invoke<void>('finish_ai_run', { request });

export const tauriAiApi: AiApi = {
  getStatus: () => invoke<LocalAiStatus>('local_ai_status'),
  loadModel: () => invoke<LocalAiStatus>('local_ai_load'),
  saveRuntimeConfig: (config) => invoke('local_ai_save_runtime_config', { config }),
  generate: async ({ requestId, request, useServer, currentPageId, currentProjectId, objectType }) => {
    const prepared = await invoke<PreparedAiRun>('create_ai_run', {
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
      const response = await invoke<LocalAiGenerateResponse>(
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
      invoke<void>('local_ai_cancel', { requestId }),
      finishRun({ id: requestId, status: 'cancelled' }),
    ]);
  },
  subscribeToChunks: async (listener) => listen<LocalAiGenerateStreamChunk>(
    'local-ai-generate-chunk',
    (event) => listener(event.payload),
  ),
};
