import { describe, expect, it } from 'vitest';
import { DEFAULT_WORKSPACE_UI_STATE } from './workspaceState';

describe('DEFAULT_WORKSPACE_UI_STATE', () => {
  it('opens the complete desktop editing workspace with the GA panel defaults', () => {
    expect(DEFAULT_WORKSPACE_UI_STATE).toMatchObject({
      leftView: 'today',
      workspaceView: 'editor',
      contextTab: 'ai',
      leftOpen: true,
      rightOpen: true,
      leftWidth: 240,
      rightWidth: 304,
    });
  });
});
