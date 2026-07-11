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

const DEFAULT_LITERT_VERSION = '0.13.1';
const MODEL_ID = 'gemma4-e2b';
const MODEL_FILE = 'model.litertlm';

const args = parseArgs(process.argv.slice(2));
const outputDirectory = resolve(args.output ?? 'release/memoji-vdi/ai');
const modelSource = resolve(
  args.model ?? join(homedir(), '.litert-lm', 'models', MODEL_ID, MODEL_FILE)
);
const liteRtVersion = args['litert-version'] ?? DEFAULT_LITERT_VERSION;

await requireFile(modelSource, 'Gemma LiteRT-LM 모델');
const modelStats = await stat(modelSource);
if (modelStats.size < 1_000_000_000) {
  throw new Error(`모델 파일이 너무 작습니다: ${modelSource} (${modelStats.size} bytes)`);
}

const runtimeDirectory = join(outputDirectory, 'runtime');
const pythonDirectory = join(runtimeDirectory, 'python');
const sitePackagesDirectory = join(runtimeDirectory, 'site-packages');
const registryDirectory = join(outputDirectory, 'registry');
const bundledModelPath = join(registryDirectory, 'models', MODEL_ID, MODEL_FILE);

await mkdir(outputDirectory, { recursive: true });
await preparePythonRuntime(pythonDirectory, sitePackagesDirectory, liteRtVersion);
await mkdir(dirname(bundledModelPath), { recursive: true });
await copyLargeFile(modelSource, bundledModelPath);

const modelSha256 = await sha256(bundledModelPath);
const pythonExecutable = bundledPythonExecutable(pythonDirectory);
verifyBundledRuntime(pythonExecutable, pythonDirectory, sitePackagesDirectory);

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
  },
};

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

async function preparePythonRuntime(pythonTarget, sitePackagesTarget, version) {
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
  await mkdir(dirname(pythonTarget), { recursive: true });
  await cp(pythonRoot, pythonTarget, {
    recursive: true,
    dereference: true,
    force: true,
    filter: (source) => basename(source) !== '.DS_Store',
  });
  await mkdir(sitePackagesTarget, { recursive: true });

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
    `litert-lm==${version}`,
  ]);
}

function verifyBundledRuntime(pythonExecutable, pythonHome, pythonPath) {
  const result = spawnSync(
    pythonExecutable,
    ['-c', 'import litert_lm, litert_lm_cli; print("ok")'],
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
