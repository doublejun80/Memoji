import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

function script(name: string) {
  return readFileSync(join(process.cwd(), 'scripts', name), 'utf8');
}

describe('Windows VDI packaging scripts', () => {
  it('builds an app-only patch that leaves the existing AI bundle and user data untouched', () => {
    const patchScript = script('build-windows-vdi-app-patch.ps1');
    expect(patchScript).toContain('npm run tauri:build -- --no-bundle');
    expect(patchScript).toContain('Memoji.exe');
    expect(patchScript).toContain('Start-Memoji-VDI.cmd');
    expect(patchScript).toContain('Set-Content -NoNewline');
    expect(patchScript).not.toContain('prepare-vdi-ai-bundle.mjs');
    expect(patchScript).not.toContain('DownloadModel');
    expect(patchScript).not.toContain('Remove-Item -LiteralPath $ExistingBundle');
  });

  it('marks unsigned builds and verifies the native runtime bundle', () => {
    const buildScript = script('build-windows-vdi.ps1');
    expect(buildScript).toContain('[switch]$AllowUnsigned');
    expect(buildScript).toContain('UNSIGNED-VDI-PILOT.txt');
    expect(buildScript).toContain('verify-litert-runtime.mjs');
  });

  it('splits release assets below GitHub release size limits', () => {
    const packagingScript = script('package-windows-vdi-pilot.ps1');
    expect(packagingScript).toContain('1900000000');
    expect(packagingScript).toContain('Assemble-Memoji-VDI.ps1');
    expect(packagingScript).toContain('2000000000');
  });

  it('reassembles model parts as a stream and verifies SHA-256', () => {
    const assembleScript = script('assemble-windows-vdi-model.ps1');
    expect(assembleScript).toContain('Get-FileHash');
    expect(assembleScript).toContain('CopyTo');
  });
});
