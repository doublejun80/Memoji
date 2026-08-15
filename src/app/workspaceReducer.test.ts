import { describe, expect, it } from 'vitest';
import { DEFAULT_WORKSPACE_UI_STATE } from './workspaceState';
import { workspaceReducer } from './workspaceReducer';

describe('workspaceReducer', () => {
  it('switches each workspace navigation axis independently', () => {
    const left = workspaceReducer(DEFAULT_WORKSPACE_UI_STATE, {
      type: 'set-left-view',
      view: 'projects',
    });
    const workspace = workspaceReducer(left, {
      type: 'set-workspace-view',
      view: 'tasks',
    });
    const context = workspaceReducer(workspace, {
      type: 'set-context-tab',
      tab: 'properties',
    });

    expect(context).toMatchObject({
      leftView: 'projects',
      workspaceView: 'tasks',
      contextTab: 'properties',
    });
  });

  it('toggles panels without changing the other panel', () => {
    const leftClosed = workspaceReducer(DEFAULT_WORKSPACE_UI_STATE, {
      type: 'toggle-panel',
      panel: 'left',
    });
    const bothClosed = workspaceReducer(leftClosed, {
      type: 'toggle-panel',
      panel: 'right',
    });

    expect(leftClosed.leftOpen).toBe(false);
    expect(leftClosed.rightOpen).toBe(true);
    expect(bothClosed).toMatchObject({ leftOpen: false, rightOpen: false });
  });

  it('clamps persisted resize values to the supported pane bounds', () => {
    const narrowLeft = workspaceReducer(DEFAULT_WORKSPACE_UI_STATE, {
      type: 'set-panel-width',
      panel: 'left',
      width: 10,
    });
    const wideRight = workspaceReducer(narrowLeft, {
      type: 'set-panel-width',
      panel: 'right',
      width: 900,
    });

    expect(wideRight.leftWidth).toBe(220);
    expect(wideRight.rightWidth).toBe(440);
  });

  it('opens and closes the command palette explicitly', () => {
    const open = workspaceReducer(DEFAULT_WORKSPACE_UI_STATE, {
      type: 'set-command-palette-open',
      open: true,
    });
    const closed = workspaceReducer(open, {
      type: 'set-command-palette-open',
      open: false,
    });

    expect(open.commandPaletteOpen).toBe(true);
    expect(closed.commandPaletteOpen).toBe(false);
  });
});
