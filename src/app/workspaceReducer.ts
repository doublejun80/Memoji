import type { ContextHubTab, LeftView, WorkspaceUiState, WorkspaceView } from './workspaceState';

export const LEFT_PANEL_MIN = 220;
export const LEFT_PANEL_MAX = 360;
export const RIGHT_PANEL_MIN = 288;
export const RIGHT_PANEL_MAX = 440;

export type WorkspaceUiAction =
  | { type: 'set-left-view'; view: LeftView }
  | { type: 'set-workspace-view'; view: WorkspaceView }
  | { type: 'set-context-tab'; tab: ContextHubTab }
  | { type: 'toggle-panel'; panel: 'left' | 'right' }
  | { type: 'set-panel-open'; panel: 'left' | 'right'; open: boolean }
  | { type: 'set-panel-width'; panel: 'left' | 'right'; width: number }
  | { type: 'set-command-palette-open'; open: boolean }
  | { type: 'set-focus-mode'; enabled: boolean };

function clamp(value: number, minimum: number, maximum: number): number {
  if (!Number.isFinite(value)) return minimum;
  return Math.min(maximum, Math.max(minimum, Math.round(value)));
}

export function workspaceReducer(
  state: WorkspaceUiState,
  action: WorkspaceUiAction,
): WorkspaceUiState {
  switch (action.type) {
    case 'set-left-view':
      return { ...state, leftView: action.view };
    case 'set-workspace-view':
      return { ...state, workspaceView: action.view };
    case 'set-context-tab':
      return { ...state, contextTab: action.tab };
    case 'toggle-panel': {
      const key = action.panel === 'left' ? 'leftOpen' : 'rightOpen';
      return { ...state, [key]: !state[key] };
    }
    case 'set-panel-open': {
      const key = action.panel === 'left' ? 'leftOpen' : 'rightOpen';
      return { ...state, [key]: action.open };
    }
    case 'set-panel-width':
      if (action.panel === 'left') {
        return {
          ...state,
          leftWidth: clamp(action.width, LEFT_PANEL_MIN, LEFT_PANEL_MAX),
        };
      }
      return {
        ...state,
        rightWidth: clamp(action.width, RIGHT_PANEL_MIN, RIGHT_PANEL_MAX),
      };
    case 'set-command-palette-open':
      return { ...state, commandPaletteOpen: action.open };
    case 'set-focus-mode':
      return { ...state, focusMode: action.enabled };
    default:
      return state;
  }
}
