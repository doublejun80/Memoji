import { mkdirSync, mkdtempSync, rmSync, unlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { afterEach, describe, expect, it } from 'vitest';

const temporaryDirectories: string[] = [];

function completeBundleFixture() {
  const root = mkdtempSync(join(tmpdir(), 'memoji-vdi-contract-'));
  temporaryDirectories.push(root);

  for (const directory of [
    join(root, 'ai', 'runtime', 'lib'),
    join(root, 'ai', 'models', 'gemma4-e2b'),
    join(root, 'webview2'),
  ]) {
    mkdirSync(directory, { recursive: true });
  }

  for (const file of [
    join(root, 'Memoji.exe'),
    join(root, 'Start-Memoji-VDI.cmd'),
    join(root, 'ai', 'runtime', 'lib', 'litert-lm.dll'),
    join(root, 'ai', 'models', 'gemma4-e2b', 'gemma-4-E2B-it.litertlm'),
    join(root, 'webview2', 'MicrosoftEdgeWebView2RuntimeInstallerX64.exe'),
  ]) {
    writeFileSync(file, 'fixture');
  }

  return root;
}

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) {
    rmSync(directory, { recursive: true, force: true });
  }
});

describe('Windows VDI launch bundle contract', () => {
  it('accepts a complete offline-launch bundle', () => {
    const bundle = completeBundleFixture();
    const result = spawnSync(
      process.execPath,
      [resolve('scripts/verify-windows-vdi-launch.mjs'), '--bundle', bundle],
      { encoding: 'utf8' },
    );

    expect(result.status, result.stderr).toBe(0);
    expect(result.stdout).toContain('Windows VDI launch contract verified');
  });

  it('rejects a bundle that would silently depend on system WebView2', () => {
    const bundle = completeBundleFixture();
    unlinkSync(join(bundle, 'webview2', 'MicrosoftEdgeWebView2RuntimeInstallerX64.exe'));

    const result = spawnSync(
      process.execPath,
      [resolve('scripts/verify-windows-vdi-launch.mjs'), '--bundle', bundle],
      { encoding: 'utf8' },
    );

    expect(result.status).toBe(1);
    expect(result.stderr).toContain('webview2/MicrosoftEdgeWebView2RuntimeInstallerX64.exe');
  });
});
