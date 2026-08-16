#!/usr/bin/env node

import { spawnSync } from 'node:child_process';

const args = process.argv.slice(2);
if (args.includes('--help')) {
  process.stdout.write(
    'Usage: node scripts/benchmark-local-ai.mjs --bundle <dir> [matrix options]\n\n' +
    'Runs the native in-process LiteRT-LM 0.16 benchmark binary.\n' +
    'Options: --model, --threads, --prompt-chars, --output-tokens, --output\n',
  );
  process.exit(0);
}

const result = spawnSync('cargo', [
  'run',
  '--release',
  '--manifest-path', 'src-tauri/Cargo.toml',
  '--bin', 'memoji-vdi-benchmark',
  '--',
  ...args,
], { stdio: 'inherit', env: process.env });

if (result.error) throw result.error;
process.exit(result.status ?? 1);
