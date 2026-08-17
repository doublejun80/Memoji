import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

describe('VDI local AI runtime contract', () => {
  it('promotes LiteRT-LM 0.16.0 and its native C API as the GA default', () => {
    const manifest = JSON.parse(
      readFileSync(
        resolve(process.cwd(), 'src-tauri/resources/local_ai/runtime-compatibility.json'),
        'utf8',
      ),
    ) as {
      defaultVersion?: string;
      decision?: { status?: string; transport?: string };
      versions?: Record<string, { role?: string; cApi?: { version?: string } }>;
    };

    expect(manifest.defaultVersion).toBe('0.16.0');
    expect(manifest.decision).toMatchObject({
      status: 'promote-native-c-api',
      transport: 'in_process',
    });
    expect(manifest.versions?.['0.16.0']).toMatchObject({
      role: 'ga-default',
      cApi: { version: '0.1.0' },
    });
  });

  it('stages the native C API without a bundled Python server', () => {
    const script = readFileSync(
      resolve(process.cwd(), 'scripts/prepare-vdi-ai-bundle.mjs'),
      'utf8',
    );

    expect(script).toContain('litert_lm_c_api-0.1.0.zip');
    expect(script).toContain("join(runtimeDirectory, 'lib')");
    expect(script).toContain("transport: 'in_process'");
    expect(script).not.toContain('preparePythonRuntime');
    expect(script).not.toContain('litert_lm_cli.main serve');
  });

  it('ships an in-process VDI benchmark matrix and a cross-platform runtime-aware SBOM generator', () => {
    const benchmark = readFileSync(resolve(process.cwd(), 'src-tauri/src/bin/memoji-vdi-benchmark.rs'), 'utf8');
    const sbom = readFileSync(resolve(process.cwd(), 'scripts/generate-sbom.mjs'), 'utf8');
    expect(benchmark).toContain('"cold"');
    expect(benchmark).toContain('"warm"');
    expect(benchmark).toContain('MEMOJI_LITERT_THREADS');
    expect(benchmark).toContain('prompt_chars');
    expect(benchmark).toContain('max_output_tokens');
    expect(sbom).toContain('runtime-compatibility.json');
    expect(sbom).toContain('machine-learning-model');
    expect(sbom).toContain('LiteRT-LM');
    expect(sbom).toContain("join(dirname(process.execPath), 'node_modules', 'npm', 'bin', 'npm-cli.js')");
    expect(sbom).toContain('jsonCommand(process.execPath, [npmCli, ...commandArgs])');
    expect(sbom).not.toContain("'npm.cmd'");
  });
});
