#!/usr/bin/env node

import { access, readdir, stat, writeFile, mkdir } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { tmpdir } from 'node:os';

const args = parseArgs(process.argv.slice(2));
if (args.help) {
  process.stdout.write(`Usage: node scripts/measure-search.mjs [options]\n\n` +
    `  --db <path>      Synthetic fixture DB (default: system temp)\n` +
    `  --output <path>  Write JSON report\n` +
    `  --samples <n>    Warm search samples (default: 40)\n`);
  process.exit(0);
}

const databasePath = resolve(args.db ?? `${tmpdir()}/memoji-large-workspace-10000.db`);
await access(databasePath).catch(() => {
  throw new Error(`Fixture not found. Run scripts/generate-large-workspace-fixture.mjs first: ${databasePath}`);
});
const sampleCount = Math.max(5, Math.min(500, Number(args.samples ?? 40)));
const { DatabaseSync } = await import('node:sqlite');
const openSamples = [];
for (let index = 0; index < sampleCount; index += 1) {
  const started = performance.now();
  const sampledDatabase = new DatabaseSync(databasePath, { readOnly: true });
  sampledDatabase.prepare('SELECT 1').get();
  sampledDatabase.close();
  openSamples.push(performance.now() - started);
}
openSamples.sort((left, right) => left - right);

const database = new DatabaseSync(databasePath, { readOnly: true });
const pageCount = Number(database.prepare('SELECT COUNT(*) AS count FROM pages').get()?.count ?? 0);
const sampledPage = database.prepare(
  'SELECT id FROM pages ORDER BY id LIMIT 1 OFFSET ?'
).get(Math.floor(pageCount / 2));
if (!sampledPage?.id) throw new Error('Synthetic fixture has no pages');

const listStatement = database.prepare(
  'SELECT id,title,tags,updated_at,revision FROM pages ORDER BY updated_at DESC LIMIT 200'
);
const bodyStatement = database.prepare(
  'SELECT content,revision FROM pages WHERE id=?'
);
const searchStatement = database.prepare(
  `SELECT page_id, snippet(page_fts, 3, '[', ']', ' … ', 18) AS snippet
   FROM page_fts WHERE page_fts MATCH ? ORDER BY bm25(page_fts, 0.0, 8.0, 5.0, 1.0) LIMIT 30`
);
listStatement.all();
bodyStatement.get(sampledPage.id);
searchStatement.all('"희소검색어"*');
const listSamples = sampleOperation(sampleCount, () => listStatement.all());
const bodySamples = sampleOperation(sampleCount, () => bodyStatement.get(sampledPage.id));
const searchSamples = [];
for (let index = 0; index < sampleCount; index += 1) {
  const started = performance.now();
  const rows = searchStatement.all('"희소검색어"*');
  if (rows.length === 0) throw new Error('Synthetic sparse query returned no rows');
  searchSamples.push(performance.now() - started);
}
searchSamples.sort((left, right) => left - right);
database.close();

const bundle = await bundleMetrics(resolve('dist'));
const report = {
  schemaVersion: 1,
  capturedAt: new Date().toISOString(),
  environment: {
    platform: process.platform,
    arch: process.arch,
    node: process.version,
    windowsVdi: process.platform === 'win32' && args.vdi === true,
  },
  fixture: {
    path: databasePath,
    syntheticOnly: true,
    bytes: (await stat(databasePath)).size,
  },
  measurements: {
    databaseOpenP50Ms: round(percentile(openSamples, 0.50)),
    databaseOpenP95Ms: round(percentile(openSamples, 0.95)),
    pageList200P50Ms: round(percentile(listSamples.durations, 0.50)),
    pageList200P95Ms: round(percentile(listSamples.durations, 0.95)),
    pageListRows: listSamples.lastValue.length,
    bodyOpenP50Ms: round(percentile(bodySamples.durations, 0.50)),
    bodyOpenP95Ms: round(percentile(bodySamples.durations, 0.95)),
    bodyChars: String(bodySamples.lastValue?.content ?? '').length,
    searchSamples: sampleCount,
    searchP50Ms: round(percentile(searchSamples, 0.50)),
    searchP95Ms: round(percentile(searchSamples, 0.95)),
    processRssMb: round(process.memoryUsage().rss / 1_048_576),
    bundle,
  },
  limitations: [
    'The fixture is synthetic and contains no production data.',
    'SQLite timings are local Node process measurements, not end-to-end Tauri UI timings.',
    ...(process.platform === 'win32' && args.vdi === true
      ? []
      : ['This host is not the target Windows VDI.']),
  ],
};
const rendered = `${JSON.stringify(report, null, 2)}\n`;
if (args.output) {
  const output = resolve(args.output);
  await mkdir(dirname(output), { recursive: true });
  await writeFile(output, rendered, 'utf8');
}
process.stdout.write(rendered);

function sampleOperation(count, operation) {
  const durations = [];
  let lastValue;
  for (let index = 0; index < count; index += 1) {
    const started = performance.now();
    lastValue = operation();
    durations.push(performance.now() - started);
  }
  durations.sort((left, right) => left - right);
  return { durations, lastValue };
}

function percentile(sorted, quantile) {
  return sorted[Math.min(sorted.length - 1, Math.ceil(sorted.length * quantile) - 1)];
}

async function bundleMetrics(directory) {
  try {
    const assets = resolve(directory, 'assets');
    const files = await readdir(assets);
    const javascript = [];
    for (const file of files.filter((name) => name.endsWith('.js'))) {
      javascript.push({ file, bytes: (await stat(resolve(assets, file))).size });
    }
    javascript.sort((left, right) => right.bytes - left.bytes);
    return {
      javascriptBytes: javascript.reduce((sum, item) => sum + item.bytes, 0),
      largestChunks: javascript.slice(0, 8),
    };
  } catch {
    return null;
  }
}

function round(value) {
  return Number(value.toFixed(2));
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
