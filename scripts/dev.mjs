import { spawn } from "node:child_process";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { cargoSpawn } from "./cargo.mjs";

const root = fileURLToPath(new URL("..", import.meta.url));
const viteJs = join(dirname(createRequire(import.meta.url).resolve("vite/package.json")), "bin/vite.js");
const children = [];

function run(command, args, env = process.env) {
  const child = spawn(command, args, {
    cwd: root,
    env,
    stdio: "inherit",
  });
  child.on("error", (error) => {
    console.error(`Could not start ${command}: ${error.message}`);
  });
  children.push(child);
  return child;
}

const cargo = cargoSpawn();
run(cargo.command, ["run", "--manifest-path", "src-tauri/Cargo.toml", "--bin", "api"], cargo.env);
run(process.execPath, [viteJs]);

function shutdown() {
  for (const child of children) {
    if (child.exitCode == null) child.kill("SIGTERM");
  }
}

process.on("SIGINT", () => {
  shutdown();
  process.exit(0);
});
process.on("SIGTERM", () => {
  shutdown();
  process.exit(0);
});
