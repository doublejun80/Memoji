import { describe, expect, it } from 'vitest';
import { TAURI_COMMANDS } from './tauriCommands';

describe('TAURI_COMMANDS', () => {
  it('keeps every frontend command name unique and includes the GA contracts', () => {
    const commands = Object.values(TAURI_COMMANDS);
    expect(new Set(commands).size).toBe(commands.length);
    expect(commands).toEqual(expect.arrayContaining([
      'save_page_v2',
      'list_tasks',
      'local_ai_generate_mtp_stream',
      'get_data_path_status',
      'export_diagnostic_zip',
    ]));
  });
});
