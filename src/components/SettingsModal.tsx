import React, { useCallback, useEffect, useState } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { ChevronDown, Cpu, Database, FolderOpen, Loader2, Settings } from 'lucide-react';
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
}

export const SettingsModal: React.FC<SettingsModalProps> = ({
  isOpen,
  onClose,
  appTitle,
  onAppTitleChange,
}) => {
  const [title, setTitle] = useState(appTitle);
  const [dataPath, setDataPath] = useState('');
  const [aiStatus, setAiStatus] = useState<LocalAiStatus | null>(null);
  const [isLoadingModel, setIsLoadingModel] = useState(false);
  const [maxNewTokens, setMaxNewTokens] = useState(readLocalAiMaxNewTokens);
  const [editorPreferences, setEditorPreferences] = useState(readEditorPreferences);
  const [builtInPlugins, setBuiltInPlugins] = useState<BuiltInPluginState[]>([]);
  const [builtInPluginsOpen, setBuiltInPluginsOpen] = useState(false);

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

  useEffect(() => {
    if (!isOpen) return;
    setMaxNewTokens(readLocalAiMaxNewTokens());
    setEditorPreferences(readEditorPreferences());
    setBuiltInPlugins(getBuiltInPlugins());
    setBuiltInPluginsOpen(false);
    loadDataPath();
    loadAiStatus();
  }, [isOpen, loadAiStatus, loadDataPath]);

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

  const cpuFeature = (name: string) => aiStatus?.cpuFeatures?.[name] ? '감지됨' : '없음';
  const buildFeature = (name: string) => aiStatus?.compiledFeatures?.[name] ? '활성' : '비활성';
  const canLoadModel = !aiStatus?.mtpConfigured && !!aiStatus?.modelExists && !!aiStatus?.tokenizerExists && !isLoadingModel;

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
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-base font-semibold">답변 토큰</h3>
                  <p className="mt-1 text-xs text-muted-foreground">낮으면 빠르고, 높으면 길게 답합니다.</p>
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
                <span>Runtime AVX-512F: {cpuFeature('avx512f')}</span>
                <span>Build AVX-512F: {buildFeature('avx512f')}</span>
                <span>Runtime AVX-512BW: {cpuFeature('avx512bw')}</span>
                <span>Build AVX-512BW: {buildFeature('avx512bw')}</span>
                <span>Runtime AVX-512VL: {cpuFeature('avx512vl')}</span>
                <span>Build AVX-512VL: {buildFeature('avx512vl')}</span>
              </div>
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
