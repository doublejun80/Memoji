import {
  createContext,
  createElement,
  type Dispatch,
  type ReactNode,
  useContext,
  useEffect,
  useMemo,
  useReducer,
} from 'react';
import {
  DEFAULT_WORKSPACE_UI_STATE,
  type ContextHubTab,
  type LeftView,
  type WorkspaceUiState,
  type WorkspaceView,
} from './workspaceState';
import { workspaceReducer, type WorkspaceUiAction } from './workspaceReducer';

const STORAGE_KEY = 'memoji.workspace.ui.v1';

interface WorkspaceController {
  state: WorkspaceUiState;
  dispatch: Dispatch<WorkspaceUiAction>;
  setLeftView: (view: LeftView) => void;
  setWorkspaceView: (view: WorkspaceView) => void;
  setContextTab: (tab: ContextHubTab) => void;
  togglePanel: (panel: 'left' | 'right') => void;
  setPanelOpen: (panel: 'left' | 'right', open: boolean) => void;
  setPanelWidth: (panel: 'left' | 'right', width: number) => void;
  setCommandPaletteOpen: (open: boolean) => void;
  setFocusMode: (enabled: boolean) => void;
}

const WorkspaceControllerContext = createContext<WorkspaceController | null>(null);

function restoreWorkspaceUiState(): WorkspaceUiState {
  if (typeof window === 'undefined') return DEFAULT_WORKSPACE_UI_STATE;

  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULT_WORKSPACE_UI_STATE;
    const parsed = JSON.parse(raw) as Partial<WorkspaceUiState>;
    let restored = { ...DEFAULT_WORKSPACE_UI_STATE };

    if (typeof parsed.leftOpen === 'boolean') restored.leftOpen = parsed.leftOpen;
    if (typeof parsed.rightOpen === 'boolean') restored.rightOpen = parsed.rightOpen;
    if (typeof parsed.commandPaletteOpen === 'boolean') {
      restored.commandPaletteOpen = parsed.commandPaletteOpen;
    }
    if (typeof parsed.focusMode === 'boolean') restored.focusMode = parsed.focusMode;
    if (typeof parsed.leftView === 'string') restored.leftView = parsed.leftView as LeftView;
    if (typeof parsed.workspaceView === 'string') {
      restored.workspaceView = parsed.workspaceView as WorkspaceView;
    }
    if (typeof parsed.contextTab === 'string') {
      restored.contextTab = parsed.contextTab as ContextHubTab;
    }
    if (typeof parsed.leftWidth === 'number') {
      restored = workspaceReducer(restored, {
        type: 'set-panel-width',
        panel: 'left',
        width: parsed.leftWidth,
      });
    }
    if (typeof parsed.rightWidth === 'number') {
      restored = workspaceReducer(restored, {
        type: 'set-panel-width',
        panel: 'right',
        width: parsed.rightWidth,
      });
    }
    return restored;
  } catch {
    return DEFAULT_WORKSPACE_UI_STATE;
  }
}

export function WorkspaceControllerProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(workspaceReducer, undefined, restoreWorkspaceUiState);

  useEffect(() => {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  }, [state]);

  const value = useMemo<WorkspaceController>(() => ({
    state,
    dispatch,
    setLeftView: (view) => dispatch({ type: 'set-left-view', view }),
    setWorkspaceView: (view) => dispatch({ type: 'set-workspace-view', view }),
    setContextTab: (tab) => dispatch({ type: 'set-context-tab', tab }),
    togglePanel: (panel) => dispatch({ type: 'toggle-panel', panel }),
    setPanelOpen: (panel, open) => dispatch({ type: 'set-panel-open', panel, open }),
    setPanelWidth: (panel, width) => dispatch({ type: 'set-panel-width', panel, width }),
    setCommandPaletteOpen: (open) => dispatch({ type: 'set-command-palette-open', open }),
    setFocusMode: (enabled) => dispatch({ type: 'set-focus-mode', enabled }),
  }), [state]);

  return createElement(WorkspaceControllerContext.Provider, { value }, children);
}

export function useWorkspaceController(): WorkspaceController {
  const controller = useContext(WorkspaceControllerContext);
  if (!controller) {
    throw new Error('useWorkspaceController must be used inside WorkspaceControllerProvider');
  }
  return controller;
}
