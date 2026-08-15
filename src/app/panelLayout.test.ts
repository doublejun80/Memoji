import { describe, expect, it } from 'vitest';
import { resolveLayoutMode } from './panelLayout';

describe('resolveLayoutMode', () => {
  it.each([
    [1440, 'three-pane'],
    [1200, 'three-pane'],
    [1100, 'three-pane'],
    [1024, 'right-overlay'],
    [900, 'right-overlay'],
    [899, 'dual-overlay'],
    [800, 'dual-overlay'],
  ] as const)('maps %ipx to %s', (width, mode) => {
    expect(resolveLayoutMode(width)).toBe(mode);
  });
});
