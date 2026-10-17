import { useEffect } from "react";
import { toaster } from "@/components/common/Toast";
import { installAvailableDesktopUpdate } from "@/services/appUpdater";

let updateCheckStarted = false;

/** Startup-only updater. Windows exits and restarts through the passive installer after download. */
export function AppUpdateAgent() {
  useEffect(() => {
    if (updateCheckStarted) return;
    updateCheckStarted = true;

    const timeout = window.setTimeout(() => {
      let announcedDownload = false;
      void installAvailableDesktopUpdate((progress) => {
        if (progress.phase === "available") {
          toaster.info(`Update ${progress.version} found`);
        } else if (progress.phase === "downloading" && !announcedDownload) {
          announcedDownload = true;
          toaster.info("Downloading update…");
        } else if (progress.phase === "installing") {
          toaster.success("Update ready. Restarting POS…");
        }
      }).catch((error) => {
        console.error("Automatic update failed", error);
        toaster.warn("Could not check for updates. POS will try again next time.");
      });
    }, 2_000);

    return () => window.clearTimeout(timeout);
  }, []);

  return null;
}
