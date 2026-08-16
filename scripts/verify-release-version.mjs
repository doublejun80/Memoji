#!/usr/bin/env node

import { readFile } from "node:fs/promises";

function usage() {
  console.log(`Usage: node scripts/verify-release-version.mjs [--tag vX.Y.Z]

Checks that package.json, tauri.conf.json, and src-tauri/Cargo.toml use one version.`);
}

const args = process.argv.slice(2);
if (args.includes("--help")) {
  usage();
  process.exit(0);
}
const tagIndex = args.indexOf("--tag");
const tag = tagIndex >= 0 ? args[tagIndex + 1] : undefined;
if (tagIndex >= 0 && !tag) throw new Error("--tag requires a value");

const packageJson = JSON.parse(await readFile("package.json", "utf8"));
const tauriConfig = JSON.parse(await readFile("src-tauri/tauri.conf.json", "utf8"));
const cargoToml = await readFile("src-tauri/Cargo.toml", "utf8");
const cargoVersion = cargoToml.match(/^version\s*=\s*"([^"]+)"/m)?.[1];
const versions = {
  "package.json": packageJson.version,
  "src-tauri/tauri.conf.json": tauriConfig.version,
  "src-tauri/Cargo.toml": cargoVersion,
};
const unique = new Set(Object.values(versions));
if (unique.size !== 1 || unique.has(undefined)) {
  throw new Error(`Version mismatch: ${JSON.stringify(versions)}`);
}
const version = packageJson.version;
if (tag) {
  const matched = /^v(\d+\.\d+\.\d+)(-rc\.\d+)?$/.exec(tag);
  if (!matched || matched[1] !== version) {
    throw new Error(`Tag ${tag} does not match application version v${version}`);
  }
}
console.log(`Verified Memoji version ${version}${tag ? ` against ${tag}` : ""}.`);
