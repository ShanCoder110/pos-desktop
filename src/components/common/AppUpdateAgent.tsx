import { useEffect, useState } from "react";
import { AppUpdateStatus, type AppUpdateViewState } from "@/components/common/AppUpdateStatus";
import { installAvailableDesktopUpdate } from "@/services/appUpdater";

let updateCheckStarted = false;

/**
 * Startup-only updater. Silent when already current.
 * Shows UI only when an update is found, then downloads/installs and relaunches.
 */
export function AppUpdateAgent() {
  const [state, setState] = useState<AppUpdateViewState | null>(null);

  useEffect(() => {
    const timeout = window.setTimeout(() => {
      if (updateCheckStarted) return;
      updateCheckStarted = true;
      void installAvailableDesktopUpdate((progress) => {
        // Never surface "checking" / "up to date" — those fire on every open.
        if (progress.phase === "checking" || progress.phase === "current") return;
        setState(progress);
      }).catch((error) => {
        console.error("Automatic update failed", error);
        // Silent on open — retry next launch; no toast for check failures.
      });
    }, 2_000);

    return () => window.clearTimeout(timeout);
  }, []);

  return <AppUpdateStatus state={state} />;
}
