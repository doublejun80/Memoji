import { useCallback, useRef, useState } from 'react';
import { Loader2 } from 'lucide-react';
import type { AiApi } from '../../shared/api/aiApi';
import { tauriAiApi } from '../../shared/api/aiApi';
import {
  findLocalAiRuntimePreset,
  formatLocalAiGenerateError,
  isLocalAiReady,
  LOCAL_AI_MAX_NEW_TOKENS_DEFAULT,
  LOCAL_AI_RUNTIME_PRESETS,
  localAiModelLabel,
  localAiRuntimeBadgeLabel,
  localAiStateHelp,
  localAiStateLabel,
  readLocalAiMaxNewTokens,
  runtimeKindFromLocalAiStatus,
  writeLocalAiMaxNewTokens,
  type LocalAiRuntimeKind,
  type LocalAiStatus,
} from '../../types/localAi';
import { AiComposer } from './AiComposer';
import { AiConversation } from './AiConversation';
import type { AiQuickAction } from './aiTypes';
import { useAiConversation } from './useAiConversation';
import { useAiRuntimeStatus } from './useAiRuntimeStatus';
import { useAiStream } from './useAiStream';
import './ai.css';

interface AiAssistantPanelProps {
  api?: AiApi;
  onInsertText?: (text: string) => void;
  onReplaceText?: (targetText: string, replacementText: string) => boolean;
  currentPageContent?: string;
}

const PAGE_CONTEXT_CHAR_LIMIT = 2_000;
const TOKEN_PRESETS = [
  { label: '짧게', value: 64 },
  { label: '기본', value: LOCAL_AI_MAX_NEW_TOKENS_DEFAULT },
  { label: '길게', value: 512 },
];

const QUICK_ACTIONS: AiQuickAction[] = [
  {
    id: 'summarize',
    label: '요약',
    title: '문서를 짧게 압축',
    prompt: '현재 문서를 짧게 압축해줘. 핵심 요약, 결정 사항, 다음 액션만 한국어 Markdown으로 출력해줘.',
    includePageContext: true,
    requiresPage: true,
  },
  {
    id: 'organize',
    label: '정리',
    title: '문서를 구조화해 재구성',
    prompt: '현재 문서를 읽기 좋은 Markdown 노트로 재구성해줘. 제목, 섹션, 요점, 세부 내용, 체크리스트가 있으면 task list로 정리해줘.',
    includePageContext: true,
    requiresPage: true,
  },
  {
    id: 'rewrite-selection',
    label: '선택',
    title: '선택 영역을 명확하게 다듬기',
    prompt: '아래 선택 영역만 더 명확한 한국어 Markdown 문장으로 다듬어줘. 설명 없이 치환할 본문만 출력해줘.',
    requiresSelection: true,
  },
];

const newRequestId = () => `${Date.now()}-${Math.random().toString(36).slice(2)}`;

export function AiAssistantPanel({
  api = tauriAiApi,
  onInsertText,
  onReplaceText,
  currentPageContent,
}: AiAssistantPanelProps) {
  const conversation = useAiConversation();
  const assistantByRequestRef = useRef(new Map<string, string>());
  const statusRef = useRef<LocalAiStatus | null>(null);

  const stream = useAiStream(api, {
    onStreamText: (requestId, text) => {
      const messageId = assistantByRequestRef.current.get(requestId);
      if (messageId) conversation.updateMessage(messageId, text);
    },
    onComplete: (requestId, response, streamedText) => {
      const messageId = assistantByRequestRef.current.get(requestId);
      if (messageId) conversation.updateMessage(messageId, response.text || streamedText);
      assistantByRequestRef.current.delete(requestId);
    },
    onError: (requestId, error) => {
      const messageId = assistantByRequestRef.current.get(requestId);
      if (messageId) conversation.updateMessage(
        messageId,
        formatLocalAiGenerateError(error, statusRef.current),
      );
      assistantByRequestRef.current.delete(requestId);
    },
    onCancel: (requestId) => {
      const messageId = assistantByRequestRef.current.get(requestId);
      if (messageId) conversation.updateMessage(messageId, '생성이 취소되었습니다.');
      assistantByRequestRef.current.delete(requestId);
    },
  });
  const runtime = useAiRuntimeStatus(api, stream.isGenerating);
  statusRef.current = runtime.status;
  const [maxNewTokens, setMaxNewTokens] = useState(readLocalAiMaxNewTokens);

  const sendMessage = useCallback((rawPrompt = conversation.input, options: {
    includePageContext?: boolean;
    replaceTarget?: string;
  } = {}) => {
    const prompt = rawPrompt.trim();
    if (!prompt || !isLocalAiReady(runtime.status) || stream.isGenerating) return;
    const requestId = newRequestId();
    conversation.appendUser(prompt);
    const assistantId = conversation.appendAssistant(options.replaceTarget);
    assistantByRequestRef.current.set(requestId, assistantId);
    conversation.setInput('');
    void stream.generate({
      requestId,
      useMtp: Boolean(runtime.status?.mtpConfigured),
      request: {
        prompt,
        pageContext: options.includePageContext
          ? currentPageContent?.slice(-PAGE_CONTEXT_CHAR_LIMIT)
          : undefined,
        maxNewTokens,
        temperature: 0.4,
        topP: 0.95,
      },
    });
  }, [conversation, currentPageContent, maxNewTokens, runtime.status, stream]);

  const runQuickAction = (action: AiQuickAction) => {
    if (action.requiresPage && !currentPageContent?.trim()) return;
    const selection = action.requiresSelection
      ? window.getSelection()?.toString().trim() || ''
      : '';
    if (action.requiresSelection && !selection) {
      runtime.setStatusError('편집기에서 바꿀 문장을 선택한 뒤 다시 시도해주세요.');
      return;
    }
    sendMessage(
      selection ? `${action.prompt}\n\n${selection}` : action.prompt,
      {
        includePageContext: action.includePageContext,
        replaceTarget: selection || undefined,
      },
    );
  };

  const insertBlock = (text: string) => onInsertText?.([
    '> [!note] Local AI',
    ...text.split('\n').map((line) => line.trim() ? `> ${line}` : '>'),
  ].join('\n'));

  const replaceText = (target: string, replacement: string) => {
    if (!onReplaceText?.(target, replacement)) {
      runtime.setStatusError('선택한 원문을 현재 문서에서 찾지 못했습니다. 같은 범위를 다시 선택해주세요.');
    }
  };

  const status = runtime.status;
  const canGenerate = isLocalAiReady(status) && !stream.isGenerating;
  const selectedRuntimeKind = runtimeKindFromLocalAiStatus(status);
  const selectedRuntimePreset = findLocalAiRuntimePreset(selectedRuntimeKind);
  const selectedRuntimeIsPublic = LOCAL_AI_RUNTIME_PRESETS.some(({ id }) => id === selectedRuntimeKind);
  const showLoadButton = !status?.mtpConfigured && ['not_loaded', 'error', 'unsupported'].includes(status?.state || '');
  const showStatusCard = !isLocalAiReady(status) || Boolean(runtime.statusError) || runtime.isLoadingModel;

  return (
    <section className="memoji-ai-panel" aria-label="AI 도우미">
      <header className="memoji-ai-header">
        <div className="memoji-ai-title-row">
          <label htmlFor="memoji-ai-model">AI</label>
          <select
            id="memoji-ai-model"
            name="ai-model"
            value={selectedRuntimeKind}
            onChange={(event) => void runtime.changeRuntime(event.target.value as LocalAiRuntimeKind)}
            disabled={stream.isGenerating || runtime.isLoadingModel || runtime.isSavingRuntime}
            aria-label="AI 모델 선택"
            title={localAiModelLabel(status)}
          >
            {!selectedRuntimeIsPublic && (
              <option value={selectedRuntimeKind}>{selectedRuntimePreset.shortLabel} · 기존 구성</option>
            )}
            {LOCAL_AI_RUNTIME_PRESETS.map((preset) => (
              <option key={preset.id} value={preset.id}>{preset.shortLabel}</option>
            ))}
          </select>
          {runtime.isSavingRuntime && <Loader2 className="memoji-ai-spinner" aria-hidden="true" />}
          {conversation.messages.length > 0 && (
            <button type="button" className="memoji-ai-clear" onClick={conversation.clear} title="대화 지우기">
              지우기
            </button>
          )}
        </div>

        {showStatusCard && (
          <div className="memoji-ai-status-card" role={runtime.statusError ? 'alert' : 'status'}>
            <strong>{localAiStateLabel(status?.state)}</strong>
            <span>{runtime.statusError || localAiStateHelp(status)}</span>
            {showLoadButton && (
              <button type="button" onClick={() => void runtime.loadModel()} disabled={runtime.isLoadingModel}>
                {runtime.isLoadingModel ? '로드 중' : '모델 로드'}
              </button>
            )}
          </div>
        )}

        <div className="memoji-ai-runtime-row">
          <span className="memoji-ai-runtime-badge">{localAiRuntimeBadgeLabel(status)}</span>
          <span>최대 {maxNewTokens}토큰</span>
        </div>
        <div className="memoji-ai-token-presets" aria-label="답변 길이">
          {TOKEN_PRESETS.map((preset) => (
            <button
              type="button"
              key={preset.value}
              data-active={maxNewTokens === preset.value}
              onClick={() => setMaxNewTokens(writeLocalAiMaxNewTokens(preset.value))}
            >
              {preset.label}
            </button>
          ))}
        </div>
        <div className="memoji-ai-quick-actions">
          {QUICK_ACTIONS.map((action) => (
            <button
              type="button"
              key={action.id}
              onClick={() => runQuickAction(action)}
              disabled={!canGenerate || (action.requiresPage && !currentPageContent?.trim())}
              title={action.title}
            >
              {action.label}
            </button>
          ))}
        </div>
      </header>

      <AiConversation
        messages={conversation.messages}
        isGenerating={stream.isGenerating}
        onInsertText={onInsertText}
        onInsertBlock={onInsertText ? insertBlock : undefined}
        onReplaceText={onReplaceText ? replaceText : undefined}
      />
      <AiComposer
        value={conversation.input}
        onChange={conversation.setInput}
        onSend={sendMessage}
        onCancel={() => void stream.cancel()}
        canGenerate={canGenerate}
        isGenerating={stream.isGenerating}
      />
    </section>
  );
}

