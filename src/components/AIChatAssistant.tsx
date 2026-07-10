import React, { useCallback, useEffect, useRef, useState } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import { Loader2, SendHorizontal } from 'lucide-react';
import {
  configFromLocalAiRuntimePreset,
  findLocalAiRuntimePreset,
  formatLocalAiGenerateError,
  isLocalAiReady,
  LOCAL_AI_MAX_NEW_TOKENS_DEFAULT,
  LOCAL_AI_RUNTIME_PRESETS,
  LOCAL_AI_SETTINGS_CHANGED_EVENT,
  localAiModelLabel,
  localAiRuntimeBadgeLabel,
  localAiStateHelp,
  localAiStateLabel,
  LocalAiGenerateResponse,
  LocalAiGenerateStreamChunk,
  LocalAiRuntimeKind,
  LocalAiStatus,
  readLocalAiMaxNewTokens,
  runtimeKindFromLocalAiStatus,
  writeLocalAiMaxNewTokens,
} from '../types/localAi';

interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: Date;
  replaceTarget?: string;
}

interface AIChatAssistantProps {
  onInsertText?: (text: string) => void;
  onReplaceText?: (targetText: string, replacementText: string) => boolean;
  currentPageContent?: string;
}

interface GenerateOptions {
  includePageContext?: boolean;
  replaceTarget?: string;
}

const PAGE_CONTEXT_CHAR_LIMIT = 2000;
const TOKEN_PRESETS = [
  { label: '짧게', value: 64 },
  { label: '기본', value: LOCAL_AI_MAX_NEW_TOKENS_DEFAULT },
  { label: '길게', value: 512 },
];

const AIChatAssistant: React.FC<AIChatAssistantProps> = ({
  onInsertText,
  onReplaceText,
  currentPageContent
}) => {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [isGenerating, setIsGenerating] = useState(false);
  const [isLoadingModel, setIsLoadingModel] = useState(false);
  const [isSavingRuntime, setIsSavingRuntime] = useState(false);
  const [status, setStatus] = useState<LocalAiStatus | null>(null);
  const [statusError, setStatusError] = useState<string | null>(null);
  const [maxNewTokens, setMaxNewTokens] = useState(readLocalAiMaxNewTokens);
  const scrollRef = useRef<HTMLDivElement>(null);
  const isGeneratingRef = useRef(false);
  const isLoadingModelRef = useRef(false);
  const isComposingRef = useRef(false);
  const didRequestAutoLoadRef = useRef(false);

  const refreshStatus = useCallback(async () => {
    try {
      const nextStatus = await invoke<LocalAiStatus>('local_ai_status');
      setStatus(nextStatus);
      setStatusError(null);
    } catch (error) {
      setStatusError(String(error));
    }
  }, []);

  useEffect(() => {
    refreshStatus();
    const interval = window.setInterval(() => {
      if (!isGeneratingRef.current && !isLoadingModelRef.current) {
        refreshStatus();
      }
    }, 10000);
    return () => window.clearInterval(interval);
  }, [refreshStatus]);

  useEffect(() => {
    const syncGenerationSettings = () => {
      setMaxNewTokens(readLocalAiMaxNewTokens());
      void refreshStatus();
    };

    window.addEventListener(LOCAL_AI_SETTINGS_CHANGED_EVENT, syncGenerationSettings);
    window.addEventListener('storage', syncGenerationSettings);

    return () => {
      window.removeEventListener(LOCAL_AI_SETTINGS_CHANGED_EVENT, syncGenerationSettings);
      window.removeEventListener('storage', syncGenerationSettings);
    };
  }, [refreshStatus]);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, isGenerating]);

  const loadModel = async () => {
    if (isLoadingModelRef.current) return;
    isLoadingModelRef.current = true;
    setIsLoadingModel(true);
    try {
      const nextStatus = await invoke<LocalAiStatus>('local_ai_load');
      setStatus(nextStatus);
      setStatusError(nextStatus.lastError || null);
    } catch (error) {
      setStatusError(String(error));
      await refreshStatus();
    } finally {
      isLoadingModelRef.current = false;
      setIsLoadingModel(false);
    }
  };

  useEffect(() => {
    if (didRequestAutoLoadRef.current) return;
    if (
      status?.mtpConfigured ||
      status?.state !== 'not_loaded' ||
      !status.modelExists ||
      !status.tokenizerExists
    ) {
      return;
    }

    didRequestAutoLoadRef.current = true;
    void loadModel();
  }, [status?.mtpConfigured, status?.modelExists, status?.state, status?.tokenizerExists]);

  const sendMessage = async (
    rawPrompt = input,
    options: GenerateOptions = {}
  ) => {
    const prompt = rawPrompt.trim();
    if (!prompt || !isLocalAiReady(status) || isGeneratingRef.current) return;
    isGeneratingRef.current = true;

    const userMessage: Message = {
      id: Date.now().toString(),
      role: 'user',
      content: prompt,
      timestamp: new Date()
    };

    setMessages(prev => [...prev, userMessage]);
    setInput('');
    setIsGenerating(true);

    let unlistenStream: (() => void) | null = null;
    let assistantMessageId: string | null = null;
    let streamedText = '';
    let streamRenderFrame: number | null = null;

    const renderStreamedMessage = () => {
      streamRenderFrame = null;
      if (!assistantMessageId) return;
      setMessages(prev => prev.map(message =>
        message.id === assistantMessageId
          ? { ...message, content: streamedText }
          : message
      ));
    };

    try {
      const requestId = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
      assistantMessageId = `${Date.now() + 1}`;

      setMessages(prev => [...prev, {
        id: assistantMessageId,
        role: 'assistant',
        content: '',
        timestamp: new Date(),
        replaceTarget: options.replaceTarget
      }]);

      unlistenStream = await listen<LocalAiGenerateStreamChunk>('local-ai-generate-chunk', (event) => {
        const chunk = event.payload;
        if (chunk.requestId !== requestId) return;
        if (chunk.done) return;

        streamedText += chunk.tokenText;
        if (streamRenderFrame === null) {
          streamRenderFrame = window.requestAnimationFrame(renderStreamedMessage);
        }
      });

      const generateCommand = status?.mtpConfigured
        ? 'local_ai_generate_mtp_stream'
        : 'local_ai_generate_stream';
      const pageContext = options.includePageContext
        ? currentPageContent?.slice(-PAGE_CONTEXT_CHAR_LIMIT)
        : undefined;

      const response = await invoke<LocalAiGenerateResponse>(generateCommand, {
        requestId,
        request: {
          prompt,
          pageContext,
          maxNewTokens,
          temperature: 0.4,
          topP: 0.95,
        }
      });

      unlistenStream();
      unlistenStream = null;
      if (streamRenderFrame !== null) {
        window.cancelAnimationFrame(streamRenderFrame);
        streamRenderFrame = null;
      }
      setMessages(prev => prev.map(message =>
        message.id === assistantMessageId
          ? { ...message, content: response.text || streamedText }
          : message
      ));
    } catch (error) {
      unlistenStream?.();
      if (streamRenderFrame !== null) {
        window.cancelAnimationFrame(streamRenderFrame);
        streamRenderFrame = null;
      }
      const errorMessage: Message = {
        id: (Date.now() + 1).toString(),
        role: 'assistant',
        content: formatLocalAiGenerateError(error, status),
        timestamp: new Date()
      };
      setMessages(prev => {
        if (!assistantMessageId) return [...prev, errorMessage];
        return prev.map(message =>
          message.id === assistantMessageId ? errorMessage : message
        );
      });
      await refreshStatus();
    } finally {
      if (streamRenderFrame !== null) {
        window.cancelAnimationFrame(streamRenderFrame);
      }
      isGeneratingRef.current = false;
      setIsGenerating(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key !== 'Enter' || e.shiftKey) return;
    if (isComposingRef.current || e.nativeEvent.isComposing) return;
    e.preventDefault();
    sendMessage(e.currentTarget.value);
  };

  const clearChat = () => {
    setMessages([]);
  };

  const changeMaxNewTokens = (value: number) => {
    setMaxNewTokens(writeLocalAiMaxNewTokens(value));
  };

  const changeRuntimePreset = async (runtimeKind: LocalAiRuntimeKind) => {
    if (isGeneratingRef.current || isLoadingModelRef.current || isSavingRuntime) return;
    setIsSavingRuntime(true);
    setStatusError(null);
    try {
      const config = configFromLocalAiRuntimePreset(runtimeKind);
      await invoke('local_ai_save_runtime_config', { config });
      didRequestAutoLoadRef.current = false;
      window.dispatchEvent(new CustomEvent(LOCAL_AI_SETTINGS_CHANGED_EVENT));
      await refreshStatus();
    } catch (error) {
      setStatusError(`모델 선택 저장 실패: ${String(error)}`);
      await refreshStatus();
    } finally {
      setIsSavingRuntime(false);
    }
  };

  const insertToEditor = (text: string) => {
    onInsertText?.(text);
  };

  const insertAsMarkdownBlock = (text: string) => {
    const block = [
      '> [!note] Local AI',
      ...text.split('\n').map((line) => (line.trim() ? `> ${line}` : '>'))
    ].join('\n');
    onInsertText?.(block);
  };

  const replaceSelectionTarget = (targetText: string | undefined, replacementText: string) => {
    if (!targetText || !onReplaceText) return;
    const didReplace = onReplaceText(targetText, replacementText);
    if (!didReplace) {
      setStatusError('선택한 원문을 현재 문서에서 찾지 못했습니다. 원문 모드에서 같은 범위를 선택한 뒤 다시 시도해주세요.');
    }
  };

  const selectedText = () => window.getSelection()?.toString().trim() || '';

  const summarizeCurrentDocument = () => {
    if (!currentPageContent?.trim()) return;
    sendMessage(
      '현재 문서를 짧게 압축해줘. 핵심 요약, 결정 사항, 다음 액션만 한국어 Markdown으로 출력해줘.',
      { includePageContext: true }
    );
  };

  const organizeCurrentDocument = () => {
    if (!currentPageContent?.trim()) return;
    sendMessage(
      '현재 문서를 읽기 좋은 Markdown 노트로 재구성해줘. 제목, 섹션, 요점, 세부 내용, 체크리스트가 있으면 task list로 정리해줘.',
      { includePageContext: true }
    );
  };

  const rewriteSelectedText = () => {
    const targetText = selectedText();
    if (!targetText) {
      setStatusError('편집기에서 바꿀 문장을 드래그로 선택한 뒤 선택 정리를 눌러주세요.');
      return;
    }

    sendMessage(
      `아래 선택 영역만 더 명확한 한국어 Markdown 문장으로 다듬어줘. 설명 없이 치환할 본문만 출력해줘.\n\n${targetText}`,
      { replaceTarget: targetText }
    );
  };

  const canGenerate = isLocalAiReady(status) && !isGenerating;
  const showLoadButton = !status?.mtpConfigured && (
    status?.state === 'not_loaded' ||
    status?.state === 'error' ||
    status?.state === 'unsupported'
  );
  const helperText = statusError || localAiStateHelp(status);
  const showStatusCard = !isLocalAiReady(status) || Boolean(statusError) || isLoadingModel;
  const selectedRuntimeKind = runtimeKindFromLocalAiStatus(status);
  const selectedRuntimePreset = findLocalAiRuntimePreset(selectedRuntimeKind);
  const selectedRuntimeIsPublic = LOCAL_AI_RUNTIME_PRESETS.some(
    (preset) => preset.id === selectedRuntimeKind
  );

  return (
    <div className="flex flex-col h-full text-[11px]" style={{ fontSize: '11px' }}>
      <div className="p-2 border-b border-sidebar-border flex-shrink-0">
        <div className="flex items-center justify-between gap-2 mb-2">
          <div className="flex items-center gap-1.5 min-w-0">
            <span style={{ fontSize: '10px' }} aria-hidden="true">AI</span>
            <select
              value={selectedRuntimeKind}
              onChange={(event) => changeRuntimePreset(event.target.value as LocalAiRuntimeKind)}
              disabled={isGenerating || isLoadingModel || isSavingRuntime}
              className="memoji-ai-model-select"
              aria-label="AI 모델 선택"
              title={localAiModelLabel(status)}
            >
              {!selectedRuntimeIsPublic && (
                <option value={selectedRuntimeKind}>
                  {selectedRuntimePreset.shortLabel} · 기존 구성
                </option>
              )}
              {LOCAL_AI_RUNTIME_PRESETS.map((preset) => (
                <option key={preset.id} value={preset.id}>
                  {preset.shortLabel}
                </option>
              ))}
            </select>
          </div>

          <div className="flex items-center gap-1.5">
            {isSavingRuntime && (
              <Loader2 className="h-3 w-3 animate-spin text-muted-foreground" aria-hidden="true" />
            )}
            {messages.length > 0 && (
              <button
                onClick={clearChat}
                className="inline-flex items-center justify-center rounded-md text-[9px] font-medium transition-colors hover:bg-accent hover:text-accent-foreground h-5 w-5 p-0"
                title="대화 지우기"
              >
                X
              </button>
            )}
            {showLoadButton && (
              <button
                onClick={loadModel}
                disabled={isLoadingModel || status?.state === 'missing_model' || status?.state === 'missing_tokenizer'}
                className="inline-flex h-6 items-center gap-1 rounded-md border border-input bg-background px-2 text-[10px] disabled:opacity-50"
              >
                {isLoadingModel ? <Loader2 className="h-3 w-3 animate-spin" aria-hidden="true" /> : null}
                {isLoadingModel ? '로드 중' : '로드'}
              </button>
            )}
          </div>
        </div>

        {showStatusCard && (
          <div className="mb-2 rounded-md border border-sidebar-border bg-muted/50 px-2 py-1.5">
            <span className="font-medium" style={{ fontSize: '10px' }}>{localAiStateLabel(status?.state)}</span>
            <p className="mt-1 text-[9px] leading-snug text-muted-foreground break-words">
              {helperText}
            </p>
          </div>
        )}

        <div className="memoji-ai-runtime-row">
          <span className="memoji-ai-runtime-badge">
            {localAiRuntimeBadgeLabel(status)}
          </span>
          <span className="memoji-ai-runtime-detail">최대 {maxNewTokens}토큰</span>
        </div>

        <div className="memoji-ai-token-presets" aria-label="답변 길이">
          {TOKEN_PRESETS.map((preset) => (
            <button
              key={preset.value}
              type="button"
              onClick={() => changeMaxNewTokens(preset.value)}
              className="memoji-ai-token-preset"
              data-active={maxNewTokens === preset.value}
            >
              {preset.label}
            </button>
          ))}
        </div>

        <div className="memoji-ai-quick-actions">
          <button
            type="button"
            onClick={summarizeCurrentDocument}
            disabled={!canGenerate || !currentPageContent?.trim()}
            className="memoji-ai-quick-button"
            title="문서를 짧게 압축"
          >
            요약
          </button>
          <button
            type="button"
            onClick={organizeCurrentDocument}
            disabled={!canGenerate || !currentPageContent?.trim()}
            className="memoji-ai-quick-button"
            title="문서를 구조화해 재구성"
          >
            정리
          </button>
          <button
            type="button"
            onClick={rewriteSelectedText}
            disabled={!canGenerate || !onReplaceText}
            className="memoji-ai-quick-button"
            title="선택 영역 정리 후 치환"
          >
            선택
          </button>
        </div>

        <div className="flex gap-1.5 items-end">
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            onCompositionStart={() => {
              isComposingRef.current = true;
            }}
            onCompositionEnd={() => {
              isComposingRef.current = false;
            }}
            placeholder={canGenerate ? '메시지 입력' : '모델 로드 필요'}
            className="placeholder:text-[9px] flex-1 px-2 rounded-md border border-input bg-background resize-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
            style={{ height: '48px', lineHeight: '1.4', fontSize: '10px', paddingTop: '6px', paddingBottom: '4px' }}
            rows={3}
            disabled={!canGenerate}
          />
          <button
            onClick={() => sendMessage()}
            disabled={!canGenerate || !input.trim()}
            className="inline-flex items-center justify-center rounded-md font-medium transition-colors disabled:pointer-events-none disabled:opacity-50 bg-primary text-primary-foreground hover:bg-primary/90 p-0 flex-shrink-0"
            style={{ width: '28px', height: '28px' }}
            title="전송"
            aria-label="전송"
          >
            <SendHorizontal aria-hidden="true" style={{ width: '14px', height: '14px', strokeWidth: 2.2 }} />
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-3" ref={scrollRef} style={{ maxHeight: '60vh' }}>
        {messages.length === 0 ? (
          <div className="text-center text-muted-foreground px-2 leading-tight py-4" style={{ fontSize: '10px' }}>
            <p className="mb-0.5">로컬 Gemma 모델로 메모 작성을 도울 수 있습니다</p>
            <p>예: "이 내용을 요약해줘"</p>
          </div>
        ) : (
          <div className="space-y-3">
            {messages.map((message, index) => (
              <div
                key={message.id}
                className={`flex flex-col gap-0.5 ${
                  message.role === 'user' ? 'items-end' : 'items-start'
                } ${index > 0 && messages[index - 1].role === 'assistant' && message.role === 'user' ? 'mt-4' : ''}`}
              >
                <div
                  className={`max-w-[85%] rounded-lg px-2 py-1.5 text-[10px] relative group ${
                    message.role === 'user'
                      ? 'bg-primary text-primary-foreground'
                      : 'bg-muted'
                  }`}
                >
                  <p className="whitespace-pre-wrap break-words">{message.content}</p>
                  {message.role === 'assistant' && (
                    <div className="absolute bottom-1 right-1 opacity-0 group-hover:opacity-100 transition-opacity flex items-center gap-0.5">
                      {message.replaceTarget && (
                        <button
                          onClick={() => replaceSelectionTarget(message.replaceTarget, message.content)}
                          className="inline-flex items-center justify-center rounded text-[8px] hover:bg-accent/50 min-w-5 h-4 px-1"
                          title="선택 영역 치환"
                        >
                          치환
                        </button>
                      )}
                      <button
                        onClick={() => insertAsMarkdownBlock(message.content)}
                        className="inline-flex items-center justify-center rounded text-[8px] hover:bg-accent/50 min-w-5 h-4 px-1"
                        title="Markdown block으로 삽입"
                      >
                        블록
                      </button>
                      <button
                        onClick={() => insertToEditor(message.content)}
                        className="inline-flex items-center justify-center rounded text-[8px] hover:bg-accent/50 min-w-5 h-4 px-1"
                        title="에디터에 삽입"
                      >
                        삽입
                      </button>
                    </div>
                  )}
                </div>
              </div>
            ))}
            {isGenerating && (
              <div className="flex items-start gap-1 mt-4">
                <div className="bg-muted rounded-lg px-2 py-1.5 text-[10px]">
                  생성 중...
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

export default AIChatAssistant;
