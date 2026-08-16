import React, { useCallback, useEffect, useState } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { open } from '@tauri-apps/plugin-dialog';
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
  LifeBuoy,
  PenLine,
  Settings,
  Upload,
} from 'lucide-react';
import { toast } from 'sonner';
import {
  configFromLocalAiRuntimePreset,
  findLocalAiModelPreset,
  findLocalAiRuntimePreset,
  formatLocalAiBytes,
  formatLocalAiSpeed,
  LOCAL_AI_MAX_NEW_TOKENS_DEFAULT,
  LOCAL_AI_MAX_NEW_TOKENS_MAX,
  LOCAL_AI_MAX_NEW_TOKENS_MIN,
  LOCAL_AI_MAX_NEW_TOKENS_STEP,
  LOCAL_AI_MODEL_PRESETS,
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
import { TAURI_COMMANDS } from '../shared/api/tauriCommands';
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

interface DataPathStatus {
  databasePath: string;
  source: 'policy_env' | 'portable' | 'os_local' | 'os_local_fallback';
  writable: boolean;
  persistenceWarning?: string | null;
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
  { label: '최대로', value: LOCAL_AI_MAX_NEW_TOKENS_MAX },
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
  const [dataPathStatus, setDataPathStatus] = useState<DataPathStatus | null>(null);
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
  const [isExportingDiagnostics, setIsExportingDiagnostics] = useState(false);
  const [maxNewTokens, setMaxNewTokens] = useState(readLocalAiMaxNewTokens);
  const [editorPreferences, setEditorPreferences] = useState(readEditorPreferences);
  const [aiAdvancedOpen, setAiAdvancedOpen] = useState(false);
  const [aiDiagnosticsOpen, setAiDiagnosticsOpen] = useState(false);

  useEffect(() => {
    setTitle(appTitle);
  }, [appTitle]);

  const loadDataPath = useCallback(async () => {
    try {
      const status = await invoke<DataPathStatus>(TAURI_COMMANDS.getDataPathStatus);
      setDataPathStatus(status);
      setDataPath(status.databasePath);
    } catch {
      setDataPathStatus(null);
      setDataPath('브라우저 모드');
    }
  }, []);

  const loadAiStatus = useCallback(async () => {
    try {
      setAiStatus(await invoke<LocalAiStatus>(TAURI_COMMANDS.localAiStatus));
    } catch (error) {
      setAiStatus(null);
      toast.error('AI 상태 확인 실패: ' + String(error));
    }
  }, []);

  const loadRuntimeConfig = useCallback(async () => {
    try {
      setRuntimeConfig(await invoke<LocalAiRuntimeConfigView>(TAURI_COMMANDS.localAiGetRuntimeConfig));
      setRuntimeTestResult(null);
    } catch (error) {
      setRuntimeConfig(null);
      toast.error('AI 서버 설정 확인 실패: ' + String(error));
    }
  }, []);

  const loadManagedRuntime = useCallback(async () => {
    try {
      setManagedRuntime(
        await invoke<LocalAiManagedRuntimeStatus>(TAURI_COMMANDS.localAiManagedRuntimeStatus)
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
      const status = await invoke<LocalAiStatus>(TAURI_COMMANDS.localAiLoad);
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
      const result = await invoke<LocalAiBenchmarkResult>(TAURI_COMMANDS.localAiBenchmark);
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
      const saved = await invoke<LocalAiRuntimeConfigView>(TAURI_COMMANDS.localAiSaveRuntimeConfig, {
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
      const result = await invoke<LocalAiRuntimeTestResult>(TAURI_COMMANDS.localAiTestRuntimeConfig, {
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
      const status = await invoke<LocalAiManagedRuntimeStatus>(TAURI_COMMANDS.localAiStartManagedRuntime);
      setManagedRuntime(status);
      await loadAiStatus();
      if (status.endpointReachable) {
        toast.success('VDI 내장 Gemma 엔진을 시작했습니다.');
      } else {
        toast.info('Gemma 엔진을 시작하는 중입니다. 잠시 후 다시 확인해주세요.');
      }
    } catch (error) {
      toast.error('내장 Gemma 엔진 시작 실패: ' + String(error).slice(0, 180));
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
      await invoke(TAURI_COMMANDS.openDataFolder);
    } catch (error) {
      toast.error('폴더 열기 실패: ' + String(error));
    }
  };

  const importDatabase = async () => {
    let selectedPath: string | string[] | null;
    try {
      selectedPath = await open({
        title: 'Memoji DB 가져오기',
        multiple: false,
        directory: false,
        filters: [{ name: 'SQLite database', extensions: ['db'] }],
      });
    } catch (error) {
      toast.error('DB 파일 선택 실패: ' + String(error));
      return;
    }
    if (!selectedPath) return;
    if (Array.isArray(selectedPath)) {
      toast.error('DB 파일은 하나만 선택해주세요.');
      return;
    }

    setIsImportingDatabase(true);
    try {
      const summary = await tauriStorage.importDatabasePath(selectedPath);
      await onDataImported?.();
      const addedCount = summary.imported + summary.duplicated;
      toast.success(`DB 가져오기 완료: ${addedCount}개 추가, 이력 ${summary.revisions_imported}개 보존, ${summary.skipped}개 중복 건너뜀`, {
        description: `원본 스키마 v${summary.source_schema_version ?? 'legacy'} · 자동 백업: ${summary.backup_path} · ${summary.backup_bytes.toLocaleString('ko-KR')} bytes · SHA-256 ${summary.backup_sha256.slice(0, 12)}…`,
      });
    } catch (error) {
      toast.error('DB 가져오기 실패: ' + String(error));
    } finally {
      setIsImportingDatabase(false);
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

  const exportDiagnostics = async () => {
    setIsExportingDiagnostics(true);
    try {
      const result = await invoke<{ zipPath: string; sha256: string; bytes: number }>(TAURI_COMMANDS.exportDiagnosticZip);
      toast.success('VDI 진단 ZIP을 만들었습니다.', {
        description: `${result.zipPath} · ${result.bytes.toLocaleString('ko-KR')} bytes · SHA-256 ${result.sha256.slice(0, 12)}…`,
      });
    } catch (error) {
      toast.error('VDI 진단 ZIP 생성 실패: ' + String(error));
    } finally {
      setIsExportingDiagnostics(false);
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
  const canLoadModel = !aiStatus?.runtimeCapabilities?.openAiCompatible
    && !aiStatus?.mtpConfigured
    && !!aiStatus?.modelExists
    && !!aiStatus?.tokenizerExists
    && !isLoadingModel
    && !isBenchmarkingAi;
  const canBenchmarkAi = !aiStatus?.runtimeCapabilities?.openAiCompatible
    && !aiStatus?.mtpConfigured
    && !!aiStatus?.modelExists
    && !!aiStatus?.tokenizerExists
    && !isBenchmarkingAi
    && !isLoadingModel;
  const runtimeConfigLockedByEnv = runtimeConfig?.envTakesPrecedence === true;
  const selectedRuntimeKind = runtimeKindFromLocalAiConfig(runtimeConfig);
  const selectedRuntimePreset = findLocalAiRuntimePreset(selectedRuntimeKind);
  const selectedModelPreset = findLocalAiModelPreset(runtimeConfig?.model);
  const selectedRuntimeIsPublic = LOCAL_AI_RUNTIME_PRESETS.some(
    (preset) => preset.id === selectedRuntimeKind
  );
  const serverConfigured = aiStatus?.runtimeCapabilities?.openAiCompatible === true
    || aiStatus?.mtpConfigured === true;
  const nativeRuntime = aiStatus?.runtimeCapabilities?.inProcess === true
    || managedRuntime?.transport === 'in_process';
  const serverReachable = aiStatus?.mtpReachable === true;
  const serverChecking = serverConfigured && aiStatus?.mtpReachable == null;
  const isDesktopData = Boolean(dataPath && dataPath !== '브라우저 모드');

  const aiStateLabel = !aiStatus
    ? '상태 확인 중'
    : serverConfigured
      ? serverChecking
        ? nativeRuntime ? '엔진 확인 중' : '서버 확인 중'
        : serverReachable
          ? nativeRuntime ? '엔진 준비됨' : '서버 연결됨'
          : nativeRuntime ? '엔진 시작 필요' : '서버 시작 필요'
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
                        {selectedModelPreset.label} 모델과 LiteRT-LM 실행 환경이 앱 폴더에 포함되어 있습니다.
                        인터넷 연결이나 별도 모델 설치 없이 자동으로 시작합니다.
                        {managedRuntime.transport === 'in_process'
                          ? ' 외부 포트를 열지 않고 앱 프로세스 안에서 직접 추론합니다.'
                          : managedRuntime.authEnforced
                            ? ' 이 세션은 인증 토큰으로 보호됩니다.'
                          : managedRuntime.sessionIsolated
                            ? ' 인증 미지원 런타임이라 임의의 loopback 포트와 자식 PID 확인으로 격리합니다.'
                            : ''}
                      </p>
                    </div>
                  )}
                  {serverConfigured && !serverReachable && !serverChecking && (
                    <div className="memoji-settings-warning" role="status">
                      <strong>{findLocalAiRuntimePreset(aiStatus?.mtpRuntimeKind).modeLabel}가 준비되지 않았습니다.</strong>
                      <p>
                        {nativeRuntime
                          ? 'LiteRT-LM C API와 선택한 Gemma 모델 파일을 확인하세요.'
                          : <><code>{aiStatus?.mtpEndpoint ?? runtimeConfig?.endpoint}</code>에서 실행 중인 서버와 모델을 확인하세요.</>}
                        {managedRuntime?.available
                          ? ' 앱에 포함된 엔진을 다시 시작할 수 있습니다.'
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
                          내장 Gemma 엔진 시작
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

                  <div className="memoji-settings-field">
                    <Label htmlFor="local-ai-model-preset">Gemma 4 모델</Label>
                    <select
                      id="local-ai-model-preset"
                      value={runtimeConfig?.model ?? 'gemma4-e2b'}
                      disabled={runtimeConfigLockedByEnv || !runtimeConfig}
                      onChange={(event) => changeRuntimeConfig({ model: event.target.value })}
                      className="memoji-settings-select"
                    >
                      {LOCAL_AI_MODEL_PRESETS.map((preset) => (
                        <option key={preset.id} value={preset.id}>
                          {preset.label} · RAM {preset.minimumRamGb}GB+
                        </option>
                      ))}
                    </select>
                    <p className="memoji-settings-help">
                      {selectedModelPreset.qualityLabel} · {selectedModelPreset.description}
                    </p>
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
                      <strong>엔진 상세</strong>
                      <small>{nativeRuntime ? 'C API와 인프로세스 상태' : 'Endpoint와 모델 별칭'}</small>
                    </span>
                    <ChevronDown className="h-4 w-4" aria-hidden="true" />
                  </button>
                  {aiAdvancedOpen && (
                    <div className="memoji-settings-collapsible-panel">
                      {nativeRuntime ? (
                        <dl className="memoji-settings-diagnostic-grid">
                          <div><dt>Transport</dt><dd>{managedRuntime?.transport ?? 'in_process'}</dd></div>
                          <div><dt>LiteRT-LM</dt><dd>{managedRuntime?.runtimeVersion ?? '0.16.0'}</dd></div>
                          <div><dt>C API</dt><dd>{managedRuntime?.cApiVersion ?? '0.1.0'}</dd></div>
                          <div><dt>Backend</dt><dd>{managedRuntime?.backend ?? 'CPU'}</dd></div>
                          <div><dt>Threads</dt><dd>{managedRuntime?.threads ?? '자동'}</dd></div>
                          <div><dt>Restart</dt><dd>{managedRuntime?.restartAttempts ?? 0}/{managedRuntime?.restartLimit ?? 3}</dd></div>
                        </dl>
                      ) : <>
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
                          <Label htmlFor="local-ai-server-draft">보조 모델 별칭</Label>
                          <Input
                            id="local-ai-server-draft"
                            value={runtimeConfig?.draftModel ?? ''}
                            disabled={runtimeConfigLockedByEnv || !runtimeConfig}
                            onChange={(event) => changeRuntimeConfig({ draftModel: event.target.value })}
                            placeholder="검증된 경우에만 MTP 활성"
                          />
                        </div>
                      </div>
                      </>}
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
                          <div><dt>Runtime version</dt><dd>{aiStatus?.runtimeMetrics?.runtimeVersion ?? '—'}</dd></div>
                          <div><dt>TTFT</dt><dd>{aiStatus?.runtimeMetrics?.ttftMs != null ? `${aiStatus.runtimeMetrics.ttftMs} ms` : '—'}</dd></div>
                          <div><dt>Decode</dt><dd>{aiStatus?.runtimeMetrics?.decodeMs != null ? `${aiStatus.runtimeMetrics.decodeMs} ms` : '—'}</dd></div>
                          <div><dt>MTP</dt><dd>{aiStatus?.runtimeCapabilities?.mtpVerified ? '검증됨' : '비활성'}</dd></div>
                          <div><dt>Runtime isolation</dt><dd>{nativeRuntime ? '인프로세스 · 포트 없음' : aiStatus?.runtimeCapabilities?.authEnforced ? '인증 강제' : '인증 미강제'}</dd></div>
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
                            <p>{nativeRuntime ? '실제 생성 테스트에서 TTFT와 decode 지표를 기록합니다.' : '내장 GGUF 모델의 16토큰 생성 속도를 측정합니다.'}</p>
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
                            {nativeRuntime
                              ? '위의 실제 생성 테스트를 실행하면 인프로세스 엔진 성능 지표가 갱신됩니다.'
                              : '서버 런타임을 쓰는 동안에는 내장 모델 벤치마크가 비활성화됩니다.'}
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
                    {dataPathStatus?.source === 'policy_env'
                      ? '관리자 정책(MEMOJI_DATA_PATH)으로 지정된 저장소입니다.'
                      : dataPathStatus?.source === 'portable'
                        ? '실행 파일 옆 portable data 저장소입니다.'
                        : dataPathStatus?.source === 'os_local'
                          ? 'macOS 사용자 데이터 폴더에 안전하게 저장됩니다.'
                          : '비영구 VDI에서는 관리자가 지정한 영구 드라이브 경로인지 반드시 확인하세요.'}
                  </p>
                  {dataPathStatus && !dataPathStatus.writable && (
                    <p className="memoji-settings-help text-destructive" role="alert">
                      현재 저장 위치에 쓸 수 없습니다. 관리자에게 저장 권한을 요청하세요.
                    </p>
                  )}
                  {dataPathStatus?.persistenceWarning && (
                    <p className="memoji-settings-help text-destructive" role="alert">
                      {dataPathStatus.persistenceWarning}
                    </p>
                  )}
                </div>

                <div className="memoji-settings-card">
                  <div className="memoji-settings-card-heading">
                    <div>
                      <span className="memoji-settings-eyebrow">백업과 이전</span>
                      <h4>가져오기 · 내보내기</h4>
                      <p>가져오기는 현재 DB를 먼저 백업한 뒤 병합합니다.</p>
                    </div>
                  </div>
                  <div className="memoji-settings-data-actions">
                    <Button
                      variant="outline"
                      type="button"
                      onClick={() => void importDatabase()}
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

                <div className="memoji-settings-card">
                  <div className="memoji-settings-card-heading memoji-settings-card-heading-row">
                    <div>
                      <span className="memoji-settings-eyebrow">지원과 진단</span>
                      <h4>VDI 진단 ZIP</h4>
                      <p>문서 본문·AI 프롬프트·자격 증명·절대 경로를 제외하고 엔진, DB 무결성, 행 수만 저장합니다.</p>
                    </div>
                    <Button
                      variant="outline"
                      type="button"
                      onClick={() => void exportDiagnostics()}
                      disabled={!isDesktopData || isExportingDiagnostics}
                    >
                      {isExportingDiagnostics
                        ? <Loader2 className="mr-1 h-4 w-4 animate-spin" />
                        : <LifeBuoy className="mr-1 h-4 w-4" aria-hidden="true" />}
                      진단 ZIP 만들기
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
