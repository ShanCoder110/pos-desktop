import { spawn } from "node:child_process";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { cargoSpawn } from "./cargo.mjs";

const root = fileURLToPath(new URL("..", import.meta.url));
const tauriBin = join(
  root,
  "node_modules",
  ".bin",
  process.platform === "win32" ? "tauri.cmd" : "tauri",
);
const { env } = cargoSpawn();

const child = spawn(tauriBin, process.argv.slice(2), {
  cwd: root,
  env,
  stdio: "inherit",
});

child.on("error", (error) => {
  console.error(`Could not start Tauri CLI: ${error.message}`);
  process.exit(1);
});

child.on("exit", (code) => process.exit(code ?? 1));
