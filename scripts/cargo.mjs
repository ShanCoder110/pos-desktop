import { existsSync } from "node:fs";
import { homedir } from "node:os";
import { delimiter, join } from "node:path";

export function cargoSpawn() {
  const bin = join(homedir(), ".cargo", "bin");
  const exe = process.platform === "win32" ? "cargo.exe" : "cargo";
  const local = join(bin, exe);
  return {
    command: existsSync(local) ? local : exe,
    env: {
      ...process.env,
      PATH: `${bin}${delimiter}${process.env.PATH ?? ""}`,
    },
  };
}
