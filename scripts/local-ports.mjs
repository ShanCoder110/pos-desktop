import { execFileSync } from "node:child_process";
import { platform } from "node:os";

/** Keep in sync with `src-tauri/src/backend/constants.rs`. */
export const API_PORT = Number(process.env.API_PORT || 38580);
export const DESKTOP_API_PORT = Number(process.env.DESKTOP_API_PORT || 38581);
export const VITE_PORT = Number(process.env.VITE_PORT || 1430);
export const API_HEALTH_URL =
  process.env.DUKAN_API_HEALTH_URL || `http://127.0.0.1:${API_PORT}/api/v1/health`;

export function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function isApiHealthy(timeoutMs = 900) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(API_HEALTH_URL, {
      signal: controller.signal,
      headers: { Accept: "application/json" },
    });
    if (!response.ok) return false;
    const body = await response.json().catch(() => null);
    return body?.status === "ok" || body?.status === "OK";
  } catch {
    return false;
  } finally {
    clearTimeout(timer);
  }
}

/** PID listening on TCP port, or null. */
export function listenerPid(port) {
  try {
    if (platform() === "win32") {
      const out = execFileSync(
        "cmd.exe",
        ["/c", `netstat -ano | findstr :${port} | findstr LISTENING`],
        { encoding: "utf8" },
      );
      const match = out.trim().split(/\r?\n/).find(Boolean)?.match(/\s(\d+)\s*$/);
      return match ? Number(match[1]) : null;
    }
    const out = execFileSync(
      "lsof",
      ["-nP", `-iTCP:${port}`, "-sTCP:LISTEN", "-t"],
      { encoding: "utf8" },
    );
    const pid = Number(out.trim().split(/\n/)[0]);
    return Number.isFinite(pid) && pid > 0 ? pid : null;
  } catch {
    return null;
  }
}

/** Command line / image name for a PID (best effort). */
export function listenerCommand(pid) {
  if (!pid) return "";
  try {
    if (platform() === "win32") {
      const out = execFileSync(
        "cmd.exe",
        ["/c", `wmic process where processid=${pid} get Name,CommandLine /FORMAT:LIST`],
        { encoding: "utf8" },
      );
      return out.replace(/\r/g, "").trim();
    }
    return execFileSync("ps", ["-p", String(pid), "-o", "command="], {
      encoding: "utf8",
    }).trim();
  } catch {
    return "";
  }
}

/**
 * Packaged Dukan / `tauri-app` desktop — not the cargo `api` bin.
 * Reusing that listener for Vite would hit the wrong SQLite DB.
 */
export function isDesktopDukanListener(pid) {
  const cmd = listenerCommand(pid).toLowerCase();
  if (!cmd) return false;
  if (
    /(^|[/\s\\])api(\.exe)?(\s|$)/.test(cmd) &&
    (/cargo/.test(cmd) || /target[/\\](debug|release)[/\\]api/.test(cmd))
  ) {
    return false;
  }
  return (
    /\bdukan(\.exe)?\b/.test(cmd) ||
    /\btauri-app(\.exe)?\b/.test(cmd) ||
    /dukan\.app\b/.test(cmd) ||
    /[/\\]applications[/\\]dukan/.test(cmd)
  );
}

/** Installed/desktop Dukan is listening on the Vite loopback port. */
export function isDesktopAppOnApiPort() {
  const pid = listenerPid(API_PORT);
  return pid != null && isDesktopDukanListener(pid);
}

/**
 * Free a port by stopping a stale listener.
 * @returns {true | false | "blocked"} — `"blocked"` when packaged Dukan owns the port.
 */
export async function freePort(port, label) {
  const pid = listenerPid(port);
  if (!pid || pid === process.pid) return false;

  if (label === "API" && isDesktopDukanListener(pid)) {
    console.error(
      `[dev] Port :${port} is held by the installed Dukan app (pid ${pid}).`,
    );
    console.error(
      `[dev] Quit Dukan, or update to a build that uses :${DESKTOP_API_PORT} for the desktop API.`,
    );
    console.error(
      `[dev] Local Vite / npm run backend use :${API_PORT}; packaged Dukan uses :${DESKTOP_API_PORT}.`,
    );
    return "blocked";
  }

  console.log(`[dev] Stopping stale ${label} on :${port} (pid ${pid})`);
  try {
    process.kill(pid, "SIGTERM");
  } catch {
    /* already gone */
  }
  for (let i = 0; i < 20; i++) {
    await sleep(100);
    if (listenerPid(port) !== pid) return true;
  }
  try {
    process.kill(pid, "SIGKILL");
  } catch {
    /* ignore */
  }
  await sleep(200);
  return listenerPid(port) !== pid;
}

export async function waitForApiHealthy(timeoutMs = 90_000) {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    if (await isApiHealthy()) return true;
    await sleep(400);
  }
  return false;
}
