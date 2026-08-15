#!/usr/bin/env node

import { constants as fsConstants } from 'node:fs';
import {
  access,
  copyFile,
  cp,
  mkdir,
  readFile,
  rm,
  stat,
  writeFile,
} from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { homedir } from 'node:os';
import { basename, dirname, join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const MODEL_ID = 'gemma4-e2b';
const MODEL_FILE = 'model.litertlm';
const SCRIPT_DIRECTORY = dirname(fileURLToPath(import.meta.url));
const COMPATIBILITY_MANIFEST = resolve(
  SCRIPT_DIRECTORY,
  '../src-tauri/resources/local_ai/runtime-compatibility.json'
);

const args = parseArgs(process.argv.slice(2));
if (args.help) {
  process.stdout.write(`Usage: node scripts/prepare-vdi-ai-bundle.mjs [options]\n\n` +
    `  --model <path>           Source model.litertlm\n` +
    `  --output <directory>     Bundle output directory\n` +
    `  --litert-version <ver>   Pinned version from runtime-compatibility.json\n`);
  process.exit(0);
}
const outputDirectory = resolve(args.output ?? 'release/memoji-vdi/ai');
const compatibility = JSON.parse(await readFile(COMPATIBILITY_MANIFEST, 'utf8'));
const modelSource = resolve(
  args.model ?? join(homedir(), '.litert-lm', 'models', MODEL_ID, MODEL_FILE)
);
const liteRtVersion = args['litert-version'] ?? compatibility.defaultVersion;
const pinnedRelease = compatibility.versions?.[liteRtVersion];
if (!pinnedRelease) {
  throw new Error(
    `검증되지 않은 LiteRT-LM 버전입니다: ${liteRtVersion}. ` +
    `허용 버전: ${Object.keys(compatibility.versions ?? {}).join(', ')}`
  );
}
const platformKey = `${process.platform}-${process.arch}`;
const apiPackage = pinnedRelease.packages?.api?.[platformKey];
if (!apiPackage) {
  throw new Error(`고정된 LiteRT-LM API 자산이 없는 플랫폼입니다: ${platformKey}`);
}

await requireFile(modelSource, 'Gemma LiteRT-LM 모델');
const modelStats = await stat(modelSource);
if (modelStats.size < 1_000_000_000) {
  throw new Error(`모델 파일이 너무 작습니다: ${modelSource} (${modelStats.size} bytes)`);
}

const runtimeDirectory = join(outputDirectory, 'runtime');
const pythonDirectory = join(runtimeDirectory, 'python');
const sitePackagesDirectory = join(runtimeDirectory, 'site-packages');
const runtimePackagesDirectory = join(runtimeDirectory, 'packages');
const registryDirectory = join(outputDirectory, 'registry');
const bundledModelPath = join(registryDirectory, 'models', MODEL_ID, MODEL_FILE);

await mkdir(outputDirectory, { recursive: true });
const runtimePackages = [
  pinnedRelease.packages.cli,
  pinnedRelease.packages.builder,
  apiPackage,
];
await preparePythonRuntime(
  pythonDirectory,
  sitePackagesDirectory,
  runtimePackagesDirectory,
  runtimePackages
);
await mkdir(dirname(bundledModelPath), { recursive: true });
await copyLargeFile(modelSource, bundledModelPath);

const modelSha256 = await sha256(bundledModelPath);
const pythonExecutable = bundledPythonExecutable(pythonDirectory);
verifyBundledRuntime(
  pythonExecutable,
  pythonDirectory,
  sitePackagesDirectory,
  liteRtVersion
);

const manifest = {
  formatVersion: 1,
  createdAt: new Date().toISOString(),
  platform: `${process.platform}-${process.arch}`,
  liteRtLmVersion: liteRtVersion,
  model: {
    id: MODEL_ID,
    file: `registry/models/${MODEL_ID}/${MODEL_FILE}`,
    bytes: modelStats.size,
    sha256: modelSha256,
    source: 'litert-community/gemma-4-E2B-it-litert-lm',
    license: 'Apache-2.0',
  },
  runtime: {
    python: relativeToBundle(outputDirectory, pythonExecutable),
    pythonPath: 'runtime/site-packages',
    command: 'python -m litert_lm_cli.main serve --host 127.0.0.1 --port 9379',
    compatibilityManifest: 'runtime-compatibility.json',
    packages: runtimePackages.map(({ filename, bytes, sha256 }) => ({
      filename: `runtime/packages/${filename}`,
      bytes,
      sha256,
    })),
  },
};

await copyFile(
  COMPATIBILITY_MANIFEST,
  join(outputDirectory, 'runtime-compatibility.json')
);

await writeFile(
  join(outputDirectory, 'bundle-manifest.json'),
  `${JSON.stringify(manifest, null, 2)}\n`,
  'utf8'
);
await writeFile(
  join(outputDirectory, 'NOTICE.txt'),
  [
    'Gemma 4 E2B model',
    'Copyright Google LLC',
    'Licensed under the Apache License, Version 2.0.',
    'https://www.apache.org/licenses/LICENSE-2.0',
    'Source: https://huggingface.co/litert-community/gemma-4-E2B-it-litert-lm',
    '',
    'LiteRT-LM runtime',
    'Copyright The LiteRT-LM Authors',
    'Source: https://github.com/google-ai-edge/LiteRT-LM',
    '',
  ].join('\n'),
  'utf8'
);

process.stdout.write(
  `VDI AI bundle ready\n` +
    `  output: ${outputDirectory}\n` +
    `  model: ${bundledModelPath}\n` +
    `  sha256: ${modelSha256}\n` +
    `  runtime: LiteRT-LM ${liteRtVersion}\n`
);

async function preparePythonRuntime(
  pythonTarget,
  sitePackagesTarget,
  packageTarget,
  packages
) {
  run('uv', ['python', 'install', '3.12']);
  const pythonExecutable = run('uv', [
    'python',
    'find',
    '--managed-python',
    '--resolve-links',
    '3.12',
  ]).stdout.trim();

  if (!pythonExecutable) {
    throw new Error('uv가 관리형 Python 3.12 경로를 반환하지 않았습니다.');
  }

  const pythonRoot = basename(dirname(pythonExecutable)).toLowerCase() === 'bin'
    ? dirname(dirname(pythonExecutable))
    : dirname(pythonExecutable);

  await rm(pythonTarget, { recursive: true, force: true });
  await rm(sitePackagesTarget, { recursive: true, force: true });
  await rm(packageTarget, { recursive: true, force: true });
  await mkdir(dirname(pythonTarget), { recursive: true });
  await cp(pythonRoot, pythonTarget, {
    recursive: true,
    dereference: true,
    force: true,
    filter: (source) => basename(source) !== '.DS_Store',
  });
  await mkdir(sitePackagesTarget, { recursive: true });
  await mkdir(packageTarget, { recursive: true });

  const packagePaths = [];
  for (const artifact of packages) {
    const packagePath = join(packageTarget, artifact.filename);
    await downloadPinnedArtifact(artifact, packagePath);
    packagePaths.push(packagePath);
  }

  run('uv', [
    'pip',
    'install',
    '--python',
    pythonExecutable,
    '--target',
    sitePackagesTarget,
    '--link-mode',
    'copy',
    '--compile-bytecode',
    ...packagePaths,
  ]);
}

function verifyBundledRuntime(pythonExecutable, pythonHome, pythonPath, version) {
  const result = spawnSync(
    pythonExecutable,
    [
      '-c',
      `import importlib.metadata, litert_lm, litert_lm_cli; ` +
      `assert importlib.metadata.version("litert-lm") == "${version}"; print("ok")`,
    ],
    {
      encoding: 'utf8',
      env: {
        ...process.env,
        PYTHONHOME: pythonHome,
        PYTHONPATH: pythonPath,
      },
    }
  );

  if (result.status !== 0 || result.stdout.trim() !== 'ok') {
    throw new Error(
      `복사된 LiteRT 런타임 검증 실패\n${result.stdout ?? ''}\n${result.stderr ?? ''}`
    );
  }
}

async function downloadPinnedArtifact(artifact, destination) {
  const existing = await stat(destination).catch(() => null);
  if (existing?.size === artifact.bytes) {
    const existingHash = await sha256(destination);
    if (existingHash === artifact.sha256) return;
  }

  const response = await fetch(artifact.url, { redirect: 'follow' });
  if (!response.ok) {
    throw new Error(`고정 자산 다운로드 실패 (${response.status}): ${artifact.url}`);
  }
  const bytes = new Uint8Array(await response.arrayBuffer());
  if (bytes.byteLength !== artifact.bytes) {
    throw new Error(
      `${artifact.filename} 크기 불일치: expected ${artifact.bytes}, found ${bytes.byteLength}`
    );
  }
  await writeFile(destination, bytes);
  const digest = await sha256(destination);
  if (digest !== artifact.sha256) {
    await rm(destination, { force: true });
    throw new Error(
      `${artifact.filename} SHA256 불일치: expected ${artifact.sha256}, found ${digest}`
    );
  }
}

function bundledPythonExecutable(pythonRoot) {
  return process.platform === 'win32'
    ? join(pythonRoot, 'python.exe')
    : join(pythonRoot, 'bin', 'python3');
}

async function copyLargeFile(source, destination) {
  const destinationStats = await stat(destination).catch(() => null);
  const sourceStats = await stat(source);
  if (destinationStats?.size === sourceStats.size) {
    process.stdout.write(`Model already staged (${sourceStats.size} bytes); keeping existing copy.\n`);
    return;
  }

  await rm(destination, { force: true });
  try {
    await copyFile(source, destination, fsConstants.COPYFILE_FICLONE);
  } catch {
    await copyFile(source, destination);
  }
}

async function sha256(path) {
  const hash = createHash('sha256');
  for await (const chunk of createReadStream(path)) {
    hash.update(chunk);
  }
  return hash.digest('hex');
}

async function requireFile(path, label) {
  try {
    await access(path, fsConstants.R_OK);
  } catch {
    throw new Error(`${label}을 찾을 수 없습니다: ${path}`);
  }
}

function run(command, commandArgs) {
  const result = spawnSync(command, commandArgs, {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  if (result.status !== 0) {
    throw new Error(
      `${command} ${commandArgs.join(' ')} 실패\n${result.stdout ?? ''}\n${result.stderr ?? ''}`
    );
  }
  return result;
}

function parseArgs(values) {
  const parsed = {};
  for (let index = 0; index < values.length; index += 1) {
    const token = values[index];
    if (!token.startsWith('--')) continue;
    const key = token.slice(2);
    const value = values[index + 1];
    if (!value || value.startsWith('--')) {
      parsed[key] = true;
      continue;
    }
    parsed[key] = value;
    index += 1;
  }
  return parsed;
}

function relativeToBundle(root, path) {
  return path.slice(root.length + 1).split('\\').join('/');
}
