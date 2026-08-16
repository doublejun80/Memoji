import { useEffect, useRef, useState } from 'react';
import {
  Bot,
  Check,
  Command,
  Download,
  Focus,
  Keyboard,
  MoreHorizontal,
  PanelLeftClose,
  PanelLeftOpen,
  PanelRightClose,
  PanelRightOpen,
  Save,
  Settings,
  SunMoon,
} from 'lucide-react';
import { WindowControls } from './WindowControls';

export type SaveState = 'saved' | 'saving' | 'unsaved' | 'error';

interface TopCommandBarProps {
  workspaceName: string;
  leftOpen: boolean;
  rightOpen: boolean;
  saveState: SaveState;
  runtimeState: string;
  onToggleLeft: () => void;
  onToggleRight: () => void;
  onOpenPalette: () => void;
  onSave: () => void | Promise<void>;
  onExport: () => void | Promise<void>;
  onOpenSettings: () => void;
  onOpenShortcuts: () => void;
  onToggleFocus: () => void;
  onToggleTheme: () => void;
}

const saveLabels: Record<SaveState, string> = {
  saved: '저장됨',
  saving: '저장 중…',
  unsaved: '저장 필요',
  error: '저장 오류',
};

export function TopCommandBar(props: TopCommandBarProps) {
  const [overflowOpen, setOverflowOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const overflowRef = useRef<HTMLDivElement>(null);
  const displayedSaveState: SaveState = saving ? 'saving' : props.saveState;

  useEffect(() => {
    if (!overflowOpen) return;
    const dismiss = (event: MouseEvent | KeyboardEvent) => {
      if (event instanceof KeyboardEvent && event.key === 'Escape') {
        setOverflowOpen(false);
        return;
      }
      if (event instanceof MouseEvent && !overflowRef.current?.contains(event.target as Node)) {
        setOverflowOpen(false);
      }
    };
    document.addEventListener('mousedown', dismiss);
    document.addEventListener('keydown', dismiss);
    return () => {
      document.removeEventListener('mousedown', dismiss);
      document.removeEventListener('keydown', dismiss);
    };
  }, [overflowOpen]);

  const save = async () => {
    setSaving(true);
    try {
      await props.onSave();
    } finally {
      setSaving(false);
    }
  };

  const overflowAction = (action: () => void | Promise<void>) => {
    setOverflowOpen(false);
    void Promise.resolve(action());
  };

  return (
    <header className="memoji-command-bar" data-tauri-drag-region>
      <div className="memoji-command-bar-drag-surface" data-tauri-drag-region aria-hidden="true" />
      <div className="memoji-command-bar-leading" data-tauri-drag-region>
        <button
          type="button"
          className="memoji-icon-button"
          aria-label={props.leftOpen ? '왼쪽 패널 닫기' : '왼쪽 패널 열기'}
          title={props.leftOpen ? '왼쪽 패널 닫기' : '왼쪽 패널 열기'}
          data-panel-toggle="left"
          onClick={props.onToggleLeft}
        >
          {props.leftOpen ? <PanelLeftClose aria-hidden="true" /> : <PanelLeftOpen aria-hidden="true" />}
        </button>
        <h1 data-tauri-drag-region>{props.workspaceName}</h1>
      </div>

      <button
        type="button"
        className="memoji-command-launcher"
        aria-label="명령 또는 검색 Ctrl K 열기"
        onClick={props.onOpenPalette}
      >
        <Command aria-hidden="true" />
        <span>명령 또는 검색</span>
        <kbd>Ctrl&nbsp;K</kbd>
      </button>

      <div className="memoji-command-bar-trailing" data-tauri-drag-region>
        <button
          type="button"
          className="memoji-save-indicator"
          aria-label={saveLabels[displayedSaveState]}
          data-save-state={displayedSaveState}
          disabled={saving}
          onClick={() => void save()}
        >
          {displayedSaveState === 'saved' ? <Check aria-hidden="true" /> : <Save aria-hidden="true" />}
          <span>{saveLabels[displayedSaveState]}</span>
        </button>

        <span className="memoji-runtime-indicator" title={props.runtimeState} data-tauri-drag-region>
          <Bot aria-hidden="true" />
          <span>{props.runtimeState}</span>
        </span>

        <button
          type="button"
          className="memoji-icon-button"
          aria-label={props.rightOpen ? '오른쪽 패널 닫기' : '오른쪽 패널 열기'}
          title={props.rightOpen ? '오른쪽 패널 닫기' : '오른쪽 패널 열기'}
          data-panel-toggle="right"
          onClick={props.onToggleRight}
        >
          {props.rightOpen ? <PanelRightClose aria-hidden="true" /> : <PanelRightOpen aria-hidden="true" />}
        </button>

        <div className="memoji-command-overflow" ref={overflowRef} data-command-overflow>
          <button
            type="button"
            className="memoji-icon-button"
            aria-label="더보기"
            aria-haspopup="menu"
            aria-expanded={overflowOpen}
            onClick={() => setOverflowOpen((open) => !open)}
          >
            <MoreHorizontal aria-hidden="true" />
          </button>
          {overflowOpen && (
            <div className="memoji-command-overflow-menu" role="menu" aria-label="더보기 메뉴">
              <button type="button" role="menuitem" onClick={() => overflowAction(props.onToggleTheme)}>
                <SunMoon aria-hidden="true" /> 테마 전환
              </button>
              <button type="button" role="menuitem" onClick={() => overflowAction(props.onExport)}>
                <Download aria-hidden="true" /> Markdown 내보내기
              </button>
              <button type="button" role="menuitem" onClick={() => overflowAction(props.onOpenShortcuts)}>
                <Keyboard aria-hidden="true" /> 단축키 설정
              </button>
              <button type="button" role="menuitem" onClick={() => overflowAction(props.onToggleFocus)}>
                <Focus aria-hidden="true" /> 집중 모드
              </button>
              <button type="button" role="menuitem" onClick={() => overflowAction(props.onOpenSettings)}>
                <Settings aria-hidden="true" /> 설정 열기
              </button>
            </div>
          )}
        </div>

        <WindowControls />
      </div>
    </header>
  );
}
