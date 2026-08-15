import { describe, expect, it, vi } from 'vitest';
import { createCommandRegistry, REQUIRED_GA_COMMAND_IDS } from './commandRegistry';
import type { CommandContext } from './types';

function context(overrides: Partial<CommandContext> = {}): CommandContext {
  return {
    hasCurrentPage: true,
    canUseAi: true,
    createDailyPage: vi.fn(),
    quickCapture: vi.fn(),
    setLeftView: vi.fn(),
    setWorkspaceView: vi.fn(),
    openAi: vi.fn(),
    summarizeCurrentPage: vi.fn(),
    saveDocument: vi.fn(),
    exportDocument: vi.fn(),
    openSettings: vi.fn(),
    toggleFocus: vi.fn(),
    togglePanel: vi.fn(),
    ...overrides,
  };
}

describe('createCommandRegistry', () => {
  it('contains every GA command contract', () => {
    const ids = new Set(createCommandRegistry().map((command) => command.id));
    expect(REQUIRED_GA_COMMAND_IDS.every((id) => ids.has(id))).toBe(true);
  });

  it('does not assign the same shortcut to two commands', () => {
    const shortcuts = createCommandRegistry()
      .map((command) => command.shortcut)
      .filter((shortcut): shortcut is string => Boolean(shortcut));
    expect(new Set(shortcuts).size).toBe(shortcuts.length);
  });

  it('disables document and AI transformations without a current page', () => {
    const commands = createCommandRegistry();
    const empty = context({ hasCurrentPage: false });

    expect(commands.find((command) => command.id === 'document.export')?.enabled(empty)).toBe(false);
    expect(commands.find((command) => command.id === 'ai.summarize.current')?.enabled(empty)).toBe(false);
    expect(commands.find((command) => command.id === 'page.new.daily')?.enabled(empty)).toBe(true);
  });

  it('runs navigation through the supplied application boundary', async () => {
    const ctx = context();
    const command = createCommandRegistry().find((item) => item.id === 'view.calendar');
    await command?.run(ctx);

    expect(ctx.setLeftView).toHaveBeenCalledWith('calendar');
    expect(ctx.setWorkspaceView).toHaveBeenCalledWith('calendar');
  });
});
