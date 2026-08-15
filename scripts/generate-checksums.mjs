#!/usr/bin/env node

import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";
import { mkdir, readdir, stat, writeFile } from "node:fs/promises";
import path from "node:path";

function usage() {
  console.log(`Usage: node scripts/generate-checksums.mjs [options]

Generate a deterministic SHA256SUMS file for every regular file below a directory.

Options:
  --input <directory>   Directory to scan (default: release)
  --output <file>       Output file (default: <input>/SHA256SUMS)
  --help                Show this help text`);
}

function parseArgs(argv) {
  const args = { input: "release", output: undefined };
  for (let index = 0; index < argv.length; index += 1) {
    const value = argv[index];
    if (value === "--help") {
      usage();
      process.exit(0);
    }
    if (value === "--input" || value === "--output") {
      const next = argv[index + 1];
      if (!next) throw new Error(`${value} requires a value`);
      args[value.slice(2)] = next;
      index += 1;
      continue;
    }
    throw new Error(`Unknown argument: ${value}`);
  }
  return args;
}

async function walk(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const fullPath = path.join(directory, entry.name);
    if (entry.isDirectory()) files.push(...(await walk(fullPath)));
    else if (entry.isFile()) files.push(fullPath);
  }
  return files;
}

async function sha256(filePath) {
  const hash = createHash("sha256");
  await new Promise((resolve, reject) => {
    const stream = createReadStream(filePath);
    stream.on("data", (chunk) => hash.update(chunk));
    stream.on("error", reject);
    stream.on("end", resolve);
  });
  return hash.digest("hex");
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const input = path.resolve(args.input);
  const output = path.resolve(args.output ?? path.join(input, "SHA256SUMS"));
  const inputStats = await stat(input);
  if (!inputStats.isDirectory()) throw new Error(`Input is not a directory: ${input}`);

  const files = (await walk(input))
    .map((file) => path.resolve(file))
    .filter((file) => file !== output)
    .sort((left, right) => left.localeCompare(right, "en"));
  if (files.length === 0) throw new Error(`No files found below: ${input}`);

  const lines = [];
  for (const file of files) {
    const relative = path.relative(input, file).split(path.sep).join("/");
    lines.push(`${await sha256(file)}  ${relative}`);
  }
  await mkdir(path.dirname(output), { recursive: true });
  await writeFile(output, `${lines.join("\n")}\n`, "utf8");
  console.log(`Wrote ${files.length} checksums to ${output}`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
