#!/usr/bin/env node

import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';

const args = parseArgs(process.argv.slice(2));
const outputPath = resolve(args.output ?? 'release/sbom.cdx.json');
const packageJson = JSON.parse(await readFile('package.json', 'utf8'));
const runtimeCompatibility = JSON.parse(await readFile(
  'src-tauri/resources/local_ai/runtime-compatibility.json',
  'utf8',
));
const npmExecutable = process.platform === 'win32' ? 'npm.cmd' : 'npm';
const npmTree = jsonCommand(npmExecutable, ['ls', '--all', '--json']);
const cargo = jsonCommand('cargo', ['metadata', '--locked', '--format-version', '1', '--manifest-path', 'src-tauri/Cargo.toml']);
const components = new Map();

function add(component) {
  const key = component['bom-ref'] ?? component.purl ?? `${component.type}:${component.name}:${component.version}`;
  if (!components.has(key)) components.set(key, component);
}

function walkNpm(dependencies = {}) {
  for (const [name, dependency] of Object.entries(dependencies)) {
    if (!dependency?.version) continue;
    add({
      type: 'library',
      name,
      version: dependency.version,
      purl: `pkg:npm/${encodeURIComponent(name)}@${dependency.version}`,
    });
    walkNpm(dependency.dependencies);
  }
}

walkNpm(npmTree.dependencies);
for (const dependency of cargo.packages ?? []) {
  add({
    type: 'library',
    name: dependency.name,
    version: dependency.version,
    purl: `pkg:cargo/${encodeURIComponent(dependency.name)}@${dependency.version}`,
  });
}

const defaultRuntime = runtimeCompatibility.versions[runtimeCompatibility.defaultVersion];
const cApiAsset = defaultRuntime.githubAssets.find((asset) => asset.filename === defaultRuntime.cApi.asset);
add({
  type: 'library',
  name: 'LiteRT-LM C API',
  version: defaultRuntime.cApi.version,
  'bom-ref': `pkg:github/google-ai-edge/LiteRT-LM@${runtimeCompatibility.defaultVersion}?download=${encodeURIComponent(cApiAsset.filename)}`,
  purl: `pkg:github/google-ai-edge/LiteRT-LM@${runtimeCompatibility.defaultVersion}`,
  hashes: [{ alg: 'SHA-256', content: cApiAsset.sha256 }],
  externalReferences: [{ type: 'distribution', url: cApiAsset.url }],
  properties: [
    { name: 'memoji:transport', value: 'in_process' },
    { name: 'memoji:artifactBytes', value: String(cApiAsset.bytes) },
  ],
});

for (const model of Object.values(runtimeCompatibility.modelPresets)) {
  add({
    type: 'machine-learning-model',
    name: model.label,
    version: model.sourceRevision,
    'bom-ref': `memoji:model:${model.id}@${model.sourceRevision}`,
    hashes: [{ alg: 'SHA-256', content: model.sha256 }],
    licenses: [{ license: { id: model.license } }],
    externalReferences: [
      { type: 'website', url: model.source },
      { type: 'distribution', url: model.url },
    ],
    properties: [
      { name: 'memoji:modelId', value: model.id },
      { name: 'memoji:role', value: model.role },
      { name: 'memoji:artifactBytes', value: String(model.bytes) },
      { name: 'memoji:recommendedRamBytes', value: String(model.recommendedRamBytes) },
    ],
  });
}

const document = {
  bomFormat: 'CycloneDX',
  specVersion: '1.5',
  serialNumber: `urn:uuid:${randomUUID()}`,
  version: 1,
  metadata: {
    timestamp: new Date().toISOString(),
    tools: [{ vendor: 'Memoji', name: 'generate-sbom.mjs', version: '2' }],
    component: { type: 'application', name: packageJson.name, version: packageJson.version },
    properties: [
      { name: 'memoji:runtimeTransport', value: 'in_process' },
      { name: 'memoji:runtimeVersion', value: runtimeCompatibility.defaultVersion },
    ],
  },
  components: [...components.values()].sort((a, b) => `${a.type}:${a.name}`.localeCompare(`${b.type}:${b.name}`)),
};

await mkdir(dirname(outputPath), { recursive: true });
await writeFile(outputPath, `${JSON.stringify(document, null, 2)}\n`, 'utf8');
process.stdout.write(`Wrote ${document.components.length} components to ${outputPath}\n`);

function jsonCommand(command, commandArgs) {
  const result = spawnSync(command, commandArgs, { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
  if (!result.stdout?.trim()) throw new Error(`${command} failed: ${result.stderr || result.error}`);
  return JSON.parse(result.stdout);
}

function parseArgs(values) {
  const parsed = {};
  for (let index = 0; index < values.length; index += 1) {
    if (values[index] === '--output' && values[index + 1]) parsed.output = values[++index];
    else if (values[index] === '--help') {
      process.stdout.write('Usage: node scripts/generate-sbom.mjs [--output release/sbom.cdx.json]\n');
      process.exit(0);
    }
  }
  return parsed;
}
