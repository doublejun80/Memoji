#!/usr/bin/env node

import { constants as fsConstants, createReadStream, createWriteStream } from 'node:fs';
import {
  access,
  copyFile,
  cp,
  mkdir,
  mkdtemp,
  readFile,
  rm,
  stat,
  writeFile,
} from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { homedir, tmpdir } from 'node:os';
import { basename, dirname, join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { fileURLToPath } from 'node:url';

const C_API_ASSET = 'litert_lm_c_api-0.1.0.zip';
const SCRIPT_DIRECTORY = dirname(fileURLToPath(import.meta.url));
const COMPATIBILITY_MANIFEST = resolve(
  SCRIPT_DIRECTORY,
  '../src-tauri/resources/local_ai/runtime-compatibility.json',
);

const args = parseArgs(process.argv.slice(2));
if (args.help) {
  process.stdout.write(
    'Usage: node scripts/prepare-vdi-ai-bundle.mjs [options]\n\n' +
    '  --model <path>           Existing official .litertlm model\n' +
    '  --model-preset <e2b|e4b> VDI fast or quality model (default: e2b)\n' +
    '  --download-model         Download the pinned official model\n' +
    '  --output <directory>     Bundle output directory\n' +
    '  --litert-version <ver>   Pinned version (default: manifest default)\n',
  );
  process.exit(0);
}

const outputDirectory = resolve(args.output ?? 'release/memoji-vdi/ai');
const compatibility = JSON.parse(await readFile(COMPATIBILITY_MANIFEST, 'utf8'));
const liteRtVersion = args['litert-version'] ?? compatibility.defaultVersion;
const pinnedRelease = compatibility.versions?.[liteRtVersion];
if (!pinnedRelease || pinnedRelease.role !== 'ga-default') {
  throw new Error(`GA 기본 LiteRT-LM 버전이 아닙니다: ${liteRtVersion}`);
}
if (pinnedRelease.cApi?.transport !== 'in_process') {
  throw new Error(`in-process C API 계약이 없는 LiteRT-LM 버전입니다: ${liteRtVersion}`);
}

const presetKey = String(args['model-preset'] ?? 'e2b').toLowerCase();
const modelPreset = compatibility.modelPresets?.[presetKey];
if (!modelPreset) {
  throw new Error(
    `지원하지 않는 모델 프리셋입니다: ${presetKey}. ` +
    `허용값: ${Object.keys(compatibility.modelPresets ?? {}).join(', ')}`,
  );
}

const cApiArtifact = pinnedRelease.githubAssets?.find(({ filename }) => filename === C_API_ASSET);
if (!cApiArtifact) {
  throw new Error(`${C_API_ASSET} 고정 자산이 runtime manifest에 없습니다.`);
}
const platform = platformContract();
const runtimeDirectory = join(outputDirectory, 'runtime');
const runtimeLibDirectory = join(runtimeDirectory, 'lib');
const runtimePackageDirectory = join(runtimeDirectory, 'packages');
const modelDirectory = join(outputDirectory, 'models', modelPreset.id);
const bundledModelPath = join(modelDirectory, modelPreset.filename);
const stagedArchive = join(runtimePackageDirectory, C_API_ASSET);
const extractionDirectory = await mkdtemp(join(tmpdir(), 'memoji-litert-c-api-'));

await mkdir(runtimePackageDirectory, { recursive: true });
await downloadPinnedArtifact(cApiArtifact, stagedArchive);
try {
  run('tar', ['-xf', stagedArchive, '-C', extractionDirectory]);
  await rm(runtimeLibDirectory, { recursive: true, force: true });
  await mkdir(runtimeLibDirectory, { recursive: true });
  await copyFile(
    join(extractionDirectory, platform.archiveLibrary),
    join(runtimeLibDirectory, platform.outputLibrary),
  );
  await rm(join(runtimeDirectory, 'include'), { recursive: true, force: true });
  await cp(join(extractionDirectory, 'include'), join(runtimeDirectory, 'include'), {
    recursive: true,
    force: true,
  });
  await rm(join(runtimeDirectory, 'licenses'), { recursive: true, force: true });
  await cp(join(extractionDirectory, 'licenses'), join(runtimeDirectory, 'licenses'), {
    recursive: true,
    force: true,
  });
  await copyFile(join(extractionDirectory, 'LICENSE'), join(runtimeDirectory, 'LICENSE'));
} finally {
  await rm(extractionDirectory, { recursive: true, force: true });
}

await mkdir(modelDirectory, { recursive: true });
if (args['download-model']) {
  await downloadPinnedArtifact(modelPreset, bundledModelPath);
} else {
  const modelSource = resolve(
    args.model ?? join(
      homedir(),
      '.litert-lm',
      'models',
      modelPreset.id,
      'model.litertlm',
    ),
  );
  await requireFile(modelSource, `${modelPreset.label} 모델`);
  await copyLargeFile(modelSource, bundledModelPath);
  await verifyPinnedFile(modelPreset, bundledModelPath);
}

const runtimeLibraryPath = join(runtimeLibDirectory, platform.outputLibrary);
const runtimeLibraryStats = await stat(runtimeLibraryPath);
if (runtimeLibraryStats.size < 1_000_000) {
  throw new Error(`LiteRT-LM C API library가 너무 작습니다: ${runtimeLibraryPath}`);
}
const modelStats = await stat(bundledModelPath);
const modelSha256 = await sha256(bundledModelPath);
const runtimeSha256 = await sha256(runtimeLibraryPath);

const manifest = {
  formatVersion: 2,
  createdAt: new Date().toISOString(),
  platform: platform.key,
  liteRtLmVersion: liteRtVersion,
  cApiVersion: pinnedRelease.cApi.version,
  transport: 'in_process',
  model: {
    preset: presetKey,
    id: modelPreset.id,
    file: relativeToBundle(outputDirectory, bundledModelPath),
    bytes: modelStats.size,
    sha256: modelSha256,
    source: modelPreset.source,
    sourceRevision: modelPreset.sourceRevision,
    license: modelPreset.license,
  },
  runtime: {
    library: relativeToBundle(outputDirectory, runtimeLibraryPath),
    bytes: runtimeLibraryStats.size,
    sha256: runtimeSha256,
    archive: {
      file: `runtime/packages/${C_API_ASSET}`,
      bytes: cApiArtifact.bytes,
      sha256: cApiArtifact.sha256,
    },
    headers: 'runtime/include',
    licenses: 'runtime/licenses',
    command: null,
    endpoint: null,
    python: null,
  },
};

await copyFile(COMPATIBILITY_MANIFEST, join(outputDirectory, 'runtime-compatibility.json'));
await writeFile(
  join(outputDirectory, 'bundle-manifest.json'),
  `${JSON.stringify(manifest, null, 2)}\n`,
  'utf8',
);
await writeFile(
  join(outputDirectory, 'NOTICE.txt'),
  [
    `${modelPreset.label} model`,
    'Copyright Google LLC',
    `Licensed under ${modelPreset.license}.`,
    `Source: ${modelPreset.source}`,
    `Revision: ${modelPreset.sourceRevision}`,
    '',
    `LiteRT-LM ${liteRtVersion} C API ${pinnedRelease.cApi.version}`,
    'Copyright The LiteRT-LM Authors',
    'Source: https://github.com/google-ai-edge/LiteRT-LM',
    'Transport: in-process; no localhost server or Python runtime.',
    '',
  ].join('\n'),
  'utf8',
);

process.stdout.write(
  `VDI AI native bundle ready\n` +
  `  output: ${outputDirectory}\n` +
  `  model: ${modelPreset.label} (${modelStats.size} bytes)\n` +
  `  runtime: LiteRT-LM ${liteRtVersion} C API ${pinnedRelease.cApi.version}\n` +
  `  transport: in_process\n`,
);

function platformContract() {
  const key = `${process.platform}-${process.arch}`;
  const contracts = {
    'win32-x64': {
      key,
      archiveLibrary: 'lib/windows_x86_64/bin/litert-lm.dll',
      outputLibrary: 'litert-lm.dll',
    },
    'darwin-arm64': {
      key,
      archiveLibrary: 'lib/macos_arm64/liblitert-lm.dylib',
      outputLibrary: 'liblitert-lm.dylib',
    },
    'linux-x64': {
      key,
      archiveLibrary: 'lib/linux_x86_64/liblitert-lm.so',
      outputLibrary: 'liblitert-lm.so',
    },
    'linux-arm64': {
      key,
      archiveLibrary: 'lib/linux_arm64/liblitert-lm.so',
      outputLibrary: 'liblitert-lm.so',
    },
  };
  const contract = contracts[key];
  if (!contract) throw new Error(`LiteRT-LM C API 미지원 플랫폼입니다: ${key}`);
  return contract;
}

async function downloadPinnedArtifact(artifact, destination) {
  const existing = await stat(destination).catch(() => null);
  if (existing?.size === artifact.bytes && await sha256(destination) === artifact.sha256) return;
  await rm(destination, { force: true });
  await mkdir(dirname(destination), { recursive: true });

  const response = await fetch(artifact.url, { redirect: 'follow' });
  if (!response.ok || !response.body) {
    throw new Error(`고정 자산 다운로드 실패 (${response.status}): ${artifact.url}`);
  }
  await pipeline(Readable.fromWeb(response.body), createWriteStream(destination));
  await verifyPinnedFile(artifact, destination);
}

async function verifyPinnedFile(artifact, path) {
  const fileStats = await stat(path);
  if (fileStats.size !== artifact.bytes) {
    throw new Error(
      `${basename(path)} 크기 불일치: expected ${artifact.bytes}, found ${fileStats.size}`,
    );
  }
  const digest = await sha256(path);
  if (digest !== artifact.sha256) {
    throw new Error(
      `${basename(path)} SHA256 불일치: expected ${artifact.sha256}, found ${digest}`,
    );
  }
}

async function copyLargeFile(source, destination) {
  const sourceStats = await stat(source);
  const destinationStats = await stat(destination).catch(() => null);
  if (destinationStats?.size === sourceStats.size && await sha256(destination) === await sha256(source)) {
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
  for await (const chunk of createReadStream(path)) hash.update(chunk);
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
      `${command} ${commandArgs.join(' ')} 실패\n${result.stdout ?? ''}\n${result.stderr ?? ''}`,
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
