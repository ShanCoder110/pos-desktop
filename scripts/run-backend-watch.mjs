import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { cargoSpawn } from "./cargo.mjs";

const root = fileURLToPath(new URL("..", import.meta.url));
const tauriDir = join(root, "src-tauri");
const cargoWatch = join(homedir(), ".cargo", "bin", process.platform === "win32" ? "cargo-watch.exe" : "cargo-watch");

if (!existsSync(cargoWatch)) {
  console.error("cargo-watch is not installed.");
  console.error("Run: npm run backend:watch:setup");
  process.exit(1);
}

const { env } = cargoSpawn();

const child = spawn(cargoWatch, ["-x", "run --bin api"], {
  cwd: tauriDir,
  env,
  stdio: "inherit",
});

child.on("error", (error) => {
  console.error(`Could not start cargo-watch: ${error.message}`);
  process.exit(1);
});

child.on("exit", (code) => process.exit(code ?? 1));
