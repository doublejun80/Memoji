import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const script = (name: string) => readFileSync(join(process.cwd(), 'scripts', name), 'utf8');

describe('Windows release signing gates', () => {
  it.each([
    'build-windows-vdi.ps1',
    'build-windows-x64.ps1',
    'build-windows-avx512.ps1',
  ])('%s fails closed unless unsigned output is explicitly allowed', (name) => {
    const source = script(name);
    expect(source).toContain('[switch]$AllowUnsigned');
    expect(source).toContain('Signing parameters are required for GA output');
    expect(source).toContain('verify /pa /all');
  });

  it('requires Authenticode secrets and verifies CI artifacts before upload', () => {
    const workflow = readFileSync(join(process.cwd(), '.github', 'workflows', 'windows-dist.yml'), 'utf8');
    expect(workflow).toContain('WINDOWS_CERTIFICATE_BASE64');
    expect(workflow).toContain('WINDOWS_CERTIFICATE_PASSWORD');
    expect(workflow).toContain('verify /pa /all');
  });

  it('publishes an explicitly unsigned Windows VDI pilot for RC tags', () => {
    const vdiWorkflow = readFileSync(
      join(process.cwd(), '.github', 'workflows', 'windows-vdi-pilot.yml'),
      'utf8',
    );
    expect(vdiWorkflow).toContain('v*-rc.*');
    expect(vdiWorkflow).toContain('-AllowUnsigned');
    expect(vdiWorkflow).toContain('-DownloadModel');
    expect(vdiWorkflow).toContain('memoji-vdi-benchmark');
    expect(vdiWorkflow).toContain('prerelease: true');
    expect(vdiWorkflow).toContain('SHA256SUMS');
    expect(vdiWorkflow).toContain('cache-on-failure: true');
  });
});
