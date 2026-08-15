import { TopCommandBar } from '../workspace/TopCommandBar';
import { useFocusMode } from '../contexts/FocusModeContext';
import { useTheme } from '../contexts/ThemeContext';

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

/**
 * Compatibility boundary for extensions that still import the pre-GA TopBar.
 * The product shell renders TopCommandBar directly.
 */
export function TopBar({
  onSave,
  onShortcutsOpen = () => undefined,
  onSettingsOpen = () => undefined,
  onRightPanelToggle = () => undefined,
  isRightPanelOpen = true,
  onLeftPanelToggle = () => undefined,
  isLeftPanelOpen = true,
  appTitle = 'Memoji',
  onExport = () => undefined,
}: TopBarProps) {
  const { toggleFocusMode } = useFocusMode();
  const { actualTheme, setTheme } = useTheme();

  return (
    <TopCommandBar
      workspaceName={appTitle}
      leftOpen={isLeftPanelOpen}
      rightOpen={isRightPanelOpen}
      saveState="saved"
      runtimeState="로컬 AI"
      onToggleLeft={onLeftPanelToggle}
      onToggleRight={onRightPanelToggle}
      onOpenPalette={onShortcutsOpen}
      onSave={onSave}
      onExport={onExport}
      onOpenSettings={onSettingsOpen}
      onOpenShortcuts={onShortcutsOpen}
      onToggleFocus={toggleFocusMode}
      onToggleTheme={() => setTheme(actualTheme === 'dark' ? 'light' : 'dark')}
    />
  );
}
