import { statSync } from 'node:fs';
import { resolve } from 'node:path';

function argument(name) {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

const bundle = resolve(argument('--bundle') ?? 'release/memoji-vdi');
const requiredFiles = [
  'Memoji.exe',
  'Start-Memoji-VDI.cmd',
  'ai/runtime/lib/litert-lm.dll',
  'ai/models/gemma4-e2b/gemma-4-E2B-it.litertlm',
  'webview2/MicrosoftEdgeWebView2RuntimeInstallerX64.exe',
];

const missing = [];
for (const relativePath of requiredFiles) {
  try {
    if (!statSync(resolve(bundle, relativePath)).isFile()) {
      missing.push(relativePath);
    }
  } catch {
    missing.push(relativePath);
  }
}

if (missing.length > 0) {
  process.stderr.write(`Windows VDI launch contract failed; missing: ${missing.join(', ')}\n`);
  process.exit(1);
}

process.stdout.write(`Windows VDI launch contract verified: ${bundle}\n`);
