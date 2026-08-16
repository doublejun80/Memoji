import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

describe('Tauri plugin configuration', () => {
  it('does not pass an unsupported configuration object to the dialog plugin', () => {
    const config = JSON.parse(
      readFileSync(resolve(process.cwd(), 'src-tauri/tauri.conf.json'), 'utf8'),
    ) as { plugins?: Record<string, unknown> };

    expect(config.plugins).not.toHaveProperty('dialog');
  });

  it('uses an isolated bundle identifier for the native development app', () => {
    const packageJson = JSON.parse(
      readFileSync(resolve(process.cwd(), 'package.json'), 'utf8'),
    ) as { scripts?: Record<string, string> };
    const devConfig = JSON.parse(
      readFileSync(resolve(process.cwd(), 'src-tauri/tauri.dev.conf.json'), 'utf8'),
    ) as { identifier?: string; app?: { windows?: Array<{ title?: string }> } };

    expect(packageJson.scripts?.['tauri:dev']).toContain('tauri.dev.conf.json');
    expect(devConfig.identifier).toBe('com.memoji.app.dev');
    expect(devConfig.app?.windows?.[0]?.title).toContain('Dev');
  });

  it('defines Vue feature flags used by the deferred Milkdown runtime', () => {
    const viteConfig = readFileSync(resolve(process.cwd(), 'vite.config.ts'), 'utf8');

    expect(viteConfig).toContain('__VUE_OPTIONS_API__: false');
    expect(viteConfig).toContain('__VUE_PROD_DEVTOOLS__: false');
    expect(viteConfig).toContain('__VUE_PROD_HYDRATION_MISMATCH_DETAILS__: false');
  });
});
