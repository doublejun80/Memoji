import type {
  LocalAiGenerateRequest,
  LocalAiGenerateResponse,
  LocalAiRuntimeKind,
} from '../../types/localAi';

export interface AiMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: Date;
}

export interface AiGenerateOptions {
  includePageContext?: boolean;
  replaceTarget?: string;
}

export interface AiGenerationRequest {
  requestId: string;
  request: LocalAiGenerateRequest;
  useMtp: boolean;
}

export interface AiGenerationCallbacks {
  onStreamText: (requestId: string, text: string) => void;
  onComplete: (requestId: string, response: LocalAiGenerateResponse, streamedText: string) => void;
  onError: (requestId: string, error: unknown) => void;
  onCancel: (requestId: string) => void;
}

export interface AiQuickAction {
  id: 'summarize' | 'organize' | 'rewrite-selection';
  label: string;
  title: string;
  prompt: string;
  includePageContext?: boolean;
  requiresPage?: boolean;
  requiresSelection?: boolean;
}

export interface AiRuntimeSelection {
  runtimeKind: LocalAiRuntimeKind;
}
