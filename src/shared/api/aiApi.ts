import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import type {
  LocalAiGenerateResponse,
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

export const tauriAiApi: AiApi = {
  getStatus: () => invoke<LocalAiStatus>('local_ai_status'),
  loadModel: () => invoke<LocalAiStatus>('local_ai_load'),
  saveRuntimeConfig: (config) => invoke('local_ai_save_runtime_config', { config }),
  generate: ({ requestId, request, useServer }) => invoke<LocalAiGenerateResponse>(
    useServer ? 'local_ai_generate_mtp_stream' : 'local_ai_generate_stream',
    { requestId, request },
  ),
  cancel: (requestId) => invoke<void>('local_ai_cancel', { requestId }),
  subscribeToChunks: async (listener) => listen<LocalAiGenerateStreamChunk>(
    'local-ai-generate-chunk',
    (event) => listener(event.payload),
  ),
};
