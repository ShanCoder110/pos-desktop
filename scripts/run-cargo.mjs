import { spawn } from "node:child_process";
import { cargoSpawn } from "./cargo.mjs";

const { command, env } = cargoSpawn();
const child = spawn(command, process.argv.slice(2), {
  env,
  stdio: "inherit",
});
child.on("error", (error) => {
  console.error(`Could not start cargo (${command}). Install Rust from https://rustup.rs`);
  console.error(error.message);
  process.exit(1);
});
child.on("exit", (code) => process.exit(code ?? 1));
