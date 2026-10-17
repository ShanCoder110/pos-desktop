import { isTauri } from "@tauri-apps/api/core";
import { check, type DownloadEvent } from "@tauri-apps/plugin-updater";

export type AppUpdateProgress =
  | { phase: "checking" }
  | { phase: "available"; version: string }
  | { phase: "downloading"; downloaded: number; total?: number }
  | { phase: "installing"; version: string }
  | { phase: "current" };

/** Checks the signed desktop release feed and installs a newer build when available. */
export async function installAvailableDesktopUpdate(
  onProgress?: (progress: AppUpdateProgress) => void,
) {
  if (!isTauri()) return { installed: false as const, reason: "browser" as const };

  onProgress?.({ phase: "checking" });
  const update = await check({ timeout: 30_000 });
  if (!update) {
    onProgress?.({ phase: "current" });
    return { installed: false as const, reason: "current" as const };
  }

  onProgress?.({ phase: "available", version: update.version });
  let downloaded = 0;
  let total: number | undefined;
  await update.downloadAndInstall((event: DownloadEvent) => {
    if (event.event === "Started") {
      total = event.data.contentLength;
      onProgress?.({ phase: "downloading", downloaded, total });
    } else if (event.event === "Progress") {
      downloaded += event.data.chunkLength;
      onProgress?.({ phase: "downloading", downloaded, total });
    } else {
      onProgress?.({ phase: "installing", version: update.version });
    }
  });

  return { installed: true as const, version: update.version };
}
