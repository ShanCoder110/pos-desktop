#!/usr/bin/env node
/**
 * Regenerate ts-rs bindings, then optionally assert zero git diff.
 * Usage:
 *   node scripts/generate-types.mjs
 *   node scripts/generate-types.mjs --check
 */
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import path from "node:path";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const check = process.argv.includes("--check");

function run(command, args, opts = {}) {
  const result = spawnSync(command, args, {
    cwd: root,
    stdio: "inherit",
    shell: process.platform === "win32",
    ...opts,
  });
  if (result.status !== 0) process.exit(result.status ?? 1);
}

run("node", [
  "scripts/run-cargo.mjs",
  "run",
  "--manifest-path",
  "src-tauri/Cargo.toml",
  "--bin",
  "export_types",
]);

if (check) {
  const diff = spawnSync(
    "git",
    ["diff", "--exit-code", "--", "src/types/generated"],
    { cwd: root, stdio: "inherit" },
  );
  if (diff.status !== 0) {
    console.error(
      "Generated types are out of date. Run `npm run types:generate` and commit the result.",
    );
    process.exit(1);
  }
  console.log("Generated types are up to date.");
}
