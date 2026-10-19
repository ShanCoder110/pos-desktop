/**
 * Start the local Axum API, or reuse it when already healthy on the loopback port.
 * Never attaches to the installed Dukan app (different SQLite / port after update).
 */
import { spawn } from "node:child_process";
import { fileURLToPath, pathToFileURL } from "node:url";
import { cargoSpawn } from "./cargo.mjs";
import {
  API_PORT,
  freePort,
  isApiHealthy,
  isDesktopAppOnApiPort,
  waitForApiHealthy,
} from "./local-ports.mjs";

const root = fileURLToPath(new URL("..", import.meta.url));
const cargo = cargoSpawn();

function exitDesktopConflict() {
  console.error(
    `[dev] Port :${API_PORT} is in use by the installed Dukan app (app-data DB).`,
  );
  console.error(
    `[dev] Quit Dukan to run local Vite, or use a release that listens on :38581.`,
  );
  process.exit(1);
}

export async function startLocalApi({ inheritStdio = true } = {}) {
  // Never reuse packaged Dukan — healthy /health but wrong SQLite path.
  if (isDesktopAppOnApiPort()) {
    exitDesktopConflict();
  }

  if (await isApiHealthy()) {
    console.log(`[dev] API already healthy on :${API_PORT} — reusing`);
    return { child: null, reused: true };
  }

  const freed = await freePort(API_PORT, "API");
  if (freed === "blocked") {
    exitDesktopConflict();
  }

  const child = spawn(
    cargo.command,
    ["run", "--manifest-path", "src-tauri/Cargo.toml", "--bin", "api"],
    {
      cwd: root,
      env: cargo.env,
      stdio: inheritStdio ? "inherit" : "pipe",
    },
  );

  child.on("error", (error) => {
    console.error(`[dev] Could not start API: ${error.message}`);
  });

  const ready = await waitForApiHealthy(120_000);
  if (!ready) {
    console.error(
      `[dev] API did not become healthy on :${API_PORT}. Fix cargo/build errors above, then retry.`,
    );
    if (child.exitCode == null) child.kill("SIGTERM");
    process.exit(1);
  }

  console.log(`[dev] API ready on :${API_PORT}`);
  return { child, reused: false };
}

const isMain =
  Boolean(process.argv[1]) && import.meta.url === pathToFileURL(process.argv[1]).href;

if (isMain) {
  // No top-level await — Node warns (and can exit) when a TLA wait never settles.
  startLocalApi()
    .then(({ child }) => {
      if (!child) {
        console.log("[dev] Existing API left running. Start Vite with: npm run dev");
        process.exit(0);
        return;
      }
      child.on("exit", (code) => process.exit(code ?? 1));
    })
    .catch((error) => {
      console.error(`[dev] API failed: ${error instanceof Error ? error.message : error}`);
      process.exit(1);
    });
}
