import { useCallback, useEffect, useRef, useState } from 'react';
import type { AiApi } from '../../shared/api/aiApi';
import type { AiGenerationCallbacks, AiGenerationRequest } from './aiTypes';

export function useAiStream(api: AiApi, callbacks: AiGenerationCallbacks) {
  const [isGenerating, setIsGenerating] = useState(false);
  const activeRequestRef = useRef<string | null>(null);
  const streamedTextRef = useRef('');
  const renderFrameRef = useRef<number | null>(null);
  const callbacksRef = useRef(callbacks);
  callbacksRef.current = callbacks;

  const cancelScheduledRender = useCallback(() => {
    if (renderFrameRef.current !== null) {
      window.cancelAnimationFrame(renderFrameRef.current);
      renderFrameRef.current = null;
    }
  }, []);

  useEffect(() => {
    let disposed = false;
    let unsubscribe: (() => void) | undefined;
    void api.subscribeToChunks((chunk) => {
      if (disposed || chunk.done || activeRequestRef.current !== chunk.requestId) return;
      streamedTextRef.current += chunk.tokenText;
      if (renderFrameRef.current !== null) return;
      renderFrameRef.current = window.requestAnimationFrame(() => {
        renderFrameRef.current = null;
        if (activeRequestRef.current !== chunk.requestId) return;
        callbacksRef.current.onStreamText(chunk.requestId, streamedTextRef.current);
      });
    }).then((nextUnsubscribe) => {
      if (disposed) nextUnsubscribe();
      else unsubscribe = nextUnsubscribe;
    });

    return () => {
      disposed = true;
      unsubscribe?.();
      cancelScheduledRender();
      activeRequestRef.current = null;
    };
  }, [api, cancelScheduledRender]);

  const generate = useCallback(async (generation: AiGenerationRequest) => {
    if (activeRequestRef.current) return;
    activeRequestRef.current = generation.requestId;
    streamedTextRef.current = '';
    setIsGenerating(true);
    try {
      const response = await api.generate(generation);
      if (activeRequestRef.current !== generation.requestId) return;
      cancelScheduledRender();
      callbacksRef.current.onComplete(
        generation.requestId,
        response,
        streamedTextRef.current,
      );
    } catch (error) {
      if (activeRequestRef.current !== generation.requestId) return;
      callbacksRef.current.onError(generation.requestId, error);
    } finally {
      if (activeRequestRef.current === generation.requestId) {
        activeRequestRef.current = null;
        setIsGenerating(false);
      }
    }
  }, [api, cancelScheduledRender]);

  const cancel = useCallback(async () => {
    const requestId = activeRequestRef.current;
    if (!requestId) return;
    activeRequestRef.current = null;
    streamedTextRef.current = '';
    cancelScheduledRender();
    setIsGenerating(false);
    callbacksRef.current.onCancel(requestId);
    await api.cancel(requestId);
  }, [api, cancelScheduledRender]);

  return {
    isGenerating,
    activeRequestId: activeRequestRef.current,
    generate,
    cancel,
  };
}
