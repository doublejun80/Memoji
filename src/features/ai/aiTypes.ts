import type {
  LocalAiGenerateRequest,
  LocalAiGenerateResponse,
  LocalAiRuntimeFamily,
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
  useServer: boolean;
  runtimeFamily?: LocalAiRuntimeFamily;
  currentPageId?: string;
  currentProjectId?: string;
  contextScope?: AiContextScope;
  objectType?: 'page' | 'task' | 'event';
}

export type AiContextScope = 'none' | 'page' | 'project' | 'linked' | 'workspace';

export interface AiGenerationCallbacks {
  onStreamText: (requestId: string, text: string) => void;
  onComplete: (requestId: string, response: LocalAiGenerateResponse, streamedText: string) => void;
  onError: (requestId: string, error: unknown) => void;
  onCancel: (requestId: string) => void;
}

export interface AiQuickAction {
  id: 'summarize' | 'organize' | 'rewrite-selection' | 'decision' | 'risks' | 'translate' | 'tasks';
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
