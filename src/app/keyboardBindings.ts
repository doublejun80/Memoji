import type { AppCommand, CommandContext } from '../commands/types';

function eventShortcut(event: KeyboardEvent): string {
  const parts: string[] = [];
  if (event.ctrlKey) parts.push('Ctrl');
  if (event.altKey) parts.push('Alt');
  if (event.shiftKey) parts.push('Shift');
  if (event.metaKey) parts.push('Meta');
  const key = event.key.length === 1 ? event.key.toUpperCase() : event.key;
  parts.push(key);
  return parts.join('+');
}

function isProtectedTextTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  return target instanceof HTMLInputElement
    || target instanceof HTMLTextAreaElement
    || target instanceof HTMLSelectElement
    || target.isContentEditable;
}

export function commandIdForKeyboardEvent(
  event: KeyboardEvent,
  commands: AppCommand[],
): string | null {
  if (event.isComposing || event.key === 'Process') return null;
  const shortcut = eventShortcut(event);
  const command = commands.find((candidate) => candidate.shortcut === shortcut);
  if (!command) return null;
  if (isProtectedTextTarget(event.target) && !command.global) return null;
  return command.id;
}

export function bindCommandKeyboard(
  commands: AppCommand[],
  getContext: () => CommandContext,
): () => void {
  const handleKeyDown = (event: KeyboardEvent) => {
    const commandId = commandIdForKeyboardEvent(event, commands);
    if (!commandId) return;
    const command = commands.find((candidate) => candidate.id === commandId);
    const context = getContext();
    if (!command?.enabled(context)) return;
    event.preventDefault();
    void Promise.resolve(command.run(context)).catch((error) => {
      console.error(`Command ${command.id} failed:`, error);
    });
  };

  document.addEventListener('keydown', handleKeyDown);
  return () => document.removeEventListener('keydown', handleKeyDown);
}
