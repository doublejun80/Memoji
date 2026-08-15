import { useCallback, useEffect, useRef, useState } from 'react';
import type { AiApi } from '../../shared/api/aiApi';
import {
  configFromLocalAiRuntimePreset,
  LOCAL_AI_SETTINGS_CHANGED_EVENT,
  type LocalAiRuntimeKind,
  type LocalAiStatus,
} from '../../types/localAi';

export function useAiRuntimeStatus(api: AiApi, isGenerating: boolean) {
  const [status, setStatus] = useState<LocalAiStatus | null>(null);
  const [statusError, setStatusError] = useState<string | null>(null);
  const [isLoadingModel, setIsLoadingModel] = useState(false);
  const [isSavingRuntime, setIsSavingRuntime] = useState(false);
  const loadingRef = useRef(false);
  const generatingRef = useRef(isGenerating);
  const didAutoLoadRef = useRef(false);
  generatingRef.current = isGenerating;

  const refreshStatus = useCallback(async () => {
    try {
      const nextStatus = await api.getStatus();
      setStatus(nextStatus);
      setStatusError(null);
      return nextStatus;
    } catch (error) {
      setStatusError(String(error));
      return null;
    }
  }, [api]);

  const loadModel = useCallback(async () => {
    if (loadingRef.current) return;
    loadingRef.current = true;
    setIsLoadingModel(true);
    try {
      const nextStatus = await api.loadModel();
      setStatus(nextStatus);
      setStatusError(nextStatus.lastError || null);
    } catch (error) {
      setStatusError(String(error));
      await refreshStatus();
    } finally {
      loadingRef.current = false;
      setIsLoadingModel(false);
    }
  }, [api, refreshStatus]);

  const changeRuntime = useCallback(async (runtimeKind: LocalAiRuntimeKind) => {
    if (generatingRef.current || loadingRef.current || isSavingRuntime) return;
    setIsSavingRuntime(true);
    setStatusError(null);
    try {
      await api.saveRuntimeConfig(configFromLocalAiRuntimePreset(runtimeKind));
      didAutoLoadRef.current = false;
      window.dispatchEvent(new CustomEvent(LOCAL_AI_SETTINGS_CHANGED_EVENT));
      await refreshStatus();
    } catch (error) {
      setStatusError(`모델 선택 저장 실패: ${String(error)}`);
      await refreshStatus();
    } finally {
      setIsSavingRuntime(false);
    }
  }, [api, isSavingRuntime, refreshStatus]);

  useEffect(() => {
    void refreshStatus();
    const interval = window.setInterval(() => {
      if (!generatingRef.current && !loadingRef.current) void refreshStatus();
    }, 10_000);
    return () => window.clearInterval(interval);
  }, [refreshStatus]);

  useEffect(() => {
    const syncSettings = () => void refreshStatus();
    window.addEventListener(LOCAL_AI_SETTINGS_CHANGED_EVENT, syncSettings);
    window.addEventListener('storage', syncSettings);
    return () => {
      window.removeEventListener(LOCAL_AI_SETTINGS_CHANGED_EVENT, syncSettings);
      window.removeEventListener('storage', syncSettings);
    };
  }, [refreshStatus]);

  useEffect(() => {
    if (didAutoLoadRef.current) return;
    if (
      status?.mtpConfigured ||
      status?.state !== 'not_loaded' ||
      !status.modelExists ||
      !status.tokenizerExists
    ) return;
    didAutoLoadRef.current = true;
    void loadModel();
  }, [loadModel, status]);

  return {
    status,
    statusError,
    setStatusError,
    isLoadingModel,
    isSavingRuntime,
    refreshStatus,
    loadModel,
    changeRuntime,
  };
}

