import { describe, expect, it } from 'vitest';
import { commandIdForKeyboardEvent } from './keyboardBindings';
import { createCommandRegistry } from '../commands/commandRegistry';

function keyEvent(key: string, init: Partial<KeyboardEventInit> = {}, target?: EventTarget) {
  const event = new KeyboardEvent('keydown', { key, ...init });
  if (target) Object.defineProperty(event, 'target', { value: target });
  return event;
}

describe('commandIdForKeyboardEvent', () => {
  const commands = createCommandRegistry();

  it('maps Ctrl+K and F11 to global commands', () => {
    expect(commandIdForKeyboardEvent(keyEvent('k', { ctrlKey: true }), commands)).toBe('command.palette.open');
    expect(commandIdForKeyboardEvent(keyEvent('F11'), commands)).toBe('focus.toggle');
  });

  it('ignores composed keystrokes', () => {
    expect(commandIdForKeyboardEvent(keyEvent('n', { ctrlKey: true, isComposing: true }), commands)).toBeNull();
  });

  it('protects text editing while keeping explicitly global commands available', () => {
    const input = document.createElement('input');
    expect(commandIdForKeyboardEvent(keyEvent('n', { ctrlKey: true }, input), commands)).toBeNull();
    expect(commandIdForKeyboardEvent(keyEvent('k', { ctrlKey: true }, input), commands)).toBe('command.palette.open');
  });
});
