import { spawn } from "node:child_process";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { startLocalApi } from "./run-api.mjs";
import { API_PORT, VITE_PORT, freePort, isApiHealthy } from "./local-ports.mjs";

const root = fileURLToPath(new URL("..", import.meta.url));
const viteJs = join(dirname(createRequire(import.meta.url).resolve("vite/package.json")), "bin/vite.js");
const children = [];

function track(child) {
  if (child) children.push(child);
  return child;
}

function shutdown() {
  for (const child of children) {
    if (child.exitCode == null) {
      try {
        child.kill("SIGTERM");
      } catch {
        /* ignore */
      }
    }
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

const { child: apiChild, reused } = await startLocalApi();
track(apiChild);

if (apiChild) {
  apiChild.on("exit", (code, signal) => {
    if (code === 0 || signal === "SIGTERM" || signal === "SIGINT") return;
    console.error(
      `[dev] API exited unexpectedly (code ${code ?? "null"}). UI will show "local backend is unavailable" until you restart: npm run dev`,
    );
  });
}

await freePort(VITE_PORT, "Vite");

const vite = track(
  spawn(process.execPath, [viteJs, "--port", String(VITE_PORT), "--strictPort"], {
    cwd: root,
    env: process.env,
    stdio: "inherit",
  }),
);

vite.on("error", (error) => {
  console.error(`[dev] Could not start Vite: ${error.message}`);
  shutdown();
  process.exit(1);
});

vite.on("exit", (code) => {
  if (!reused) shutdown();
  process.exit(code ?? 1);
});

if (reused) {
  let warned = false;
  const timer = setInterval(() => {
    void isApiHealthy().then((ok) => {
      if (ok) {
        warned = false;
        return;
      }
      if (warned) return;
      warned = true;
      console.error(`[dev] API on :${API_PORT} stopped responding. Run: npm run backend`);
    });
  }, 15_000);
  timer.unref?.();
}
