import { useEffect, useState } from "react";
import { AppUpdateStatus, type AppUpdateViewState } from "@/components/common/AppUpdateStatus";
import { toaster } from "@/components/common/Toast";
import { installAvailableDesktopUpdate } from "@/services/appUpdater";

let updateCheckStarted = false;

/** Startup-only updater. Windows exits and restarts through the passive installer after download. */
export function AppUpdateAgent() {
  const [state, setState] = useState<AppUpdateViewState | null>(null);

  useEffect(() => {
    const timeout = window.setTimeout(() => {
      if (updateCheckStarted) return;
      updateCheckStarted = true;
      void installAvailableDesktopUpdate((progress) => {
        setState(progress);
        if (progress.phase === "current") window.setTimeout(() => setState(null), 2_500);
      }).catch((error) => {
        console.error("Automatic update failed", error);
        setState({ phase: "error", message: "Dukan will try again the next time it starts." });
        toaster.warn("Could not check for updates. Dukan will try again next time.");
        window.setTimeout(() => setState(null), 7_000);
      });
    }, 2_000);

    return () => window.clearTimeout(timeout);
  }, []);

  return <AppUpdateStatus state={state} />;
}
