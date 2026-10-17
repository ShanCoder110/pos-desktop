import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

const runNumber = Number.parseInt(process.argv[2] ?? "", 10);
if (!Number.isSafeInteger(runNumber) || runNumber < 1) {
  throw new Error("A positive GitHub run number is required");
}

const configPath = resolve("src-tauri/tauri.conf.json");
const config = JSON.parse(await readFile(configPath, "utf8"));
const [major, minor, patch] = String(config.version)
  .split(".")
  .map((part) => Number.parseInt(part, 10));

if (![major, minor, patch].every(Number.isSafeInteger)) {
  throw new Error(`Invalid base application version: ${config.version}`);
}

config.version = `${major}.${minor}.${patch + runNumber}`;
await writeFile(configPath, `${JSON.stringify(config, null, 2)}\n`);
console.log(`Windows release version: ${config.version}`);
