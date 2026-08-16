#!/usr/bin/env node

import { createReadStream } from 'node:fs';
import { access, mkdir, readFile, stat, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { dirname, join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';

const args = parseArgs(process.argv.slice(2));
if (args.help) {
  process.stdout.write('Usage: node scripts/verify-litert-runtime.mjs --bundle <dir> [--smoke] [--output report.json] [--strict]\n');
  process.exit(0);
}
const bundle = resolve(args.bundle ?? process.env.MEMOJI_LITERT_BUNDLE_DIR ?? 'release/memoji-vdi/ai');
const report = {
  schemaVersion: 2,
  capturedAt: new Date().toISOString(),
  platform: process.platform,
  arch: process.arch,
  bundle,
  transport: null,
  runtimeVersion: null,
  model: null,
  gates: {},
  status: 'running',
  limitations: [],
};

try {
  const manifest = JSON.parse(await readFile(join(bundle, 'bundle-manifest.json'), 'utf8'));
  report.transport = manifest.transport;
  report.runtimeVersion = manifest.liteRtLmVersion;
  report.model = manifest.model?.id ?? null;
  report.gates.inProcess = manifest.transport === 'in_process';
  report.gates.noLoopbackEndpoint = manifest.runtime?.endpoint == null;
  report.gates.noPython = manifest.runtime?.python == null;
  report.gates.runtimeHash = await verifyFile(bundle, manifest.runtime.library, manifest.runtime.sha256, manifest.runtime.bytes);
  report.gates.modelHash = await verifyFile(bundle, manifest.model.file, manifest.model.sha256, manifest.model.bytes);
  if (args.smoke) {
    const smokePath = resolve(args['smoke-output'] ?? 'release/vdi-benchmark-smoke.json');
    const smoke = spawnSync('cargo', [
      'run', '--manifest-path', 'src-tauri/Cargo.toml', '--bin', 'memoji-vdi-benchmark', '--',
      '--bundle', bundle, '--model', manifest.model.id, '--threads', '4', '--prompt-chars', '128',
      '--output-tokens', '16', '--output', smokePath,
    ], { encoding: 'utf8', maxBuffer: 16 * 1024 * 1024 });
    report.gates.realGenerationSmoke = smoke.status === 0;
    report.smoke = { output: smokePath, exitCode: smoke.status, stderr: smoke.stderr?.slice(-2_000) ?? '' };
  }
  report.status = Object.values(report.gates).every(Boolean) ? (process.platform === 'win32' ? 'passed-vdi-host' : 'passed-non-vdi') : 'failed';
} catch (error) {
  report.status = 'failed';
  report.error = String(error);
}

if (process.platform !== 'win32') report.limitations.push('This host is not Windows VDI acceptance evidence.');
const rendered = `${JSON.stringify(report, null, 2)}\n`;
if (args.output) {
  const output = resolve(args.output);
  await mkdir(dirname(output), { recursive: true });
  await writeFile(output, rendered, 'utf8');
}
process.stdout.write(rendered);
if (args.strict && !report.status.startsWith('passed')) process.exitCode = 2;

async function verifyFile(root, relativePath, expectedHash, expectedBytes) {
  const path = join(root, relativePath);
  await access(path);
  const file = await stat(path);
  if (file.size !== expectedBytes) return false;
  const hash = createHash('sha256');
  for await (const chunk of createReadStream(path)) hash.update(chunk);
  return hash.digest('hex') === expectedHash;
}

function parseArgs(values) {
  const parsed = {};
  for (let index = 0; index < values.length; index += 1) {
    const token = values[index];
    if (!token.startsWith('--')) continue;
    const key = token.slice(2);
    const next = values[index + 1];
    if (!next || next.startsWith('--')) parsed[key] = true;
    else { parsed[key] = next; index += 1; }
  }
  return parsed;
}
