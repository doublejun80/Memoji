import React, { useCallback, useEffect, useRef, useState } from 'react';
import { invoke } from '@tauri-apps/api/core';
import {
  AppWindow,
  Bot,
  ChevronDown,
  Cpu,
  Database,
  Download,
  FolderOpen,
  Gauge,
  Loader2,
  PenLine,
  Settings,
  Upload,
} from 'lucide-react';
import { toast } from 'sonner';
import {
  configFromLocalAiRuntimePreset,
  findLocalAiRuntimePreset,
  formatLocalAiBytes,
  formatLocalAiSpeed,
  LOCAL_AI_MAX_NEW_TOKENS_DEFAULT,
  LOCAL_AI_MAX_NEW_TOKENS_MAX,
  LOCAL_AI_MAX_NEW_TOKENS_MIN,
  LOCAL_AI_MAX_NEW_TOKENS_STEP,
  LOCAL_AI_RUNTIME_PRESETS,
  LOCAL_AI_SETTINGS_CHANGED_EVENT,
  localAiModelLabel,
  localAiRuntimeLabel,
  localAiStateHelp,
  localAiStateLabel,
  LocalAiBenchmarkResult,
  LocalAiManagedRuntimeStatus,
  LocalAiRuntimeConfig,
  LocalAiRuntimeConfigView,
  LocalAiRuntimeKind,
  LocalAiRuntimeTestResult,
  LocalAiStatus,
  readLocalAiMaxNewTokens,
  runtimeKindFromLocalAiConfig,
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
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from './ui/dialog';
import { Input } from './ui/input';
import { Label } from './ui/label';

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  appTitle: string;
  onAppTitleChange: (newTitle: string) => void | Promise<void>;
  onDataImported?: () => void | Promise<void>;
}

type SettingsSectionId = 'general' | 'editor' | 'local-ai' | 'data';

const SETTINGS_SECTIONS = [
  { id: 'general' as const, label: '일반', description: '앱 이름', icon: AppWindow },
  { id: 'editor' as const, label: '편집기', description: '글자체', icon: PenLine },
  { id: 'local-ai' as const, label: '로컬 AI', description: '런타임과 속도', icon: Bot },
  { id: 'data' as const, label: '데이터', description: '저장과 백업', icon: Database },
];

const TOKEN_PRESETS = [
  { label: '빠르게', value: 64 },
  { label: '균형', value: LOCAL_AI_MAX_NEW_TOKENS_DEFAULT },
  { label: '길게', value: 512 },
];

export const SettingsModal: React.FC<SettingsModalProps> = ({
  isOpen,
  onClose,
  appTitle,
  onAppTitleChange,
  onDataImported,
}) => {
  const [activeSection, setActiveSection] = useState<SettingsSectionId>('general');
  const [title, setTitle] = useState(appTitle);
  const [isSavingTitle, setIsSavingTitle] = useState(false);
  const [dataPath, setDataPath] = useState('');
  const [aiStatus, setAiStatus] = useState<LocalAiStatus | null>(null);
  const [isLoadingModel, setIsLoadingModel] = useState(false);
  const [isBenchmarkingAi, setIsBenchmarkingAi] = useState(false);
  const [isSavingRuntimeConfig, setIsSavingRuntimeConfig] = useState(false);
  const [isTestingRuntimeConfig, setIsTestingRuntimeConfig] = useState(false);
  const [runtimeConfig, setRuntimeConfig] = useState<LocalAiRuntimeConfigView | null>(null);
  const [runtimeTestResult, setRuntimeTestResult] = useState<LocalAiRuntimeTestResult | null>(null);
  const [managedRuntime, setManagedRuntime] = useState<LocalAiManagedRuntimeStatus | null>(null);
  const [isStartingManagedRuntime, setIsStartingManagedRuntime] = useState(false);
  const [aiBenchmark, setAiBenchmark] = useState<LocalAiBenchmarkResult | null>(null);
  const [isImportingDatabase, setIsImportingDatabase] = useState(false);
  const [isExportingPages, setIsExportingPages] = useState(false);
  const [maxNewTokens, setMaxNewTokens] = useState(readLocalAiMaxNewTokens);
  const [editorPreferences, setEditorPreferences] = useState(readEditorPreferences);
  const [aiAdvancedOpen, setAiAdvancedOpen] = useState(false);
  const [aiDiagnosticsOpen, setAiDiagnosticsOpen] = useState(false);
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
      setAiStatus(null);
      toast.error('AI 상태 확인 실패: ' + String(error));
    }
  }, []);

  const loadRuntimeConfig = useCallback(async () => {
    try {
      setRuntimeConfig(await invoke<LocalAiRuntimeConfigView>('local_ai_get_runtime_config'));
      setRuntimeTestResult(null);
    } catch (error) {
      setRuntimeConfig(null);
      toast.error('AI 서버 설정 확인 실패: ' + String(error));
    }
  }, []);

  const loadManagedRuntime = useCallback(async () => {
    try {
      setManagedRuntime(
        await invoke<LocalAiManagedRuntimeStatus>('local_ai_managed_runtime_status')
      );
    } catch {
      setManagedRuntime(null);
    }
  }, []);

  useEffect(() => {
    if (!isOpen) return;
    setActiveSection('general');
    setTitle(appTitle);
    setMaxNewTokens(readLocalAiMaxNewTokens());
    setEditorPreferences(readEditorPreferences());
    setAiStatus(null);
    setRuntimeConfig(null);
    setAiAdvancedOpen(false);
    setAiDiagnosticsOpen(false);
    setAiBenchmark(null);
    setManagedRuntime(null);
    void Promise.all([loadDataPath(), loadAiStatus(), loadRuntimeConfig(), loadManagedRuntime()]);
  }, [appTitle, isOpen, loadAiStatus, loadDataPath, loadManagedRuntime, loadRuntimeConfig]);

  const saveTitle = async () => {
    const nextTitle = title.trim();
    if (!nextTitle) {
      toast.error('앱 이름을 입력하세요.');
      return;
    }

    setIsSavingTitle(true);
    try {
      await onAppTitleChange(nextTitle);
      setTitle(nextTitle);
      toast.success('앱 이름을 저장했습니다.');
    } catch (error) {
      toast.error('앱 이름 저장 실패: ' + String(error).slice(0, 180));
    } finally {
      setIsSavingTitle(false);
    }
  };

  const closeSettings = () => {
    setTitle(appTitle);
    onClose();
  };

  const loadLocalAi = async () => {
    if (isLoadingModel || isBenchmarkingAi) return;
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
    if (isBenchmarkingAi || isLoadingModel) return;
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
      serverEnabled: true,
      endpoint: 'http://127.0.0.1:9379/v1/chat/completions',
      model: 'gemma4-e2b',
      runtimeKind: 'litert_lm',
      envConfigured: false,
      envTakesPrecedence: false,
      ...current,
      ...patch,
    }));
    setRuntimeTestResult(null);
  };

  const changeRuntimePreset = (runtimeKind: LocalAiRuntimeKind) => {
    changeRuntimeConfig(configFromLocalAiRuntimePreset(runtimeKind));
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
          runtimeKind: runtimeKindFromLocalAiConfig(runtimeConfig),
        },
      });
      setRuntimeConfig(saved);
      await loadAiStatus();
      window.dispatchEvent(new CustomEvent(LOCAL_AI_SETTINGS_CHANGED_EVENT));
      toast.success('로컬 AI 런타임 설정을 적용했습니다.');
    } catch (error) {
      toast.error('AI 런타임 설정 저장 실패: ' + String(error).slice(0, 180));
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
          runtimeKind: runtimeKindFromLocalAiConfig(runtimeConfig),
        },
      });
      setRuntimeTestResult(result);
      toast.success(result.message);
      await loadAiStatus();
    } catch (error) {
      const message = String(error).slice(0, 180);
      setRuntimeTestResult({
        ok: false,
        message,
        generatedTokens: 0,
        tokensPerSecond: 0,
      });
      toast.error('AI 서버 생성 테스트 실패: ' + message);
    } finally {
      setIsTestingRuntimeConfig(false);
    }
  };

  const startManagedRuntime = async () => {
    if (isStartingManagedRuntime) return;
    setIsStartingManagedRuntime(true);
    try {
      const status = await invoke<LocalAiManagedRuntimeStatus>('local_ai_start_managed_runtime');
      setManagedRuntime(status);
      await loadAiStatus();
      if (status.endpointReachable) {
        toast.success('VDI 내장 Gemma 서버를 시작했습니다.');
      } else {
        toast.info('Gemma 서버를 시작하는 중입니다. 잠시 후 다시 확인해주세요.');
      }
    } catch (error) {
      toast.error('내장 Gemma 서버 시작 실패: ' + String(error).slice(0, 180));
      await loadManagedRuntime();
    } finally {
      setIsStartingManagedRuntime(false);
    }
  };

  const changeMaxNewTokens = (value: number) => {
    setMaxNewTokens(writeLocalAiMaxNewTokens(value));
  };

  const changeFontFamily = (fontFamily: EditorFontFamily) => {
    setEditorPreferences(writeEditorPreferences({ fontFamily }));
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
      toast.success(`DB 가져오기 완료: ${addedCount}개 추가, ${summary.skipped}개 중복 건너뜀`);
    } catch (error) {
      toast.error('DB 가져오기 실패: ' + String(error));
    } finally {
      setIsImportingDatabase(false);
      if (databaseInputRef.current) databaseInputRef.current.value = '';
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

  const cpuFeature = (name: string) => {
    if (!aiStatus) return '확인 중';
    return aiStatus.cpuFeatures?.[name] ? '감지됨' : '없음';
  };
  const buildFeature = (name: string) => {
    if (!aiStatus) return '확인 중';
    return aiStatus.compiledFeatures?.[name] ? '활성' : '비활성';
  };
  const canLoadModel = !aiStatus?.mtpConfigured
    && !!aiStatus?.modelExists
    && !!aiStatus?.tokenizerExists
    && !isLoadingModel
    && !isBenchmarkingAi;
  const canBenchmarkAi = !aiStatus?.mtpConfigured
    && !!aiStatus?.modelExists
    && !!aiStatus?.tokenizerExists
    && !isBenchmarkingAi
    && !isLoadingModel;
  const runtimeConfigLockedByEnv = runtimeConfig?.envTakesPrecedence === true;
  const selectedRuntimeKind = runtimeKindFromLocalAiConfig(runtimeConfig);
  const selectedRuntimePreset = findLocalAiRuntimePreset(selectedRuntimeKind);
  const selectedRuntimeIsPublic = LOCAL_AI_RUNTIME_PRESETS.some(
    (preset) => preset.id === selectedRuntimeKind
  );
  const serverConfigured = aiStatus?.mtpConfigured === true;
  const serverReachable = aiStatus?.mtpReachable === true;
  const serverChecking = serverConfigured && aiStatus?.mtpReachable == null;
  const isDesktopData = Boolean(dataPath && dataPath !== '브라우저 모드');

  const aiStateLabel = !aiStatus
    ? '상태 확인 중'
    : serverConfigured
      ? serverChecking
        ? '서버 확인 중'
        : serverReachable
          ? '서버 연결됨'
          : '서버 시작 필요'
      : localAiStateLabel(aiStatus.state);
  const aiStateTone = !aiStatus || serverChecking
    ? 'checking'
    : serverConfigured && serverReachable
      ? 'ready'
      : aiStatus.state === 'loaded'
        ? 'ready'
        : 'attention';

  return (
    <Dialog
      open={isOpen}
      onOpenChange={(open) => {
        if (!open) closeSettings();
      }}
    >
      <DialogContent className="memoji-settings-dialog" aria-describedby="memoji-settings-description">
        <DialogHeader className="memoji-settings-header">
          <DialogTitle className="memoji-settings-title">
            <Settings className="h-5 w-5" aria-hidden="true" />
            설정
          </DialogTitle>
          <DialogDescription id="memoji-settings-description" className="sr-only">
            Memoji 앱, 편집기, 로컬 AI, 데이터 저장 설정을 관리합니다.
          </DialogDescription>
        </DialogHeader>

        <div className="memoji-settings-layout">
          <nav className="memoji-settings-nav" aria-label="설정 분류">
            {SETTINGS_SECTIONS.map((section) => {
              const Icon = section.icon;
              const isActive = activeSection === section.id;
              return (
                <button
                  key={section.id}
                  type="button"
                  className="memoji-settings-nav-item"
                  data-active={isActive}
                  aria-current={isActive ? 'page' : undefined}
                  onClick={() => setActiveSection(section.id)}
                >
                  <Icon className="h-4 w-4" aria-hidden="true" />
                  <span>
                    <strong>{section.label}</strong>
                    <small>{section.description}</small>
                  </span>
                </button>
              );
            })}
          </nav>

          <main className="memoji-settings-main">
            {activeSection === 'general' && (
              <section className="memoji-settings-section" aria-labelledby="settings-general-title">
                <div className="memoji-settings-section-header">
                  <div>
                    <h3 id="settings-general-title">일반</h3>
                    <p>작업 공간에 표시할 이름을 정합니다.</p>
                  </div>
                </div>

                <div className="memoji-settings-card">
                  <div className="memoji-settings-field">
                    <Label htmlFor="app-title">앱 이름</Label>
                    <p className="memoji-settings-help">상단 제목 표시줄에 보이는 이름입니다.</p>
                    <div className="memoji-settings-inline-field">
                      <Input
                        id="app-title"
                        value={title}
                        onChange={(event) => setTitle(event.target.value)}
                        onKeyDown={(event) => {
                          if (event.key === 'Enter' && !event.nativeEvent.isComposing) {
                            void saveTitle();
                          }
                        }}
                      />
                      <Button
                        type="button"
                        onClick={() => void saveTitle()}
                        disabled={isSavingTitle || !title.trim() || title.trim() === appTitle}
                      >
                        {isSavingTitle ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : null}
                        저장
                      </Button>
                    </div>
                  </div>
                </div>

                <div className="memoji-settings-note">
                  <strong>로컬 우선</strong>
                  <p>메모와 설정은 이 기기 안에 저장되며, 공개 AI API로 전송되지 않습니다.</p>
                </div>
              </section>
            )}

            {activeSection === 'editor' && (
              <section className="memoji-settings-section" aria-labelledby="settings-editor-title">
                <div className="memoji-settings-section-header">
                  <div>
                    <h3 id="settings-editor-title">편집기</h3>
                    <p>긴 글을 읽고 쓰기 편한 글자체를 선택합니다.</p>
                  </div>
                  <span className="memoji-settings-autosave-badge">즉시 적용</span>
                </div>

                <div className="memoji-settings-card">
                  <div className="memoji-settings-field">
                    <Label htmlFor="editor-font-family">본문 글자체</Label>
                    <select
                      id="editor-font-family"
                      value={editorPreferences.fontFamily}
                      onChange={(event) => changeFontFamily(event.target.value as EditorFontFamily)}
                      className="memoji-settings-select"
                    >
                      {Object.entries(EDITOR_FONT_FAMILY_LABELS).map(([value, label]) => (
                        <option key={value} value={value}>{label}</option>
                      ))}
                    </select>
                    <p className="memoji-settings-help">
                      시스템 기본은 Windows와 macOS의 한국어 글꼴을 자동으로 사용합니다.
                    </p>
                  </div>
                </div>
              </section>
            )}

            {activeSection === 'local-ai' && (
              <section className="memoji-settings-section" aria-labelledby="settings-ai-title">
                <div className="memoji-settings-section-header">
                  <div>
                    <h3 id="settings-ai-title">로컬 AI</h3>
                    <p>VDI 내부에서 실행되는 Gemma의 연결 상태와 답변 속도를 관리합니다.</p>
                  </div>
                  <button
                    type="button"
                    className="memoji-settings-refresh"
                    onClick={() => void Promise.all([loadAiStatus(), loadManagedRuntime()])}
                  >
                    상태 새로고침
                  </button>
                </div>

                <div className="memoji-settings-card memoji-settings-status-card">
                  <div className="memoji-settings-status-heading">
                    <div>
                      <span className="memoji-settings-eyebrow">현재 상태</span>
                      <h4>{localAiModelLabel(aiStatus)}</h4>
                    </div>
                    <span className="memoji-settings-status-badge" data-tone={aiStateTone}>
                      {aiStateLabel}
                    </span>
                  </div>
                  <p className="memoji-settings-status-copy">{localAiStateHelp(aiStatus)}</p>
                  {managedRuntime?.bundled && (
                    <div className="memoji-settings-note" role="status">
                      <strong>VDI 오프라인 AI 번들 감지됨</strong>
                      <p>
                        Gemma 4 E2B 모델과 LiteRT-LM 실행 환경이 앱 폴더에 포함되어 있습니다.
                        인터넷 연결이나 별도 모델 설치 없이 자동으로 시작합니다.
                      </p>
                    </div>
                  )}
                  {serverConfigured && !serverReachable && !serverChecking && (
                    <div className="memoji-settings-warning" role="status">
                      <strong>{findLocalAiRuntimePreset(aiStatus?.mtpRuntimeKind).modeLabel} 서버가 응답하지 않습니다.</strong>
                      <p>
                        <code>{aiStatus?.mtpEndpoint ?? runtimeConfig?.endpoint}</code>에서 실행 중인 서버와 모델을 확인하세요.
                        {managedRuntime?.available
                          ? ' 앱에 포함된 서버를 다시 시작할 수 있습니다.'
                          : ' VDI 배포 폴더에 ai 런타임과 Gemma 모델이 함께 있는지 확인하세요.'}
                      </p>
                      {managedRuntime?.available && (
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={() => void startManagedRuntime()}
                          disabled={isStartingManagedRuntime}
                        >
                          {isStartingManagedRuntime ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : null}
                          내장 Gemma 서버 시작
                        </Button>
                      )}
                    </div>
                  )}
                  {!serverConfigured && (
                    <Button type="button" onClick={() => void loadLocalAi()} disabled={!canLoadModel} size="sm">
                      {isLoadingModel ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : null}
                      내장 모델 로드
                    </Button>
                  )}
                </div>

                <div className="memoji-settings-card">
                  <div className="memoji-settings-card-heading">
                    <div>
                      <span className="memoji-settings-eyebrow">권장 런타임</span>
                      <h4>{selectedRuntimePreset.label}</h4>
                      <p>{selectedRuntimePreset.description}</p>
                    </div>
                    <span className="memoji-settings-recommended">VDI 권장</span>
                  </div>

                  <div className="memoji-settings-field">
                    <Label htmlFor="local-ai-runtime-kind">추론 엔진</Label>
                    <select
                      id="local-ai-runtime-kind"
                      value={selectedRuntimeKind}
                      disabled={runtimeConfigLockedByEnv || !runtimeConfig}
                      onChange={(event) => changeRuntimePreset(event.target.value as LocalAiRuntimeKind)}
                      className="memoji-settings-select"
                    >
                      {!selectedRuntimeIsPublic && (
                        <option value={selectedRuntimeKind}>
                          {selectedRuntimePreset.label} · 기존 구성
                        </option>
                      )}
                      {LOCAL_AI_RUNTIME_PRESETS.map((preset) => (
                        <option key={preset.id} value={preset.id}>{preset.label}</option>
                      ))}
                    </select>
                  </div>

                  {runtimeConfigLockedByEnv && (
                    <p className="memoji-settings-admin-note">
                      관리자 환경 변수가 우선 적용 중이라 앱에서 변경할 수 없습니다.
                    </p>
                  )}

                  <div className="memoji-settings-actions">
                    <Button
                      variant="outline"
                      size="sm"
                      type="button"
                      onClick={() => void testRuntimeConfig()}
                      disabled={runtimeConfigLockedByEnv || !runtimeConfig || isTestingRuntimeConfig}
                    >
                      {isTestingRuntimeConfig ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : null}
                      실제 생성 테스트
                    </Button>
                    <Button
                      size="sm"
                      type="button"
                      onClick={() => void saveRuntimeConfig()}
                      disabled={runtimeConfigLockedByEnv || !runtimeConfig || isSavingRuntimeConfig}
                    >
                      {isSavingRuntimeConfig ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : null}
                      런타임 적용
                    </Button>
                  </div>
                  {runtimeTestResult && (
                    <p
                      className="memoji-settings-test-result"
                      data-ok={runtimeTestResult.ok}
                      aria-live="polite"
                    >
                      {runtimeTestResult.message}
                    </p>
                  )}
                </div>

                <div className="memoji-settings-card">
                  <div className="memoji-settings-card-heading memoji-settings-card-heading-row">
                    <div>
                      <span className="memoji-settings-eyebrow">답변 길이</span>
                      <h4>최대 {maxNewTokens} 토큰</h4>
                      <p>짧게 설정할수록 VDI에서 전체 답변이 더 빨리 끝납니다.</p>
                    </div>
                  </div>
                  <div className="memoji-settings-token-presets" aria-label="답변 길이 프리셋">
                    {TOKEN_PRESETS.map((preset) => (
                      <button
                        key={preset.value}
                        type="button"
                        data-active={maxNewTokens === preset.value}
                        onClick={() => changeMaxNewTokens(preset.value)}
                      >
                        <strong>{preset.label}</strong>
                        <small>{preset.value}</small>
                      </button>
                    ))}
                  </div>
                  <Label htmlFor="local-ai-max-tokens" className="sr-only">최대 답변 토큰</Label>
                  <input
                    id="local-ai-max-tokens"
                    type="range"
                    min={LOCAL_AI_MAX_NEW_TOKENS_MIN}
                    max={LOCAL_AI_MAX_NEW_TOKENS_MAX}
                    step={LOCAL_AI_MAX_NEW_TOKENS_STEP}
                    value={maxNewTokens}
                    onChange={(event) => changeMaxNewTokens(Number(event.target.value))}
                    className="memoji-settings-range"
                    aria-valuetext={`${maxNewTokens} 토큰`}
                  />
                  <div className="memoji-settings-range-labels" aria-hidden="true">
                    <span>{LOCAL_AI_MAX_NEW_TOKENS_MIN}</span>
                    <span>{LOCAL_AI_MAX_NEW_TOKENS_MAX}</span>
                  </div>
                </div>

                <div className="memoji-settings-collapsible">
                  <button
                    type="button"
                    className="memoji-settings-collapsible-trigger"
                    onClick={() => setAiAdvancedOpen((open) => !open)}
                    aria-expanded={aiAdvancedOpen}
                  >
                    <span>
                      <strong>고급 서버 설정</strong>
                      <small>Endpoint와 모델 별칭</small>
                    </span>
                    <ChevronDown className="h-4 w-4" aria-hidden="true" />
                  </button>
                  {aiAdvancedOpen && (
                    <div className="memoji-settings-collapsible-panel">
                      <div className="memoji-settings-field">
                        <Label htmlFor="local-ai-server-endpoint">Endpoint</Label>
                        <Input
                          id="local-ai-server-endpoint"
                          value={runtimeConfig?.endpoint ?? ''}
                          disabled={runtimeConfigLockedByEnv || !runtimeConfig}
                          onChange={(event) => changeRuntimeConfig({ endpoint: event.target.value })}
                          placeholder="http://127.0.0.1:9379/v1/chat/completions"
                          className="font-mono text-xs"
                        />
                        <p className="memoji-settings-help">
                          보안상 localhost, 127.0.0.1, ::1만 허용합니다. 공식 LiteRT-LM 기본 포트는 9379입니다.
                        </p>
                      </div>
                      <div className="memoji-settings-field-grid">
                        <div className="memoji-settings-field">
                          <Label htmlFor="local-ai-server-model">모델 별칭</Label>
                          <Input
                            id="local-ai-server-model"
                            value={runtimeConfig?.model ?? ''}
                            disabled={runtimeConfigLockedByEnv || !runtimeConfig}
                            onChange={(event) => changeRuntimeConfig({ model: event.target.value })}
                            placeholder="gemma4-e2b"
                          />
                        </div>
                        <div className="memoji-settings-field">
                          <Label htmlFor="local-ai-server-draft">Draft / MTP 메모</Label>
                          <Input
                            id="local-ai-server-draft"
                            value={runtimeConfig?.draftModel ?? ''}
                            disabled={runtimeConfigLockedByEnv || !runtimeConfig}
                            onChange={(event) => changeRuntimeConfig({ draftModel: event.target.value })}
                            placeholder="서버 시작 옵션에서 설정"
                          />
                        </div>
                      </div>
                    </div>
                  )}
                </div>

                <div className="memoji-settings-collapsible">
                  <button
                    type="button"
                    className="memoji-settings-collapsible-trigger"
                    onClick={() => setAiDiagnosticsOpen((open) => !open)}
                    aria-expanded={aiDiagnosticsOpen}
                  >
                    <span>
                      <strong>진단 정보</strong>
                      <small>CPU 기능과 VDI 벤치마크</small>
                    </span>
                    <ChevronDown className="h-4 w-4" aria-hidden="true" />
                  </button>
                  {aiDiagnosticsOpen && (
                    <div className="memoji-settings-collapsible-panel memoji-settings-diagnostics">
                      <div>
                        <h4><Cpu className="h-4 w-4" aria-hidden="true" /> CPU / AVX-512</h4>
                        <dl className="memoji-settings-diagnostic-grid">
                          <div><dt>Runtime</dt><dd>{localAiRuntimeLabel(aiStatus)}</dd></div>
                          <div><dt>Model file</dt><dd>{formatLocalAiBytes(aiStatus?.modelFileSizeBytes)}</dd></div>
                          <div><dt>Runtime AVX-512F</dt><dd>{cpuFeature('avx512f')}</dd></div>
                          <div><dt>Build AVX-512F</dt><dd>{buildFeature('avx512f')}</dd></div>
                          <div><dt>Runtime AVX-512BW</dt><dd>{cpuFeature('avx512bw')}</dd></div>
                          <div><dt>Build AVX-512BW</dt><dd>{buildFeature('avx512bw')}</dd></div>
                          <div><dt>Runtime AVX-512VL</dt><dd>{cpuFeature('avx512vl')}</dd></div>
                          <div><dt>Build AVX-512VL</dt><dd>{buildFeature('avx512vl')}</dd></div>
                        </dl>
                      </div>

                      <div className="memoji-settings-benchmark">
                        <div className="memoji-settings-card-heading">
                          <div>
                            <h4><Gauge className="h-4 w-4" aria-hidden="true" /> VDI 성능 진단</h4>
                            <p>내장 GGUF 모델의 16토큰 생성 속도를 측정합니다.</p>
                          </div>
                          <Button
                            variant="outline"
                            size="sm"
                            type="button"
                            onClick={() => void runLocalAiBenchmark()}
                            disabled={!canBenchmarkAi}
                          >
                            {isBenchmarkingAi ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : null}
                            진단 실행
                          </Button>
                        </div>
                        {serverConfigured ? (
                          <p className="memoji-settings-help">
                            서버 런타임을 쓰는 동안에는 내장 모델 벤치마크가 비활성화됩니다.
                          </p>
                        ) : (
                          <dl className="memoji-settings-metric-grid">
                            <div><dt>Load</dt><dd>{aiBenchmark?.cachedModel ? 'cached' : aiBenchmark?.loadMs != null ? `${aiBenchmark.loadMs} ms` : '—'}</dd></div>
                            <div><dt>Generate</dt><dd>{aiBenchmark ? `${aiBenchmark.generateMs} ms` : '—'}</dd></div>
                            <div><dt>Speed</dt><dd>{formatLocalAiSpeed(aiBenchmark?.tokensPerSecond)}</dd></div>
                            <div><dt>판정</dt><dd>{aiBenchmark?.speedLabel ?? '—'}</dd></div>
                          </dl>
                        )}
                        {aiBenchmark?.recommendation && <p className="memoji-settings-help">{aiBenchmark.recommendation}</p>}
                      </div>
                    </div>
                  )}
                </div>
              </section>
            )}

            {activeSection === 'data' && (
              <section className="memoji-settings-section" aria-labelledby="settings-data-title">
                <div className="memoji-settings-section-header">
                  <div>
                    <h3 id="settings-data-title">데이터</h3>
                    <p>현재 저장 위치를 확인하고 Markdown 백업을 만듭니다.</p>
                  </div>
                </div>

                <div className="memoji-settings-card">
                  <div className="memoji-settings-card-heading">
                    <div>
                      <span className="memoji-settings-eyebrow">현재 데이터베이스</span>
                      <h4>저장 위치</h4>
                    </div>
                  </div>
                  <Label htmlFor="memoji-data-path" className="sr-only">데이터 저장 위치</Label>
                  <div className="memoji-settings-inline-field">
                    <Input id="memoji-data-path" value={dataPath || '확인 중'} readOnly className="font-mono text-xs" />
                    <Button
                      variant="outline"
                      size="sm"
                      type="button"
                      onClick={() => void openDataFolder()}
                      disabled={!isDesktopData}
                    >
                      <FolderOpen className="mr-1 h-4 w-4" aria-hidden="true" />
                      폴더 열기
                    </Button>
                  </div>
                  <p className="memoji-settings-help">
                    비영구 VDI에서는 관리자가 지정한 영구 드라이브 경로인지 반드시 확인하세요.
                  </p>
                </div>

                <div className="memoji-settings-card">
                  <div className="memoji-settings-card-heading">
                    <div>
                      <span className="memoji-settings-eyebrow">백업과 이전</span>
                      <h4>가져오기 · 내보내기</h4>
                      <p>가져오기는 현재 DB를 먼저 백업한 뒤 병합합니다.</p>
                    </div>
                  </div>
                  <input
                    ref={databaseInputRef}
                    type="file"
                    accept=".db,application/x-sqlite3,application/vnd.sqlite3,application/octet-stream"
                    className="memoji-settings-file-input"
                    onChange={(event) => void importDatabase(event.target.files?.[0])}
                  />
                  <div className="memoji-settings-data-actions">
                    <Button
                      variant="outline"
                      type="button"
                      onClick={() => databaseInputRef.current?.click()}
                      disabled={!isDesktopData || isImportingDatabase || isExportingPages}
                    >
                      {isImportingDatabase
                        ? <Loader2 className="mr-1 h-4 w-4 animate-spin" />
                        : <Upload className="mr-1 h-4 w-4" aria-hidden="true" />}
                      기존 DB 가져오기
                    </Button>
                    <Button
                      type="button"
                      onClick={() => void exportAllPages()}
                      disabled={!isDesktopData || isExportingPages || isImportingDatabase}
                    >
                      {isExportingPages
                        ? <Loader2 className="mr-1 h-4 w-4 animate-spin" />
                        : <Download className="mr-1 h-4 w-4" aria-hidden="true" />}
                      전체 페이지 ZIP 내보내기
                    </Button>
                  </div>
                </div>
              </section>
            )}
          </main>
        </div>

        <footer className="memoji-settings-footer">
          <p>각 항목은 즉시 적용되거나 해당 섹션의 적용 버튼으로 저장됩니다.</p>
          <Button variant="outline" type="button" onClick={closeSettings}>닫기</Button>
        </footer>
      </DialogContent>
    </Dialog>
  );
};
