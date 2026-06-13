import React, { useCallback, useEffect, useRef, useState } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { ChevronDown, Cpu, Database, Download, FolderOpen, Gauge, Loader2, Settings, Upload } from 'lucide-react';
import { toast } from 'sonner';
import {
  BuiltInPluginState,
  getBuiltInPlugins,
  setBuiltInPluginEnabled,
} from '../editor/plugins/registry';
import {
  LOCAL_AI_MAX_NEW_TOKENS_DEFAULT,
  LOCAL_AI_MAX_NEW_TOKENS_MAX,
  LOCAL_AI_MAX_NEW_TOKENS_MIN,
  LOCAL_AI_MAX_NEW_TOKENS_STEP,
  formatLocalAiBytes,
  formatLocalAiSpeed,
  localAiRuntimeLabel,
  LocalAiBenchmarkResult,
  LocalAiRuntimeConfig,
  LocalAiRuntimeConfigView,
  LocalAiRuntimeTestResult,
  LocalAiStatus,
  localAiModelLabel,
  localAiStateHelp,
  localAiStateLabel,
  readLocalAiMaxNewTokens,
  writeLocalAiMaxNewTokens,
} from '../types/localAi';
import {
  EDITOR_FONT_FAMILY_LABELS,
  EditorFontFamily,
  readEditorPreferences,
  writeEditorPreferences,
} from '../utils/editorPreferences';
import { tauriStorage } from '../utils/tauriStorage';
import { Button } from './ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from './ui/dialog';
import { Input } from './ui/input';
import { Label } from './ui/label';
import { Switch } from './ui/switch';

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  appTitle: string;
  onAppTitleChange: (newTitle: string) => void;
  onDataImported?: () => void | Promise<void>;
}

export const SettingsModal: React.FC<SettingsModalProps> = ({
  isOpen,
  onClose,
  appTitle,
  onAppTitleChange,
  onDataImported,
}) => {
  const [title, setTitle] = useState(appTitle);
  const [dataPath, setDataPath] = useState('');
  const [aiStatus, setAiStatus] = useState<LocalAiStatus | null>(null);
  const [isLoadingModel, setIsLoadingModel] = useState(false);
  const [isBenchmarkingAi, setIsBenchmarkingAi] = useState(false);
  const [isSavingRuntimeConfig, setIsSavingRuntimeConfig] = useState(false);
  const [isTestingRuntimeConfig, setIsTestingRuntimeConfig] = useState(false);
  const [runtimeConfig, setRuntimeConfig] = useState<LocalAiRuntimeConfigView | null>(null);
  const [runtimeTestResult, setRuntimeTestResult] = useState<LocalAiRuntimeTestResult | null>(null);
  const [aiBenchmark, setAiBenchmark] = useState<LocalAiBenchmarkResult | null>(null);
  const [isImportingDatabase, setIsImportingDatabase] = useState(false);
  const [isExportingPages, setIsExportingPages] = useState(false);
  const [maxNewTokens, setMaxNewTokens] = useState(readLocalAiMaxNewTokens);
  const [editorPreferences, setEditorPreferences] = useState(readEditorPreferences);
  const [builtInPlugins, setBuiltInPlugins] = useState<BuiltInPluginState[]>([]);
  const [builtInPluginsOpen, setBuiltInPluginsOpen] = useState(false);
  const databaseInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setTitle(appTitle);
  }, [appTitle]);

  const loadDataPath = useCallback(async () => {
    try {
      setDataPath(await invoke<string>('get_data_path'));
    } catch {
      setDataPath('브라우저 모드');
    }
  }, []);

  const loadAiStatus = useCallback(async () => {
    try {
      setAiStatus(await invoke<LocalAiStatus>('local_ai_status'));
    } catch (error) {
      toast.error('AI 상태 확인 실패: ' + String(error));
    }
  }, []);

  const loadRuntimeConfig = useCallback(async () => {
    try {
      setRuntimeConfig(await invoke<LocalAiRuntimeConfigView>('local_ai_get_runtime_config'));
      setRuntimeTestResult(null);
    } catch (error) {
      toast.error('AI 서버 설정 확인 실패: ' + String(error));
    }
  }, []);

  useEffect(() => {
    if (!isOpen) return;
    setMaxNewTokens(readLocalAiMaxNewTokens());
    setEditorPreferences(readEditorPreferences());
    setBuiltInPlugins(getBuiltInPlugins());
    setBuiltInPluginsOpen(false);
    setAiBenchmark(null);
    loadDataPath();
    loadAiStatus();
    loadRuntimeConfig();
  }, [isOpen, loadAiStatus, loadDataPath, loadRuntimeConfig]);

  const saveTitle = () => {
    const nextTitle = title.trim();
    if (!nextTitle) {
      toast.error('앱 제목을 입력하세요.');
      return;
    }
    onAppTitleChange(nextTitle);
    toast.success('설정 저장됨');
    onClose();
  };

  const loadLocalAi = async () => {
    setIsLoadingModel(true);
    try {
      const status = await invoke<LocalAiStatus>('local_ai_load');
      setAiStatus(status);
      toast[status.state === 'loaded' ? 'success' : 'info'](localAiStateLabel(status.state));
    } catch (error) {
      toast.error('모델 로드 실패: ' + String(error));
      await loadAiStatus();
    } finally {
      setIsLoadingModel(false);
    }
  };

  const runLocalAiBenchmark = async () => {
    setIsBenchmarkingAi(true);
    try {
      const result = await invoke<LocalAiBenchmarkResult>('local_ai_benchmark');
      setAiBenchmark(result);
      setAiStatus(result.status);
      toast.success(`AI 진단 완료: ${formatLocalAiSpeed(result.tokensPerSecond)}`);
    } catch (error) {
      const message = String(error).slice(0, 180);
      toast.error('AI 진단 실패: ' + message);
      await loadAiStatus();
    } finally {
      setIsBenchmarkingAi(false);
    }
  };

  const changeRuntimeConfig = (patch: Partial<LocalAiRuntimeConfig>) => {
    setRuntimeConfig((current) => ({
      serverEnabled: false,
      endpoint: 'http://127.0.0.1:8080/v1/chat/completions',
      model: 'google/gemma-4-E2B-it',
      envConfigured: false,
      envTakesPrecedence: false,
      ...current,
      ...patch,
    }));
    setRuntimeTestResult(null);
  };

  const saveRuntimeConfig = async () => {
    if (!runtimeConfig) return;
    setIsSavingRuntimeConfig(true);
    try {
      const saved = await invoke<LocalAiRuntimeConfigView>('local_ai_save_runtime_config', {
        config: {
          serverEnabled: runtimeConfig.serverEnabled,
          endpoint: runtimeConfig.endpoint,
          model: runtimeConfig.model,
          draftModel: runtimeConfig.draftModel || undefined,
        },
      });
      setRuntimeConfig(saved);
      await loadAiStatus();
      toast.success(saved.serverEnabled ? '고속 로컬 서버 설정 저장됨' : '내장 모델 모드로 저장됨');
    } catch (error) {
      toast.error('AI 서버 설정 저장 실패: ' + String(error).slice(0, 180));
    } finally {
      setIsSavingRuntimeConfig(false);
    }
  };

  const testRuntimeConfig = async () => {
    if (!runtimeConfig) return;
    setIsTestingRuntimeConfig(true);
    try {
      const result = await invoke<LocalAiRuntimeTestResult>('local_ai_test_runtime_config', {
        config: {
          serverEnabled: runtimeConfig.serverEnabled,
          endpoint: runtimeConfig.endpoint,
          model: runtimeConfig.model,
          draftModel: runtimeConfig.draftModel || undefined,
        },
      });
      setRuntimeTestResult(result);
      toast.success(result.message);
    } catch (error) {
      const message = String(error).slice(0, 180);
      setRuntimeTestResult({
        ok: false,
        message,
        generatedTokens: 0,
        tokensPerSecond: 0,
      });
      toast.error('AI 서버 연결 실패: ' + message);
    } finally {
      setIsTestingRuntimeConfig(false);
    }
  };

  const changeMaxNewTokens = (value: number) => {
    setMaxNewTokens(writeLocalAiMaxNewTokens(value));
  };

  const changeFontFamily = (fontFamily: EditorFontFamily) => {
    setEditorPreferences(writeEditorPreferences({ fontFamily }));
  };

  const togglePlugin = (pluginId: BuiltInPluginState['id'], enabled: boolean) => {
    setBuiltInPlugins(setBuiltInPluginEnabled(pluginId, enabled));
  };

  const openDataFolder = async () => {
    try {
      await invoke('open_data_folder');
    } catch (error) {
      toast.error('폴더 열기 실패: ' + String(error));
    }
  };

  const importDatabase = async (file: File | null | undefined) => {
    if (!file) return;

    setIsImportingDatabase(true);
    try {
      const summary = await tauriStorage.importDatabaseFile(file);
      await onDataImported?.();
      const addedCount = summary.imported + summary.duplicated;
      toast.success(
        `DB 가져오기 완료: ${addedCount}개 추가, ${summary.skipped}개 중복 건너뜀`
      );
    } catch (error) {
      toast.error('DB 가져오기 실패: ' + String(error));
    } finally {
      setIsImportingDatabase(false);
      if (databaseInputRef.current) {
        databaseInputRef.current.value = '';
      }
    }
  };

  const exportAllPages = async () => {
    setIsExportingPages(true);
    try {
      const summary = await tauriStorage.exportPagesZip();
      toast.success(`전체 페이지 ZIP 내보내기 완료: ${summary.exported}개 파일`, {
        description: summary.zip_path,
      });
    } catch (error) {
      toast.error('전체 페이지 ZIP 내보내기 실패: ' + String(error));
    } finally {
      setIsExportingPages(false);
    }
  };

  const cpuFeature = (name: string) => aiStatus?.cpuFeatures?.[name] ? '감지됨' : '없음';
  const buildFeature = (name: string) => aiStatus?.compiledFeatures?.[name] ? '활성' : '비활성';
  const canLoadModel = !aiStatus?.mtpConfigured && !!aiStatus?.modelExists && !!aiStatus?.tokenizerExists && !isLoadingModel;
  const canBenchmarkAi = !aiStatus?.mtpConfigured && !!aiStatus?.modelExists && !!aiStatus?.tokenizerExists && !isBenchmarkingAi;
  const runtimeConfigLockedByEnv = runtimeConfig?.envTakesPrecedence === true;

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent
        className="custom-scrollbar max-w-3xl max-h-[80vh] overflow-y-auto text-sm"
        aria-describedby={undefined}
      >
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Settings className="h-5 w-5" />
            설정
          </DialogTitle>
        </DialogHeader>

        <div className="memoji-settings-content">
          <section className="memoji-settings-section">
            <div className="memoji-settings-section-header">
              <h3 className="text-base font-semibold">일반</h3>
              <p className="text-xs leading-5 text-muted-foreground">
                로컬 저장, 즉시 렌더링 편집, 로컬 Gemma AI를 사용하는 오프라인 노트 앱입니다.
              </p>
            </div>
            <div className="memoji-settings-field max-w-xl">
              <Label htmlFor="app-title">앱 제목</Label>
              <Input id="app-title" value={title} onChange={(event) => setTitle(event.target.value)} />
            </div>
          </section>

          <section className="memoji-settings-section">
            <h3 className="text-base font-semibold">편집기</h3>
            <div className="max-w-xl">
              <div className="memoji-settings-field">
                <Label htmlFor="editor-font-family">글자체</Label>
                <select
                  id="editor-font-family"
                  value={editorPreferences.fontFamily}
                  onChange={(event) => changeFontFamily(event.target.value as EditorFontFamily)}
                  className="h-9 w-full rounded-md border border-input bg-background px-3"
                >
                  {Object.entries(EDITOR_FONT_FAMILY_LABELS).map(([value, label]) => (
                    <option key={value} value={value}>{label}</option>
                  ))}
                </select>
              </div>
            </div>

            <div className="memoji-settings-collapsible">
              <button
                type="button"
                className="memoji-settings-collapsible-trigger"
                onClick={() => setBuiltInPluginsOpen((open) => !open)}
                aria-expanded={builtInPluginsOpen}
              >
                <span>내장 기능</span>
                <ChevronDown className="h-4 w-4" aria-hidden="true" />
              </button>
              {builtInPluginsOpen && (
                <div className="memoji-settings-plugin-list">
                  {builtInPlugins.map((plugin) => (
                    <div key={plugin.id} className="memoji-settings-plugin-card">
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <p className="font-medium">{plugin.name}</p>
                          <p className="text-xs leading-5 text-muted-foreground">{plugin.description}</p>
                        </div>
                        <Switch
                          checked={plugin.enabled}
                          onCheckedChange={(checked) => togglePlugin(plugin.id, checked)}
                          aria-label={`${plugin.name} 켜기/끄기`}
                        />
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </section>

          <section className="memoji-settings-section">
            <div className="memoji-settings-card">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <h3 className="text-base font-semibold">로컬 AI</h3>
                  <p className="mt-1 text-xs leading-5 text-muted-foreground">{localAiStateHelp(aiStatus)}</p>
                </div>
                {!aiStatus?.mtpConfigured && (
                  <Button onClick={loadLocalAi} disabled={!canLoadModel} size="sm" className="min-w-24">
                    {isLoadingModel ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : null}
                    모델 로드
                  </Button>
                )}
              </div>
              <div className="mt-4 grid gap-3 text-xs sm:grid-cols-3">
                <div className="rounded-md bg-muted/50 p-3">
                  <p className="font-medium">상태</p>
                  <p className="mt-1 text-muted-foreground">{localAiStateLabel(aiStatus?.state)}</p>
                </div>
                <div className="rounded-md bg-muted/50 p-3">
                  <p className="font-medium">모델</p>
                  <p className="mt-1 break-words text-muted-foreground">{localAiModelLabel(aiStatus)}</p>
                </div>
                <div className="rounded-md bg-muted/50 p-3">
                  <p className="font-medium">Context</p>
                  <p className="mt-1 text-muted-foreground">{aiStatus?.contextSize ?? 2048}</p>
                </div>
              </div>
            </div>

            <div className="memoji-settings-card">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <h3 className="text-base font-semibold">고속 로컬 서버</h3>
                  <p className="mt-1 text-xs leading-5 text-muted-foreground">
                    llama.cpp, vLLM, Ollama/LocalAI 같은 VDI 내부 OpenAI 호환 서버를 127.0.0.1로 붙여 긴 답변을 빠르게 스트리밍합니다.
                  </p>
                </div>
                <Switch
                  checked={runtimeConfig?.serverEnabled ?? false}
                  disabled={runtimeConfigLockedByEnv}
                  onCheckedChange={(checked) => changeRuntimeConfig({ serverEnabled: checked })}
                  aria-label="고속 로컬 서버 사용"
                />
              </div>
              {runtimeConfigLockedByEnv && (
                <p className="mt-3 text-xs text-muted-foreground">
                  현재 VDI 환경 변수 설정이 우선 적용 중입니다. 관리자 배포 설정을 사용합니다.
                </p>
              )}
              <div className="mt-4 grid gap-3">
                <div className="memoji-settings-field">
                  <Label htmlFor="local-ai-server-endpoint">Endpoint</Label>
                  <Input
                    id="local-ai-server-endpoint"
                    value={runtimeConfig?.endpoint ?? ''}
                    disabled={runtimeConfigLockedByEnv}
                    onChange={(event) => changeRuntimeConfig({ endpoint: event.target.value })}
                    placeholder="http://127.0.0.1:8080/v1/chat/completions"
                    className="font-mono text-xs"
                  />
                  <p className="text-xs text-muted-foreground">
                    보안상 localhost, 127.0.0.1, ::1만 허용합니다. 클라우드/API URL은 저장되지 않습니다.
                  </p>
                </div>
                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="memoji-settings-field">
                    <Label htmlFor="local-ai-server-model">Model</Label>
                    <Input
                      id="local-ai-server-model"
                      value={runtimeConfig?.model ?? ''}
                      disabled={runtimeConfigLockedByEnv}
                      onChange={(event) => changeRuntimeConfig({ model: event.target.value })}
                      placeholder="google/gemma-4-E2B-it"
                    />
                  </div>
                  <div className="memoji-settings-field">
                    <Label htmlFor="local-ai-server-draft">Draft / MTP label</Label>
                    <Input
                      id="local-ai-server-draft"
                      value={runtimeConfig?.draftModel ?? ''}
                      disabled={runtimeConfigLockedByEnv}
                      onChange={(event) => changeRuntimeConfig({ draftModel: event.target.value })}
                      placeholder="server option"
                    />
                  </div>
                </div>
              </div>
              <div className="mt-4 flex flex-wrap items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={testRuntimeConfig}
                  disabled={runtimeConfigLockedByEnv || !runtimeConfig?.serverEnabled || isTestingRuntimeConfig}
                >
                  {isTestingRuntimeConfig ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : null}
                  연결 테스트
                </Button>
                <Button
                  size="sm"
                  onClick={saveRuntimeConfig}
                  disabled={runtimeConfigLockedByEnv || isSavingRuntimeConfig}
                >
                  {isSavingRuntimeConfig ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : null}
                  서버 설정 저장
                </Button>
                {runtimeTestResult && (
                  <span className={runtimeTestResult.ok ? 'text-xs text-emerald-500' : 'text-xs text-destructive'}>
                    {runtimeTestResult.message}
                  </span>
                )}
              </div>
            </div>

            <div className="memoji-settings-card">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-base font-semibold">답변 토큰</h3>
                  <p className="mt-1 text-xs text-muted-foreground">고속 로컬 서버에서는 긴 답변을 그대로 스트리밍합니다.</p>
                </div>
                <strong>{maxNewTokens}</strong>
              </div>
              <input
                type="range"
                min={LOCAL_AI_MAX_NEW_TOKENS_MIN}
                max={LOCAL_AI_MAX_NEW_TOKENS_MAX}
                step={LOCAL_AI_MAX_NEW_TOKENS_STEP}
                value={maxNewTokens}
                onChange={(event) => changeMaxNewTokens(Number(event.target.value))}
                className="mt-4 w-full accent-primary"
              />
              <div className="mt-3 flex flex-wrap items-center gap-3">
                <span className="text-xs text-muted-foreground">{LOCAL_AI_MAX_NEW_TOKENS_MIN}</span>
                <Input
                  type="number"
                  min={LOCAL_AI_MAX_NEW_TOKENS_MIN}
                  max={LOCAL_AI_MAX_NEW_TOKENS_MAX}
                  step={LOCAL_AI_MAX_NEW_TOKENS_STEP}
                  value={maxNewTokens}
                  onChange={(event) => changeMaxNewTokens(Number(event.target.value))}
                  className="h-9 w-28"
                />
                <span className="text-xs text-muted-foreground">{LOCAL_AI_MAX_NEW_TOKENS_MAX}</span>
                <Button variant="outline" size="sm" onClick={() => changeMaxNewTokens(LOCAL_AI_MAX_NEW_TOKENS_DEFAULT)}>
                  기본값
                </Button>
              </div>
            </div>

            <div className="memoji-settings-card">
              <h3 className="flex items-center gap-2 text-base font-semibold">
                <Cpu className="h-4 w-4" />
                CPU / AVX-512
              </h3>
              <div className="mt-3 grid gap-2 text-xs sm:grid-cols-2">
                <span>Runtime: {localAiRuntimeLabel(aiStatus)}</span>
                <span>Model file: {formatLocalAiBytes(aiStatus?.modelFileSizeBytes)}</span>
                <span>Runtime AVX-512F: {cpuFeature('avx512f')}</span>
                <span>Build AVX-512F: {buildFeature('avx512f')}</span>
                <span>Runtime AVX-512BW: {cpuFeature('avx512bw')}</span>
                <span>Build AVX-512BW: {buildFeature('avx512bw')}</span>
                <span>Runtime AVX-512VL: {cpuFeature('avx512vl')}</span>
                <span>Build AVX-512VL: {buildFeature('avx512vl')}</span>
              </div>
            </div>

            <div className="memoji-settings-card">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <h3 className="flex items-center gap-2 text-base font-semibold">
                    <Gauge className="h-4 w-4" />
                    VDI 성능 진단
                  </h3>
                  <p className="mt-1 text-xs leading-5 text-muted-foreground">
                    이 VDI에서 내장 Gemma 모델을 직접 로드하고 16토큰을 생성해 실제 속도를 측정합니다.
                  </p>
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={runLocalAiBenchmark}
                  disabled={!canBenchmarkAi}
                  className="min-w-24"
                >
                  {isBenchmarkingAi ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : null}
                  진단 실행
                </Button>
              </div>
              {aiStatus?.mtpConfigured ? (
                <p className="mt-3 text-xs text-muted-foreground">
                  현재는 VDI 스트리밍 모드입니다. 내장 모델 진단은 MTP 설정을 끈 상태에서 실행하세요.
                </p>
              ) : (
                <div className="mt-4 grid gap-3 text-xs sm:grid-cols-4">
                  <div className="rounded-md bg-muted/50 p-3">
                    <p className="font-medium">Load</p>
                    <p className="mt-1 text-muted-foreground">
                      {aiBenchmark?.cachedModel ? 'cached' : aiBenchmark?.loadMs != null ? `${aiBenchmark.loadMs} ms` : '-'}
                    </p>
                  </div>
                  <div className="rounded-md bg-muted/50 p-3">
                    <p className="font-medium">Generate</p>
                    <p className="mt-1 text-muted-foreground">
                      {aiBenchmark ? `${aiBenchmark.generateMs} ms` : '-'}
                    </p>
                  </div>
                  <div className="rounded-md bg-muted/50 p-3">
                    <p className="font-medium">Speed</p>
                    <p className="mt-1 text-muted-foreground">
                      {formatLocalAiSpeed(aiBenchmark?.tokensPerSecond)}
                    </p>
                  </div>
                  <div className="rounded-md bg-muted/50 p-3">
                    <p className="font-medium">판정</p>
                    <p className="mt-1 text-muted-foreground">{aiBenchmark?.speedLabel ?? '-'}</p>
                  </div>
                </div>
              )}
              {aiBenchmark?.recommendation && (
                <p className="mt-3 text-xs leading-5 text-muted-foreground">
                  {aiBenchmark.recommendation}
                </p>
              )}
            </div>
          </section>

          <section className="memoji-settings-section max-w-2xl">
            <h3 className="flex items-center gap-2 text-base font-semibold">
              <Database className="h-4 w-4" />
              데이터 저장 위치
            </h3>
            <div className="flex gap-2">
              <Input value={dataPath} readOnly className="font-mono text-xs" />
              <Button variant="outline" size="sm" onClick={openDataFolder}>
                <FolderOpen className="mr-1 h-4 w-4" />
                열기
              </Button>
            </div>
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <input
                ref={databaseInputRef}
                type="file"
                accept=".db,application/x-sqlite3,application/vnd.sqlite3,application/octet-stream"
                className="hidden"
                onChange={(event) => importDatabase(event.target.files?.[0])}
              />
              <Button
                variant="outline"
                size="sm"
                onClick={() => databaseInputRef.current?.click()}
                disabled={isImportingDatabase}
              >
                {isImportingDatabase ? (
                  <Loader2 className="mr-1 h-4 w-4 animate-spin" />
                ) : (
                  <Upload className="mr-1 h-4 w-4" />
                )}
                기존 memoji.db 가져오기
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={exportAllPages}
                disabled={isExportingPages}
              >
                {isExportingPages ? (
                  <Loader2 className="mr-1 h-4 w-4 animate-spin" />
                ) : (
                  <Download className="mr-1 h-4 w-4" />
                )}
                전체 페이지 ZIP 내보내기
              </Button>
              <span className="text-xs text-muted-foreground">
                가져오기는 현재 DB를 백업한 뒤 병합하고, 내보내기는 페이지별 Markdown 파일과 manifest.json을 ZIP으로 저장합니다.
              </span>
            </div>
          </section>

        </div>

        <div className="flex justify-end gap-2 border-t pt-4">
          <Button variant="outline" onClick={onClose}>취소</Button>
          <Button onClick={saveTitle}>저장</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
};
