import React, { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from './ui/dialog';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Label } from './ui/label';
import { Separator } from './ui/separator';
import { toast } from 'sonner';
import { Settings, X } from 'lucide-react';
import { LLMProvider, DEFAULT_PROVIDERS } from '../types/llm';

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
  onAppTitleChange
}) => {
  const [title, setTitle] = useState(appTitle);
  const [providers, setProviders] = useState<LLMProvider[]>([]);
  const [editingProvider, setEditingProvider] = useState<string | null>(null);
  const [editApiKey, setEditApiKey] = useState('');
  const [editBaseUrl, setEditBaseUrl] = useState('');
  const [dataPath, setDataPath] = useState<string>('');

  useEffect(() => {
    setTitle(appTitle);
  }, [appTitle]);

  useEffect(() => {
    // Load providers from localStorage and sync with DEFAULT_PROVIDERS
    const savedProviders = localStorage.getItem('llm-providers');

    if (savedProviders) {
      try {
        const parsed: LLMProvider[] = JSON.parse(savedProviders);

        // DEFAULT_PROVIDERS에 있는 Provider만 유지하고, 저장된 설정(API 키 등)을 병합
        const syncedProviders = DEFAULT_PROVIDERS.map(defaultProvider => {
          const savedProvider = parsed.find(p => p.id === defaultProvider.id);
          if (savedProvider) {
            // 저장된 Provider가 있으면 API 키와 enabled 상태를 유지
            return {
              ...defaultProvider,
              apiKey: savedProvider.apiKey,
              baseUrl: savedProvider.baseUrl || defaultProvider.baseUrl,
              enabled: savedProvider.enabled
            };
          }
          // 저장된 Provider가 없으면 기본값 사용
          return defaultProvider;
        });

        setProviders(syncedProviders);
        // 동기화된 목록을 다시 저장 (제거된 Provider 정리)
        localStorage.setItem('llm-providers', JSON.stringify(syncedProviders));
      } catch (e) {
        console.error('Failed to parse saved providers:', e);
        setProviders(DEFAULT_PROVIDERS);
      }
    } else {
      setProviders(DEFAULT_PROVIDERS);
    }

    // Load data path
    loadDataPath();
  }, [isOpen]);

  const loadDataPath = async () => {
    try {
      // @ts-ignore - Tauri API
      const { invoke } = await import('@tauri-apps/api/core');
      const path = await invoke<string>('get_data_path');
      setDataPath(path);
    } catch (error) {
      console.error('Failed to get data path:', error);
      setDataPath('브라우저 모드 (localStorage)');
    }
  };

  const handleOpenDataFolder = async () => {
    try {
      // @ts-ignore - Tauri API
      const { invoke } = await import('@tauri-apps/api/core');

      // 커스텀 명령어로 폴더 열기
      await invoke('open_data_folder');
    } catch (error) {
      toast.error('폴더 열기 실패: ' + error);
    }
  };

  const handleSave = () => {
    if (title.trim()) {
      onAppTitleChange(title.trim());
      toast.success('설정이 저장되었습니다!');
      onClose();
    } else {
      toast.error('제목을 입력해주세요.');
    }
  };

  const saveProviders = (updatedProviders: LLMProvider[]) => {
    setProviders(updatedProviders);
    localStorage.setItem('llm-providers', JSON.stringify(updatedProviders));
  };

  const handleEditProvider = (providerId: string) => {
    const provider = providers.find(p => p.id === providerId);
    if (provider) {
      setEditingProvider(providerId);
      setEditApiKey(provider.apiKey || '');
      setEditBaseUrl(provider.baseUrl || '');
    }
  };

  const handleSaveProvider = () => {
    if (!editingProvider) return;

    const updatedProviders = providers.map(p => {
      if (p.id === editingProvider) {
        return {
          ...p,
          apiKey: editApiKey.trim() || undefined,
          baseUrl: editBaseUrl.trim() || p.baseUrl,
          enabled: !!editApiKey.trim()
        };
      }
      return p;
    });

    saveProviders(updatedProviders);
    setEditingProvider(null);
    setEditApiKey('');
    setEditBaseUrl('');
    toast.success('API 키가 저장되었습니다');
  };

  const handleCancelEdit = () => {
    setEditingProvider(null);
    setEditApiKey('');
    setEditBaseUrl('');
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>설정</DialogTitle>
        </DialogHeader>

        <div className="space-y-6 py-4">
          {/* 앱 정보 섹션 */}
          <div className="space-y-3">
            <h3 className="text-lg font-semibold">앱 정보</h3>
            <div className="bg-muted p-4 rounded-lg space-y-2">
              <div className="flex items-center gap-2">
                <span className="text-2xl">📝</span>
                <div>
                  <p className="font-medium">Memoji - 스마트 메모 앱</p>
                  <p className="text-sm text-muted-foreground">버전 1.0.0</p>
                </div>
              </div>
              <Separator className="my-3" />
              <div className="space-y-2 text-sm">
                <p className="text-muted-foreground">
                  <strong>Memoji</strong>는 날짜별 메모와 프로젝트 관리를 한 곳에서 할 수 있는 
                  스마트 메모 애플리케이션입니다.
                </p>
                <ul className="list-disc list-inside space-y-1 text-muted-foreground ml-2">
                  <li>📅 날짜별 메모 자동 정리</li>
                  <li>📁 프로젝트 단위 메모 관리</li>
                  <li>🏷️ 태그 기반 검색 및 분류</li>
                  <li>🎨 마크다운 지원 및 실시간 미리보기</li>
                  <li>🌓 다크모드 지원</li>
                  <li>⚡ 빠른 검색 및 단축키</li>
                </ul>
              </div>
            </div>
          </div>

          <Separator />

          {/* 데이터 저장 위치 섹션 */}
          <div className="space-y-3">
            <h3 className="text-lg font-semibold flex items-center gap-2">
              💾 데이터 저장 위치
            </h3>
            <div className="bg-muted p-4 rounded-lg space-y-3">
              <div className="space-y-2">
                <Label className="text-sm font-medium">현재 데이터베이스 경로</Label>
                <div className="flex gap-2">
                  <Input
                    value={dataPath}
                    readOnly
                    className="font-mono text-xs"
                  />
                  <Button
                    onClick={handleOpenDataFolder}
                    variant="outline"
                    size="sm"
                  >
                    📁 폴더 열기
                  </Button>
                </div>
              </div>

              <div className="bg-blue-500/10 border border-blue-500/20 rounded-lg p-3">
                <div className="flex items-start gap-2">
                  <span className="text-lg">✅</span>
                  <div className="space-y-1">
                    <p className="text-sm font-medium text-blue-700 dark:text-blue-400">
                      VDI 환경 지원
                    </p>
                    <p className="text-xs text-muted-foreground">
                      데이터가 실행 파일과 같은 폴더의 'data' 디렉토리에 저장됩니다.
                      VDI 환경에서도 안전하게 사용할 수 있습니다.
                    </p>
                  </div>
                </div>
              </div>
            </div>
          </div>

          <Separator />

          {/* AI 도우미 설정 섹션 */}
          <div className="space-y-3">
            <h3 className="text-lg font-semibold flex items-center gap-2">
              <Settings className="w-5 h-5" />
              AI 도우미 설정
            </h3>
            <p className="text-sm text-muted-foreground">
              사용할 LLM Provider의 API 키를 입력하세요
            </p>

            {/* Provider 목록 */}
            <div className="border rounded-lg overflow-hidden">
              {/* 헤더 */}
              <div className="flex items-center gap-2 bg-muted px-2 py-1.5 text-[10px] font-medium border-b">
                <div className="w-[70px] flex-shrink-0">ID</div>
                <div className="w-[80px] flex-shrink-0">Type</div>
                <div className="flex-1 min-w-0">API Key</div>
                <div className="w-[50px] flex-shrink-0 text-center">설정</div>
              </div>

              {/* Provider 행들 */}
              <div className="divide-y">
                {providers.map((provider) => (
                  <div key={provider.id} className="flex items-center gap-2 px-2 py-1.5 hover:bg-muted/50 text-[10px]">
                    <div className="w-[70px] flex-shrink-0 truncate">{provider.id}</div>
                    <div className="w-[80px] flex-shrink-0 text-muted-foreground truncate">{provider.name}</div>
                    <div className="flex-1 min-w-0 truncate">
                      {provider.apiKey ? (
                        <span className="text-muted-foreground">••••••••</span>
                      ) : (
                        <span className="text-muted-foreground text-[9px]">Set API key</span>
                      )}
                    </div>
                    <div className="w-[50px] flex-shrink-0 flex justify-center">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleEditProvider(provider.id)}
                        className="h-6 w-6 p-0"
                      >
                        <Settings className="h-3 w-3" />
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>

          <Separator />

          {/* 앱 제목 변경 섹션 */}
          <div className="space-y-3">
            <h3 className="text-lg font-semibold">앱 제목 설정</h3>
            <div className="space-y-2">
              <Label htmlFor="app-title">앱 제목</Label>
              <Input
                id="app-title"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="앱 제목을 입력하세요"
                className="max-w-md"
              />
              <p className="text-xs text-muted-foreground">
                상단 바에 표시될 앱 제목을 변경할 수 있습니다.
              </p>
            </div>
          </div>

          <Separator />

          {/* 사용 팁 섹션 */}
          <div className="space-y-3">
            <h3 className="text-lg font-semibold">사용 팁</h3>
            <div className="bg-muted p-4 rounded-lg space-y-2 text-sm">
              <div className="space-y-2">
                <p className="font-medium">💡 효율적인 사용법</p>
                <ul className="list-disc list-inside space-y-1 text-muted-foreground ml-2">
                  <li><kbd className="px-1.5 py-0.5 bg-background rounded text-xs">Ctrl + N</kbd> - 새 메모 빠르게 생성</li>
                  <li><kbd className="px-1.5 py-0.5 bg-background rounded text-xs">Ctrl + F</kbd> - 검색창 포커스</li>
                  <li><kbd className="px-1.5 py-0.5 bg-background rounded text-xs">F11</kbd> - 집중 모드 토글</li>
                  <li>태그는 <code className="px-1 py-0.5 bg-background rounded">#태그명</code> 형식으로 자동 인식됩니다</li>
                  <li>날짜별 메모는 자동으로 해당 날짜에 저장됩니다</li>
                  <li>프로젝트 메모는 장기 프로젝트 관리에 활용하세요</li>
                </ul>
              </div>
            </div>
          </div>

          <Separator />

          {/* 개발 정보 */}
          <div className="space-y-2">
            <h3 className="text-lg font-semibold">개발 정보</h3>
            <div className="text-sm text-muted-foreground space-y-1">
              <p>Built with React + TypeScript + Tauri</p>
              <p>© 2025 Memoji. All rights reserved.</p>
            </div>
          </div>
        </div>

        {/* 하단 버튼 */}
        <div className="flex justify-end gap-2 pt-4 border-t">
          <Button variant="outline" onClick={onClose}>
            취소
          </Button>
          <Button onClick={handleSave}>
            저장
          </Button>
        </div>
      </DialogContent>

      {/* Provider 편집 다이얼로그 */}
      {editingProvider && (
        <Dialog open={!!editingProvider} onOpenChange={() => handleCancelEdit()}>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle>
                Edit Provider: {providers.find(p => p.id === editingProvider)?.name}
              </DialogTitle>
            </DialogHeader>

            <div className="space-y-4 py-4">
              <div className="space-y-2">
                <Label htmlFor="api-key">
                  API Key <span className="text-destructive">*</span>
                </Label>
                <Input
                  id="api-key"
                  type="password"
                  value={editApiKey}
                  onChange={(e) => setEditApiKey(e.target.value)}
                  placeholder="Enter API key"
                />
                <p className="text-xs text-muted-foreground">
                  (leave blank if not required)
                </p>
              </div>

              <div className="space-y-2">
                <Label htmlFor="base-url">Base URL</Label>
                <Input
                  id="base-url"
                  value={editBaseUrl}
                  onChange={(e) => setEditBaseUrl(e.target.value)}
                  placeholder="Enter base URL"
                />
                <p className="text-xs text-muted-foreground">
                  (leave blank if using default)
                </p>
              </div>
            </div>

            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={handleCancelEdit}>
                Cancel
              </Button>
              <Button onClick={handleSaveProvider}>
                Save
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      )}
    </Dialog>
  );
};

