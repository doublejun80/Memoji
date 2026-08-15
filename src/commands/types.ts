import type { LeftView, WorkspaceView } from '../app/workspaceState';

export type CommandCategory = 'navigation' | 'create' | 'document' | 'ai' | 'view' | 'settings';

export interface CommandContext {
  hasCurrentPage: boolean;
  canUseAi: boolean;
  createDailyPage: () => void | Promise<void>;
  quickCapture: () => void | Promise<void>;
  setLeftView: (view: LeftView) => void;
  setWorkspaceView: (view: WorkspaceView) => void;
  openAi: () => void;
  summarizeCurrentPage: () => void | Promise<void>;
  saveDocument: () => void | Promise<void>;
  exportDocument: () => void | Promise<void>;
  openSettings: () => void | Promise<void>;
  toggleFocus: () => void;
  togglePanel: (panel: 'left' | 'right') => void;
  openCommandPalette?: () => void;
}

export interface AppCommand {
  id: string;
  label: string;
  description?: string;
  keywords: string[];
  category: CommandCategory;
  shortcut?: string;
  global?: boolean;
  enabled(ctx: CommandContext): boolean;
  run(ctx: CommandContext): void | Promise<void>;
}
