import { useCallback, useEffect, useReducer, useRef, useState } from 'react';
import { Loader2 } from 'lucide-react';
import type { AiApi } from '../../shared/api/aiApi';
import { tauriAiApi } from '../../shared/api/aiApi';
import {
  findLocalAiRuntimePreset,
  findLocalAiModelPreset,
  formatLocalAiGenerateError,
  isLocalAiReady,
  LOCAL_AI_MAX_NEW_TOKENS_DEFAULT,
  LOCAL_AI_RUNTIME_PRESETS,
  LOCAL_AI_MODEL_PRESETS,
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
import { AiProposalCard } from './AiProposalCard';
import {
  aiProposalReducer,
  initialAiProposalState,
  type AiProposal,
} from './aiProposalReducer';
import type { AiContextScope, AiQuickAction } from './aiTypes';
import type { EditorSelection } from '../../editor/SelectionAiToolbar';
import {
  defaultProposalApi,
  type ApplyProposalResult,
  type ProposalApi,
} from '../../shared/api/proposalApi';
import { useAiConversation } from './useAiConversation';
import { useAiRuntimeStatus } from './useAiRuntimeStatus';
import { useAiStream } from './useAiStream';
import './ai.css';

interface AiAssistantPanelProps {
  api?: AiApi;
  proposalApi?: ProposalApi;
  onInsertText?: (text: string) => void;
  onApplyProposal?: (proposal: AiProposal) => boolean | Promise<boolean>;
  onProposalApplied?: (result: ApplyProposalResult) => void | Promise<void>;
  onOpenSource?: (source: AiProposal['sources'][number]) => void | Promise<void>;
  currentPageId?: string;
  currentProjectId?: string;
  currentPageRevision?: number;
  currentPageContent?: string;
}

interface ProposalIntent {
  selection: EditorSelection;
  type: AiProposal['type'];
  title: string;
}

const PAGE_CONTEXT_CHAR_LIMIT = 2_000;
const TOKEN_PRESETS = [
  { label: '짧게', value: 256 },
  { label: '기본', value: LOCAL_AI_MAX_NEW_TOKENS_DEFAULT },
  { label: '길게', value: 2048 },
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
  {
    id: 'decision',
    label: '결정',
    title: '결정 사항과 근거 추출',
    prompt: '현재 문서에서 확정된 결정, 그 근거, 아직 결정되지 않은 항목을 구분해 한국어 Markdown으로 정리해줘.',
    includePageContext: true,
    requiresPage: true,
  },
  {
    id: 'risks',
    label: '위험',
    title: '위험과 대응책 추출',
    prompt: '현재 문서에서 위험, 영향, 발생 가능성, 대응책, 담당이 명시된 경우 담당을 표로 정리해줘.',
    includePageContext: true,
    requiresPage: true,
  },
  {
    id: 'translate',
    label: '번역',
    title: '한국어와 영어 사이로 번역',
    prompt: '현재 문서의 언어를 감지해 한국어면 자연스러운 영어로, 그 외 언어면 자연스러운 한국어로 번역해줘. Markdown 구조를 유지하고 번역문만 출력해줘.',
    includePageContext: true,
    requiresPage: true,
  },
  {
    id: 'tasks',
    label: '작업',
    title: '실행 가능한 작업 추출',
    prompt: '현재 문서에서 실행 가능한 작업을 추출해 Markdown task list 형식(- [ ] 작업)으로 정리해줘. 담당자와 기한이 명시된 경우 원문 의미를 유지해 함께 적어줘.',
    includePageContext: true,
    requiresPage: true,
  },
];

const newRequestId = () => `${Date.now()}-${Math.random().toString(36).slice(2)}`;

export function AiAssistantPanel({
  api = tauriAiApi,
  proposalApi = defaultProposalApi,
  onInsertText,
  onApplyProposal,
  onProposalApplied,
  onOpenSource,
  currentPageId,
  currentProjectId,
  currentPageRevision = 0,
  currentPageContent,
}: AiAssistantPanelProps) {
  const conversation = useAiConversation();
  const assistantByRequestRef = useRef(new Map<string, string>());
  const proposalIntentByRequestRef = useRef(new Map<string, ProposalIntent>());
  const statusRef = useRef<LocalAiStatus | null>(null);
  const [proposalState, dispatchProposal] = useReducer(aiProposalReducer, initialAiProposalState);

  const stream = useAiStream(api, {
    onStreamText: (requestId, text) => {
      const messageId = assistantByRequestRef.current.get(requestId);
      if (messageId) conversation.updateMessage(messageId, text);
    },
    onComplete: (requestId, response, streamedText) => {
      const messageId = assistantByRequestRef.current.get(requestId);
      const generatedText = response.text || streamedText;
      if (messageId) conversation.updateMessage(messageId, generatedText);
      const intent = proposalIntentByRequestRef.current.get(requestId);
      if (intent && generatedText) {
        const { selection } = intent;
        const proposal: AiProposal = {
          id: `proposal-${requestId}`,
          requestId,
          pageId: selection.pageId,
          baseRevision: selection.baseRevision,
          type: intent.type,
          title: intent.title,
          summary: 'AI가 선택 영역을 바꾸는 검토 가능한 제안을 만들었습니다.',
          patch: {
            kind: 'text',
            before: selection.text,
            after: generatedText,
            anchor: {
              start: selection.start,
              end: selection.end,
              textHash: selection.textHash,
            },
            contextBefore: currentPageContent?.slice(Math.max(0, selection.start - 60), selection.start) || '',
            contextAfter: currentPageContent?.slice(selection.end, selection.end + 60) || '',
          },
          sources: [
            {
              pageId: selection.pageId,
              start: selection.start,
              end: selection.end,
              textHash: selection.textHash,
              label: '선택한 원문',
            },
            ...(response.groundingSources ?? []).map((source) => ({
              pageId: source.pageId,
              anchor: source.anchor ?? undefined,
              headingPath: source.headingPath,
              start: source.start ?? undefined,
              end: source.end ?? undefined,
              textHash: source.textHash ?? undefined,
              label: source.title,
              score: source.score,
            })),
          ],
          status: 'pending',
        };
        dispatchProposal({ type: 'queue', proposal });
        void proposalApi.create(proposal).catch(() => {
          dispatchProposal({ type: 'mark-conflict', id: proposal.id });
        });
      }
      assistantByRequestRef.current.delete(requestId);
      proposalIntentByRequestRef.current.delete(requestId);
    },
    onError: (requestId, error) => {
      const messageId = assistantByRequestRef.current.get(requestId);
      if (messageId) conversation.updateMessage(
        messageId,
        formatLocalAiGenerateError(error, statusRef.current),
      );
      assistantByRequestRef.current.delete(requestId);
      proposalIntentByRequestRef.current.delete(requestId);
    },
    onCancel: (requestId) => {
      const messageId = assistantByRequestRef.current.get(requestId);
      if (messageId) conversation.updateMessage(messageId, '생성이 취소되었습니다.');
      assistantByRequestRef.current.delete(requestId);
      proposalIntentByRequestRef.current.delete(requestId);
    },
  });
  const runtime = useAiRuntimeStatus(api, stream.isGenerating);
  statusRef.current = runtime.status;
  const [maxNewTokens, setMaxNewTokens] = useState(readLocalAiMaxNewTokens);
  const [contextScope, setContextScope] = useState<AiContextScope>(currentPageId ? 'page' : 'workspace');

  useEffect(() => {
    if (!currentPageId && (contextScope === 'page' || contextScope === 'linked')) setContextScope('workspace');
    if (!currentProjectId && contextScope === 'project') setContextScope(currentPageId ? 'page' : 'workspace');
  }, [contextScope, currentPageId, currentProjectId]);

  useEffect(() => {
    let active = true;
    if (!currentPageId) {
      dispatchProposal({ type: 'hydrate', proposals: [] });
      return () => { active = false; };
    }
    void proposalApi.list(currentPageId).then((proposals) => {
      if (active) dispatchProposal({ type: 'hydrate', proposals });
    }).catch(() => {
      if (active) dispatchProposal({ type: 'hydrate', proposals: [] });
    });
    return () => { active = false; };
  }, [currentPageId, proposalApi]);

  const sendMessage = useCallback((rawPrompt = conversation.input, options: {
    includePageContext?: boolean;
    proposalIntent?: ProposalIntent;
  } = {}) => {
    const prompt = rawPrompt.trim();
    if (!prompt || !isLocalAiReady(runtime.status) || stream.isGenerating) return;
    const requestId = newRequestId();
    conversation.appendUser(prompt);
    const assistantId = conversation.appendAssistant();
    assistantByRequestRef.current.set(requestId, assistantId);
    if (options.proposalIntent) proposalIntentByRequestRef.current.set(requestId, options.proposalIntent);
    conversation.setInput('');
    void stream.generate({
      requestId,
      useServer: Boolean(
        runtime.status?.runtimeCapabilities?.openAiCompatible || runtime.status?.mtpConfigured,
      ),
      runtimeFamily: runtime.status?.runtimeCapabilities?.family
        ?? (runtime.status?.mtpConfigured ? 'open_ai_compatible_loopback' : 'candle'),
      request: {
        prompt,
        pageContext: contextScope !== 'none' && (options.includePageContext || contextScope === 'page')
          ? currentPageContent?.slice(-PAGE_CONTEXT_CHAR_LIMIT)
          : undefined,
        maxNewTokens,
        temperature: 0.4,
        topP: 0.95,
      },
      contextScope,
      currentPageId: contextScope === 'none' ? undefined : currentPageId,
      currentProjectId: contextScope === 'project' ? currentProjectId : undefined,
      objectType: 'page',
    });
  }, [contextScope, conversation, currentPageContent, currentPageId, currentProjectId, maxNewTokens, runtime.status, stream]);

  useEffect(() => {
    const handleSelectionAction = (event: Event) => {
      const detail = (event as CustomEvent<{
        action: 'rewrite' | 'summarize' | 'tasks' | 'translate';
        selection: EditorSelection;
      }>).detail;
      if (!detail || detail.selection.pageId !== currentPageId) return;
      const action = {
        rewrite: {
          type: 'replace' as const,
          title: '선택 영역 다듬기',
          prompt: '아래 선택 영역만 더 명확한 한국어 Markdown 문장으로 다듬어줘. 설명 없이 치환할 본문만 출력해줘.',
        },
        summarize: {
          type: 'replace' as const,
          title: '선택 영역 요약',
          prompt: '아래 선택 영역을 핵심 의미가 유지되는 짧은 한국어 Markdown으로 요약해줘. 요약 본문만 출력해줘.',
        },
        tasks: {
          type: 'tasks' as const,
          title: '작업 목록 추출',
          prompt: '아래 선택 영역에서 실행 가능한 작업을 Markdown task list로 추출해줘. 목록만 출력해줘.',
        },
        translate: {
          type: 'replace' as const,
          title: '선택 영역 번역',
          prompt: '아래 선택 영역의 언어를 감지해 한국어면 자연스러운 영어로, 그 외 언어면 자연스러운 한국어로 번역해줘. Markdown 구조를 유지하고 번역문만 출력해줘.',
        },
      }[detail.action];
      const selection = {
        ...detail.selection,
        baseRevision: currentPageRevision,
      };
      sendMessage(`${action.prompt}\n\n${selection.text}`, {
        proposalIntent: { selection, type: action.type, title: action.title },
      });
    };
    window.addEventListener('memoji:selection-ai', handleSelectionAction);
    return () => window.removeEventListener('memoji:selection-ai', handleSelectionAction);
  }, [currentPageId, currentPageRevision, sendMessage]);

  const runQuickAction = (action: AiQuickAction) => {
    if (action.requiresPage && !currentPageContent?.trim()) return;
    const selection = action.requiresSelection
      ? window.getSelection()?.toString().trim() || ''
      : '';
    if (action.requiresSelection && !selection) {
      runtime.setStatusError('문서를 원문 모드로 전환해 범위를 선택한 뒤 나타나는 AI 도구를 사용해주세요.');
      return;
    }
    if (action.requiresSelection) {
      runtime.setStatusError('정확한 범위와 리비전을 보존하려면 원문 선택 도구의 다듬기를 사용해주세요.');
      return;
    }
    sendMessage(
      selection ? `${action.prompt}\n\n${selection}` : action.prompt,
      {
        includePageContext: action.includePageContext,
      },
    );
  };

  const insertBlock = (text: string) => onInsertText?.([
    '> [!note] Local AI',
    ...text.split('\n').map((line) => line.trim() ? `> ${line}` : '>'),
  ].join('\n'));

  const applyProposal = async (id: string) => {
    const proposal = proposalState.items.find((item) => item.id === id);
    if (!proposal) return;
    if (proposalApi.apply) {
      try {
        const result = await proposalApi.apply(id);
        dispatchProposal({ type: 'mark-applied', id });
        await onProposalApplied?.(result);
      } catch {
        dispatchProposal({ type: 'mark-conflict', id });
      }
      return;
    }
    if (!onApplyProposal) return;
    const applied = await onApplyProposal(proposal);
    dispatchProposal({ type: applied ? 'mark-applied' : 'mark-conflict', id });
    await proposalApi.updateStatus(id, applied ? 'applied' : 'conflicted');
  };

  const rejectProposal = async (id: string) => {
    dispatchProposal({ type: 'reject', id });
    if (proposalApi.reject) await proposalApi.reject(id);
    else await proposalApi.updateStatus(id, 'rejected');
  };

  const status = runtime.status;
  const canGenerate = isLocalAiReady(status) && !stream.isGenerating;
  const selectedRuntimeKind = runtimeKindFromLocalAiStatus(status);
  const selectedRuntimePreset = findLocalAiRuntimePreset(selectedRuntimeKind);
  const selectedRuntimeIsPublic = LOCAL_AI_RUNTIME_PRESETS.some(({ id }) => id === selectedRuntimeKind);
  const selectedModel = findLocalAiModelPreset(status?.mtpModel);
  const showLoadButton = !status?.runtimeCapabilities?.openAiCompatible
    && !status?.mtpConfigured
    && ['not_loaded', 'error', 'unsupported'].includes(status?.state || '');
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
        {selectedRuntimeKind === 'litert_lm' && (
          <div className="memoji-ai-context-row">
            <label htmlFor="memoji-ai-model-preset">모델</label>
            <select
              id="memoji-ai-model-preset"
              aria-label="Gemma 4 모델 프리셋"
              value={selectedModel.id}
              onChange={(event) => void runtime.changeModel(event.target.value)}
              disabled={stream.isGenerating || runtime.isLoadingModel || runtime.isSavingRuntime}
            >
              {LOCAL_AI_MODEL_PRESETS.map((preset) => (
                <option key={preset.id} value={preset.id}>{preset.label}</option>
              ))}
            </select>
          </div>
        )}
        <div className="memoji-ai-context-row">
          <label htmlFor="memoji-ai-context-scope">문맥</label>
          <select
            id="memoji-ai-context-scope"
            aria-label="AI 문맥 범위"
            value={contextScope}
            onChange={(event) => setContextScope(event.target.value as AiContextScope)}
          >
            <option value="none">문맥 없음</option>
            <option value="page" disabled={!currentPageId}>현재 문서</option>
            <option value="project" disabled={!currentProjectId}>현재 프로젝트</option>
            <option value="linked" disabled={!currentPageId}>연결 문서</option>
            <option value="workspace">전체 워크스페이스</option>
          </select>
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
      >
        {proposalState.items.map((proposal) => (
          <AiProposalCard
            key={proposal.id}
            proposal={proposal}
            diffOpen={proposalState.openDiffId === proposal.id}
            onOpenDiff={(id) => dispatchProposal({ type: 'open-diff', id })}
            onCloseDiff={() => dispatchProposal({ type: 'close-diff' })}
            onApply={(id) => void applyProposal(id)}
            onReject={(id) => void rejectProposal(id)}
            onOpenSource={(source) => void onOpenSource?.(source)}
          />
        ))}
      </AiConversation>
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
