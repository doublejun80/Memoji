#!/usr/bin/env node

import { spawn } from 'node:child_process';
import { access, mkdir, stat } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { tmpdir } from 'node:os';

const args = parseArgs(process.argv.slice(2));
if (args.help) {
  process.stdout.write(`Usage: node scripts/generate-large-workspace-fixture.mjs [options]\n\n` +
    `  --output <path>  Synthetic SQLite output (default: system temp)\n` +
    `  --pages <count>  Page count (default: 10000)\n` +
    `  --force          Replace an existing synthetic fixture\n`);
  process.exit(0);
}

const output = resolve(args.output ?? `${tmpdir()}/memoji-large-workspace-10000.db`);
const pageCount = Math.max(1, Math.min(100_000, Number(args.pages ?? 10_000)));
if (await exists(output)) {
  if (!args.force) throw new Error(`Fixture already exists; choose another path or pass --force: ${output}`);
  const { rm } = await import('node:fs/promises');
  await rm(output);
}
await mkdir(dirname(output), { recursive: true });

const started = performance.now();
const sqlite = spawn('sqlite3', [output], { stdio: ['pipe', 'pipe', 'pipe'] });
let stderr = '';
sqlite.stderr.on('data', (chunk) => { stderr += chunk.toString(); });
sqlite.stdin.write(`PRAGMA journal_mode=WAL;
PRAGMA synchronous=OFF;
PRAGMA foreign_keys=ON;
CREATE TABLE pages (
  id TEXT PRIMARY KEY, title TEXT NOT NULL, content TEXT NOT NULL, tags TEXT NOT NULL,
  project_parent_id TEXT, type TEXT NOT NULL, updated_at TEXT NOT NULL, revision INTEGER NOT NULL
);
CREATE TABLE links (
  source_page_id TEXT NOT NULL, target_page_id TEXT, target_title TEXT NOT NULL,
  target_anchor TEXT, source_start INTEGER NOT NULL, source_end INTEGER NOT NULL
);
CREATE TABLE tasks (
  id TEXT PRIMARY KEY, page_id TEXT NOT NULL, text TEXT NOT NULL, completed INTEGER NOT NULL,
  due_date TEXT, priority INTEGER, source_start INTEGER NOT NULL, source_end INTEGER NOT NULL
);
CREATE VIRTUAL TABLE page_fts USING fts5(
  page_id UNINDEXED, title, tags, body, tokenize='unicode61 remove_diacritics 0'
);
BEGIN IMMEDIATE;
`);

for (let index = 0; index < pageCount; index += 1) {
  const id = `synthetic-page-${String(index).padStart(5, '0')}`;
  const project = `synthetic-project-${index % 200}`;
  const title = `합성 업무 문서 ${index} ${index % 97 === 0 ? '희소검색어' : ''}`.trim();
  const tags = JSON.stringify([`부문-${index % 12}`, `상태-${index % 5}`, '합성데이터']);
  const bodySize = 240 + ((index * 37) % 2_400);
  const body = makeBody(index, bodySize);
  const updatedAt = `2026-08-${String((index % 16) + 1).padStart(2, '0')}T${String(index % 24).padStart(2, '0')}:00:00Z`;
  const dueDate = `2026-08-${String((index % 28) + 1).padStart(2, '0')}`;
  sqlite.stdin.write(`INSERT INTO pages VALUES (${q(id)},${q(title)},${q(body)},${q(tags)},${q(project)},'page',${q(updatedAt)},1);
INSERT INTO page_fts VALUES (${q(id)},${q(title)},${q(tags)},${q(body)});
INSERT INTO tasks VALUES (${q(`synthetic-task-${index}`)},${q(id)},${q(`합성 작업 ${index}`)},${index % 4 === 0 ? 1 : 0},${q(dueDate)},${(index % 3) + 1},0,16);
`);
  if (index > 0 && index % 7 === 0) {
    const target = `synthetic-page-${String(index - 1).padStart(5, '0')}`;
    sqlite.stdin.write(`INSERT INTO links VALUES (${q(id)},${q(target)},${q(`합성 업무 문서 ${index - 1}`)},'개요',0,12);
`);
  }
}
sqlite.stdin.end('COMMIT; PRAGMA optimize;\n');

const exitCode = await new Promise((resolveExit, reject) => {
  sqlite.once('error', reject);
  sqlite.once('exit', resolveExit);
});
if (exitCode !== 0) throw new Error(`sqlite3 fixture generation failed (${exitCode}): ${stderr}`);
const file = await stat(output);
process.stdout.write(`${JSON.stringify({
  schemaVersion: 1,
  syntheticOnly: true,
  output,
  pages: pageCount,
  tasks: pageCount,
  links: Math.floor((pageCount - 1) / 7),
  bytes: file.size,
  durationMs: Number((performance.now() - started).toFixed(2)),
}, null, 2)}\n`);

function makeBody(index, size) {
  const rare = index % 97 === 0 ? ' 희소검색어 출시 준비 근거.' : '';
  const base = `# 개요\n합성 데이터 ${index}.${rare}\n## 결정\n로컬 우선 업무 기록과 연결 지식을 검증합니다.\n- [ ] 후속 작업 @due(2026-08-${String((index % 28) + 1).padStart(2, '0')}) !p${(index % 3) + 1}\n`;
  return `${base}${'VDI 성능 측정을 위한 반복 본문입니다. '.repeat(Math.ceil(size / 24))}`.slice(0, size);
}

function q(value) {
  return `'${String(value).replaceAll("'", "''")}'`;
}

async function exists(path) {
  try {
    await access(path);
    return true;
  } catch {
    return false;
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
