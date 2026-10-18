/**
 * Fail-fast check for Tauri updater signing secrets (CI).
 * Never prints the private key or password.
 */
import { spawnSync } from "node:child_process";
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("..", import.meta.url));
const tauriCli = join(root, "node_modules", "@tauri-apps", "cli", "tauri.js");

const key = process.env.TAURI_SIGNING_PRIVATE_KEY ?? "";
const password = process.env.TAURI_SIGNING_PRIVATE_KEY_PASSWORD ?? "";

function fail(message) {
  console.error(`Updater signing check failed: ${message}`);
  process.exit(1);
}

if (!key.trim()) {
  fail(
    "TAURI_SIGNING_PRIVATE_KEY is empty. Set the GitHub Actions secret to the full contents of ~/.tauri/pos-updater.key",
  );
}

if (key.includes("PUBLIC KEY") || key.includes("public key")) {
  fail("TAURI_SIGNING_PRIVATE_KEY looks like a public key. Paste the private .key file contents instead.");
}

if (key.length < 80) {
  fail(
    `TAURI_SIGNING_PRIVATE_KEY looks truncated (${key.length} chars). Re-paste the full one-line key from pos-updater.key.`,
  );
}

// Encrypted minisign/rsign keys need a password; empty password is only valid for unencrypted keys.
if (!password) {
  console.warn(
    "Warning: TAURI_SIGNING_PRIVATE_KEY_PASSWORD is empty. Only OK if the key was generated without a password.",
  );
}

const dir = mkdtempSync(join(tmpdir(), "dukan-sign-check-"));
const file = join(dir, "probe.bin");
writeFileSync(file, "dukan-updater-signing-probe\n");

const result = spawnSync(process.execPath, [tauriCli, "signer", "sign", file], {
  cwd: root,
  env: process.env,
  encoding: "utf8",
});

const combined = `${result.stdout ?? ""}\n${result.stderr ?? ""}`;
rmSync(dir, { recursive: true, force: true });

if (result.status !== 0) {
  if (/Missing comment in secret key|incorrect updater private key password|failed to decode secret key/i.test(combined)) {
    fail(
      "private key or password is wrong/malformed (decode failed). Re-copy ~/.tauri/pos-updater.key into TAURI_SIGNING_PRIVATE_KEY and set TAURI_SIGNING_PRIVATE_KEY_PASSWORD to the generate-time password.",
    );
  }
  const hint = combined
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .slice(-6)
    .join(" | ");
  fail(hint || `tauri signer sign exited ${result.status}`);
}

console.log("Updater signing credentials OK.");
