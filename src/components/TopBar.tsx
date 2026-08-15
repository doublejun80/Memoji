import React from 'react';
import {
  Check,
  Download,
  Keyboard,
  Maximize2,
  Minus,
  Moon,
  PanelLeftClose,
  PanelLeftOpen,
  PanelRightClose,
  PanelRightOpen,
  Save,
  Settings,
  Square,
  Sun,
  X as CloseIcon,
} from 'lucide-react';
import { getCurrentWindow } from '@tauri-apps/api/window';
import { toast } from 'sonner';
import { useFocusMode } from '../contexts/FocusModeContext';
import { useTheme } from '../contexts/ThemeContext';
import { Button } from './ui/button';

interface TopBarProps {
  onSave: () => void | Promise<void>;
  onShortcutsOpen?: () => void;
  onSettingsOpen?: () => void;
  onRightPanelToggle?: () => void;
  isRightPanelOpen?: boolean;
  onLeftPanelToggle?: () => void;
  isLeftPanelOpen?: boolean;
  appTitle?: string;
  onExport?: () => void | Promise<void>;
}

const iconButtonClass = 'h-8 w-8 rounded-md p-0';
const iconClass = 'h-4 w-4';

const stopDrag = (event: React.MouseEvent) => {
  event.stopPropagation();
};

export const TopBar: React.FC<TopBarProps> = ({
  onSave,
  onShortcutsOpen,
  onSettingsOpen,
  onRightPanelToggle,
  isRightPanelOpen = true,
  onLeftPanelToggle,
  isLeftPanelOpen = true,
  appTitle = 'Memoji',
  onExport,
}) => {
  const [isSaving, setIsSaving] = React.useState(false);
  const { setTheme, actualTheme } = useTheme();
  const { toggleFocusMode } = useFocusMode();

  const handleSave = async () => {
    setIsSaving(true);
    try {
      await onSave();
      toast.success('저장되었습니다');
    } catch (error) {
      toast.error('저장하지 못했습니다: ' + String(error));
    } finally {
      setIsSaving(false);
    }
  };

  const handleWindowAction = async (action: 'minimize' | 'maximize' | 'close') => {
    const appWindow = getCurrentWindow();
    if (action === 'minimize') await appWindow.minimize();
    if (action === 'maximize') await appWindow.toggleMaximize();
    if (action === 'close') await appWindow.close();
  };

  return (
    <div
      className="memoji-topbar"
      data-tauri-drag-region
    >
      <div className="memoji-topbar-left">
        {onLeftPanelToggle && (
          <Button
            variant="outline"
            size="sm"
            className={iconButtonClass}
            onClick={onLeftPanelToggle}
            onMouseDown={stopDrag}
            title={isLeftPanelOpen ? '왼쪽 패널 닫기' : '왼쪽 패널 열기'}
            aria-label={isLeftPanelOpen ? '왼쪽 패널 닫기' : '왼쪽 패널 열기'}
            data-panel-toggle="left"
          >
            {isLeftPanelOpen ? <PanelLeftClose className={iconClass} /> : <PanelLeftOpen className={iconClass} />}
          </Button>
        )}
        <h1 className="memoji-topbar-title">{appTitle}</h1>
      </div>

      <div className="memoji-topbar-right">
        <div className="memoji-topbar-group">
          <Button
            variant="outline"
            size="sm"
            className={iconButtonClass}
            onClick={toggleFocusMode}
            onMouseDown={stopDrag}
            title="집중 모드"
          >
            <Maximize2 className={iconClass} />
          </Button>
          <Button
            variant="outline"
            size="sm"
            className={iconButtonClass}
            onClick={() => setTheme(actualTheme === 'dark' ? 'light' : 'dark')}
            onMouseDown={stopDrag}
            title={actualTheme === 'dark' ? '라이트 모드' : '다크 모드'}
          >
            {actualTheme === 'dark' ? <Sun className={iconClass} /> : <Moon className={iconClass} />}
          </Button>
          {onRightPanelToggle && (
            <Button
              variant="outline"
              size="sm"
              className={iconButtonClass}
              onClick={onRightPanelToggle}
              onMouseDown={stopDrag}
              title={isRightPanelOpen ? '오른쪽 패널 닫기' : '오른쪽 패널 열기'}
              aria-label={isRightPanelOpen ? '오른쪽 패널 닫기' : '오른쪽 패널 열기'}
              data-panel-toggle="right"
            >
              {isRightPanelOpen ? <PanelRightClose className={iconClass} /> : <PanelRightOpen className={iconClass} />}
            </Button>
          )}
        </div>

        <div className="memoji-topbar-divider" />

        <div className="memoji-topbar-group">
          <Button
            variant="outline"
            size="sm"
            onClick={handleSave}
            onMouseDown={stopDrag}
            disabled={isSaving}
            className={iconButtonClass}
            title="저장"
          >
            {isSaving ? <Check className={`${iconClass} animate-pulse`} /> : <Save className={iconClass} />}
          </Button>
          {onExport && (
            <Button
              variant="outline"
              size="sm"
              className={iconButtonClass}
              onClick={() => {
                void Promise.resolve(onExport()).then(() => {
                  toast.success('파일이 다운로드되었습니다');
                }).catch((error) => {
                  toast.error('내보내기 실패: ' + String(error));
                });
              }}
              onMouseDown={stopDrag}
              title="Markdown 내보내기"
            >
              <Download className={iconClass} />
            </Button>
          )}
        </div>

        <div className="memoji-topbar-divider" />

        <div className="memoji-topbar-group">
          {onShortcutsOpen && (
            <Button
              variant="outline"
              size="sm"
              className={iconButtonClass}
              onClick={onShortcutsOpen}
              onMouseDown={stopDrag}
              title="앱 단축키 설정"
            >
              <Keyboard className={iconClass} />
            </Button>
          )}

          {onSettingsOpen && (
            <Button
              variant="outline"
              size="sm"
              className={iconButtonClass}
              onClick={onSettingsOpen}
              onMouseDown={stopDrag}
              title="설정"
            >
              <Settings className={iconClass} />
            </Button>
          )}
        </div>

        <div className="memoji-topbar-divider" />

        <div className="memoji-topbar-group">
          <Button
            variant="ghost"
            size="sm"
            type="button"
            onClick={(event) => {
              event.preventDefault();
              event.stopPropagation();
              handleWindowAction('minimize');
            }}
            onMouseDown={stopDrag}
            className={iconButtonClass}
            title="최소화"
          >
            <Minus className={iconClass} />
          </Button>
          <Button
            variant="ghost"
            size="sm"
            type="button"
            onClick={(event) => {
              event.preventDefault();
              event.stopPropagation();
              handleWindowAction('maximize');
            }}
            onMouseDown={stopDrag}
            className={iconButtonClass}
            title="최대화"
          >
            <Square className={iconClass} />
          </Button>
          <Button
            variant="ghost"
            size="sm"
            type="button"
            onClick={(event) => {
              event.preventDefault();
              event.stopPropagation();
              handleWindowAction('close');
            }}
            onMouseDown={stopDrag}
            className={`${iconButtonClass} hover:bg-red-600 hover:text-white`}
            title="닫기"
          >
            <CloseIcon className={iconClass} />
          </Button>
        </div>
      </div>
    </div>
  );
};
