import { spawn } from "node:child_process";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { cargoSpawn } from "./cargo.mjs";

const root = fileURLToPath(new URL("..", import.meta.url));
// Execute the CLI's JavaScript entrypoint directly. Spawning a `.cmd` shim
// without a shell fails with EINVAL on Windows/Node 22 (including GitHub Actions).
const tauriCli = join(root, "node_modules", "@tauri-apps", "cli", "tauri.js");
const { env } = cargoSpawn();

const child = spawn(process.execPath, [tauriCli, ...process.argv.slice(2)], {
  cwd: root,
  env,
  stdio: "inherit",
});

child.on("error", (error) => {
  console.error(`Could not start Tauri CLI: ${error.message}`);
  process.exit(1);
});

child.on("exit", (code) => process.exit(code ?? 1));
