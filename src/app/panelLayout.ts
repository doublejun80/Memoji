export type WorkspaceLayoutMode = 'three-pane' | 'right-overlay' | 'dual-overlay';

export const RIGHT_OVERLAY_BREAKPOINT = 1100;
export const DUAL_OVERLAY_BREAKPOINT = 900;

export function resolveLayoutMode(width: number): WorkspaceLayoutMode {
  if (width < DUAL_OVERLAY_BREAKPOINT) return 'dual-overlay';
  if (width < RIGHT_OVERLAY_BREAKPOINT) return 'right-overlay';
  return 'three-pane';
}
