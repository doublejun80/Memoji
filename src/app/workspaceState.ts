export type LeftView = 'today' | 'daily' | 'projects' | 'tasks' | 'calendar' | 'knowledge';

export type WorkspaceView = 'editor' | 'tasks' | 'calendar' | 'knowledge' | 'search';

export type ContextHubTab = 'ai' | 'outline' | 'links' | 'tasks' | 'properties' | 'search';

export interface WorkspaceUiState {
  leftView: LeftView;
  workspaceView: WorkspaceView;
  contextTab: ContextHubTab;
  leftOpen: boolean;
  rightOpen: boolean;
  leftWidth: number;
  rightWidth: number;
  commandPaletteOpen: boolean;
  focusMode: boolean;
}

export const DEFAULT_WORKSPACE_UI_STATE: WorkspaceUiState = {
  leftView: 'today',
  workspaceView: 'editor',
  contextTab: 'ai',
  leftOpen: true,
  rightOpen: true,
  leftWidth: 240,
  rightWidth: 304,
  commandPaletteOpen: false,
  focusMode: false,
};
