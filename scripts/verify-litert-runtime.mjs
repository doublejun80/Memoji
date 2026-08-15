#!/usr/bin/env node

import { spawn, spawnSync } from 'node:child_process';
import { createServer } from 'node:net';
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';

const args = parseArgs(process.argv.slice(2));
if (args.help) {
  process.stdout.write(`Usage: node scripts/verify-litert-runtime.mjs [options]\n\n` +
    `  --runtime <path>   LiteRT-LM executable (default: litert-lm)\n` +
    `  --model <id>       Registered model id for API tests\n` +
    `  --output <path>    Write JSON evidence\n` +
    `  --strict           Return non-zero when any required gate is blocked\n`);
  process.exit(0);
}

const runtime = args.runtime ?? 'litert-lm';
const report = {
  schemaVersion: 1,
  capturedAt: new Date().toISOString(),
  environment: {
    platform: process.platform,
    arch: process.arch,
    windowsVdi: process.platform === 'win32' && args.vdi === true,
  },
  runtime,
  model: args.model ?? null,
  status: 'running',
  snapshots: {},
  gates: {},
  limitations: [],
};

for (const [name, commandArgs] of [
  ['version', ['--version']],
  ['help', ['--help']],
  ['serveHelp', ['serve', '--help']],
]) {
  const result = spawnSync(runtime, commandArgs, { encoding: 'utf8' });
  report.snapshots[name] = {
    exitCode: result.status,
    stdout: result.stdout?.trim() ?? '',
    stderr: result.stderr?.trim() ?? '',
    error: result.error?.message ?? null,
  };
}

if (report.snapshots.version.error) {
  report.status = 'blocked';
  report.limitations.push('LiteRT-LM executable is unavailable in this environment.');
  await finish(report, args);
  process.exit(process.exitCode ?? 0);
}

const serveHelp = report.snapshots.serveHelp.stdout;
for (const option of ['--host', '--port']) {
  report.gates[`serveOption:${option}`] = serveHelp.includes(option);
}
report.gates.loopbackBindingSupported = report.gates['serveOption:--host'];
report.gates.sessionAuthSupported = /--api-key|--auth-token/.test(serveHelp);

if (!args.model) {
  report.status = 'blocked';
  report.limitations.push('No registered model id was provided; model/API/benchmark gates were not run.');
  await finish(report, args);
  process.exit(process.exitCode ?? 0);
}

const cycleResults = [];
for (let cycle = 1; cycle <= 3; cycle += 1) {
  const port = await freePort();
  const startedAt = performance.now();
  const child = startRuntime(runtime, port);
  try {
    const models = await waitForModels(port, 60_000);
    const ids = (models.data ?? []).map((model) => model.id);
    const readyMs = Math.round(performance.now() - startedAt);
    const cycleResult = { cycle, port, readyMs, modelIds: ids };
    if (!ids.includes(args.model)) {
      throw new Error(`Configured model is absent from /v1/models: ${args.model}`);
    }
    if (cycle === 1) {
      Object.assign(cycleResult, await runProtocolGates(port, args.model, runtime));
    }
    cycleResults.push(cycleResult);
  } finally {
    await stopRuntime(child);
  }
}

report.gates.threeLoadCycles = cycleResults;
report.gates.restart = cycleResults.length === 3;
report.gates.models = cycleResults.every((cycle) => cycle.modelIds.includes(args.model));
report.status = Object.values(report.gates).some((value) => value === false)
  ? 'failed'
  : 'passed-non-vdi';
if (!report.environment.windowsVdi) {
  report.limitations.push('This run is not Windows VDI validation and cannot satisfy the GA upgrade gate.');
}
await finish(report, args);

async function runProtocolGates(port, model, runtimeCommand) {
  const korean = await chat(port, model, '한글로 한 문장만 답하세요.', 64);
  const context2k = await chat(port, model, `요약하세요: ${'가'.repeat(2_048)}`, 16);
  const context4k = await chat(port, model, `요약하세요: ${'나'.repeat(4_096)}`, 16);
  const cancellation = await cancellationGate(port, model);
  const missingModel = await fetch(`http://127.0.0.1:${port}/v1/chat/completions`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ model: '__memoji_missing_model__', messages: [{ role: 'user', content: 'test' }] }),
  });
  const collision = startRuntime(runtimeCommand, port);
  const collisionExit = await waitForExit(collision, 3_000);
  if (collisionExit === null) await stopRuntime(collision);
  return {
    koreanUtf8: korean.ok && /[가-힣]/.test(korean.text),
    context2k: context2k.ok,
    context4k: context4k.ok,
    cancellation,
    missingModelRejected: !missingModel.ok,
    portCollisionRejected: collisionExit !== null && collisionExit !== 0,
  };
}

function startRuntime(command, port) {
  return spawn(command, ['serve', '--host', '127.0.0.1', '--port', String(port)], {
    stdio: ['ignore', 'pipe', 'pipe'],
    env: { ...process.env },
  });
}

async function waitForModels(port, timeoutMs) {
  const deadline = Date.now() + timeoutMs;
  let lastError;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(`http://127.0.0.1:${port}/v1/models`);
      if (response.ok) return response.json();
      lastError = new Error(`models returned HTTP ${response.status}`);
    } catch (error) {
      lastError = error;
    }
    await new Promise((resolveDelay) => setTimeout(resolveDelay, 250));
  }
  throw new Error(`LiteRT-LM did not become ready: ${String(lastError)}`);
}

async function chat(port, model, prompt, maxTokens) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 60_000);
  try {
    const response = await fetch(`http://127.0.0.1:${port}/v1/chat/completions`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      signal: controller.signal,
      body: JSON.stringify({
        model,
        stream: true,
        max_tokens: maxTokens,
        messages: [{ role: 'user', content: prompt }],
      }),
    });
    const text = await response.text();
    return { ok: response.ok, text };
  } finally {
    clearTimeout(timeout);
  }
}

async function cancellationGate(port, model) {
  const controller = new AbortController();
  const request = fetch(`http://127.0.0.1:${port}/v1/chat/completions`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    signal: controller.signal,
    body: JSON.stringify({
      model,
      stream: true,
      max_tokens: 512,
      messages: [{ role: 'user', content: '긴 글을 작성하세요.' }],
    }),
  });
  setTimeout(() => controller.abort(), 100);
  try {
    await request;
    return false;
  } catch (error) {
    return error?.name === 'AbortError';
  }
}

function freePort() {
  return new Promise((resolvePort, reject) => {
    const server = createServer();
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const address = server.address();
      const port = typeof address === 'object' && address ? address.port : 0;
      server.close(() => resolvePort(port));
    });
  });
}

function waitForExit(child, timeoutMs) {
  return new Promise((resolveExit) => {
    const timer = setTimeout(() => resolveExit(null), timeoutMs);
    child.once('exit', (code) => {
      clearTimeout(timer);
      resolveExit(code);
    });
  });
}

async function stopRuntime(child) {
  if (child.exitCode !== null) return;
  child.kill('SIGTERM');
  const exitCode = await waitForExit(child, 5_000);
  if (exitCode === null) child.kill('SIGKILL');
}

async function finish(value, parsedArgs) {
  const rendered = `${JSON.stringify(value, null, 2)}\n`;
  if (parsedArgs.output) {
    const output = resolve(parsedArgs.output);
    await mkdir(dirname(output), { recursive: true });
    await writeFile(output, rendered, 'utf8');
  }
  process.stdout.write(rendered);
  if (parsedArgs.strict && value.status !== 'passed-non-vdi' && value.status !== 'passed-vdi') {
    process.exitCode = 2;
  }
}

function parseArgs(values) {
  const parsed = {};
  for (let index = 0; index < values.length; index += 1) {
    const token = values[index];
    if (!token.startsWith('--')) continue;
    const key = token.slice(2);
    const value = values[index + 1];
    if (!value || value.startsWith('--')) parsed[key] = true;
    else {
      parsed[key] = value;
      index += 1;
    }
  }
  return parsed;
}
