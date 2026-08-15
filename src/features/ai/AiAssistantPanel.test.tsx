import { act } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { renderWithProviders, screen, userEvent, waitFor } from '../../test/render';
import type { LocalAiStatus } from '../../types/localAi';
import type { AiApi } from '../../shared/api/aiApi';
import { AiAssistantPanel } from './AiAssistantPanel';
import { hashTextAnchor, type AiProposal } from './aiProposalReducer';

const readyStatus: LocalAiStatus = {
  state: 'loaded',
  modelPath: '/models/gemma.gguf',
  tokenizerPath: '/models/tokenizer.json',
  modelExists: true,
  tokenizerExists: true,
  contextSize: 2048,
  cpuFeatures: {},
  compiledFeatures: {},
  avx512RuntimeReady: false,
  avx512Build: false,
  mtpConfigured: false,
};

const deferred = <T,>() => {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((nextResolve, nextReject) => {
    resolve = nextResolve;
    reject = nextReject;
  });
  return { promise, resolve, reject };
};

function createApi() {
  const generation = deferred<{
    text: string;
    promptTokens: number;
    generatedTokens: number;
    finishReason: string;
  }>();
  let streamListener: ((chunk: {
    requestId: string;
    tokenText: string;
    generatedTokens: number;
    done: boolean;
  }) => void) | undefined;
  const unsubscribe = vi.fn();
  const api: AiApi = {
    getStatus: vi.fn().mockResolvedValue(readyStatus),
    loadModel: vi.fn().mockResolvedValue(readyStatus),
    saveRuntimeConfig: vi.fn().mockResolvedValue(undefined),
    generate: vi.fn().mockReturnValue(generation.promise),
    cancel: vi.fn().mockResolvedValue(undefined),
    subscribeToChunks: vi.fn(async (listener) => {
      streamListener = listener;
      return unsubscribe;
    }),
  };

  return {
    api,
    generation,
    unsubscribe,
    emit: (chunk: Parameters<NonNullable<typeof streamListener>>[0]) => streamListener?.(chunk),
  };
}

async function startGeneration(api: AiApi) {
  renderWithProviders(<AiAssistantPanel api={api} currentPageContent="# 출시" />);
  await waitFor(() => expect(screen.getByLabelText('AI 메시지')).toBeEnabled());
  await userEvent.type(screen.getByLabelText('AI 메시지'), '요약해줘');
  await userEvent.click(screen.getByRole('button', { name: '전송' }));
}

describe('AiAssistantPanel', () => {
  it('enters generating state and sends only once for Enter', async () => {
    const fixture = createApi();
    renderWithProviders(<AiAssistantPanel api={fixture.api} />);
    const input = await screen.findByLabelText('AI 메시지');
    await waitFor(() => expect(input).toBeEnabled());
    await userEvent.type(input, '한 번만{Enter}');

    expect(fixture.api.generate).toHaveBeenCalledTimes(1);
    expect(screen.getByRole('button', { name: '생성 취소' })).toBeVisible();
  });

  it('cancels the active request and ignores chunks that arrive afterward', async () => {
    const fixture = createApi();
    await startGeneration(fixture.api);
    const requestId = vi.mocked(fixture.api.generate).mock.calls[0][0].requestId;

    await userEvent.click(screen.getByRole('button', { name: '생성 취소' }));
    expect(fixture.api.cancel).toHaveBeenCalledWith(requestId);

    act(() => {
      fixture.emit({ requestId, tokenText: '늦은 응답', generatedTokens: 1, done: false });
    });
    expect(screen.queryByText('늦은 응답')).not.toBeInTheDocument();
  });

  it('removes the stream listener when unmounted', async () => {
    const fixture = createApi();
    const view = renderWithProviders(<AiAssistantPanel api={fixture.api} />);
    await waitFor(() => expect(screen.getByLabelText('AI 메시지')).toBeEnabled());
    view.unmount();
    expect(fixture.unsubscribe).toHaveBeenCalledTimes(1);
  });

  it('batches multiple stream chunks into one animation frame', async () => {
    const fixture = createApi();
    const frameCallbacks: FrameRequestCallback[] = [];
    const requestFrame = vi.spyOn(window, 'requestAnimationFrame').mockImplementation((callback) => {
      frameCallbacks.push(callback);
      return frameCallbacks.length;
    });

    await startGeneration(fixture.api);
    const requestId = vi.mocked(fixture.api.generate).mock.calls[0][0].requestId;
    act(() => {
      fixture.emit({ requestId, tokenText: '첫째', generatedTokens: 1, done: false });
      fixture.emit({ requestId, tokenText: '둘째', generatedTokens: 2, done: false });
    });

    expect(requestFrame).toHaveBeenCalledTimes(1);
    expect(screen.queryByText('첫째둘째')).not.toBeInTheDocument();
    act(() => frameCallbacks[0](0));
    expect(screen.getByText('첫째둘째')).toBeVisible();
    requestFrame.mockRestore();
  });

  it('turns an anchored editor selection into a reviewable proposal before applying', async () => {
    const fixture = createApi();
    const onApplyProposal = vi.fn().mockResolvedValue(true);
    const proposalApi = {
      list: vi.fn().mockResolvedValue([]),
      create: vi.fn(async (proposal: AiProposal) => proposal),
      updateStatus: vi.fn().mockResolvedValue(undefined),
    };
    renderWithProviders(
      <AiAssistantPanel
        api={fixture.api}
        proposalApi={proposalApi}
        currentPageId="page-1"
        currentPageContent="앞 기존 문장 뒤"
        onApplyProposal={onApplyProposal}
      />,
    );
    await waitFor(() => expect(screen.getByLabelText('AI 메시지')).toBeEnabled());

    act(() => window.dispatchEvent(new CustomEvent('memoji:selection-ai', {
      detail: {
        action: 'rewrite',
        selection: {
          pageId: 'page-1',
          baseRevision: 0,
          text: '기존 문장',
          start: 2,
          end: 7,
          textHash: hashTextAnchor('기존 문장'),
        },
      },
    })));
    await waitFor(() => expect(fixture.api.generate).toHaveBeenCalledTimes(1));
    await act(async () => fixture.generation.resolve({
      text: '개선 문장',
      promptTokens: 5,
      generatedTokens: 2,
      finishReason: 'stop',
    }));

    expect(await screen.findByText('선택 영역 다듬기')).toBeVisible();
    expect(proposalApi.create).toHaveBeenCalledTimes(1);
    await userEvent.click(screen.getByRole('button', { name: '변경 비교' }));
    await userEvent.click(screen.getByRole('button', { name: '변경 적용' }));
    expect(onApplyProposal).toHaveBeenCalledTimes(1);
    await waitFor(() => expect(screen.getByText('적용됨')).toBeVisible());
  });
});
