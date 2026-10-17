import type { AppUpdateProgress } from "@/services/appUpdater";

export type AppUpdateViewState = AppUpdateProgress | { phase: "error"; message: string };

function updateCopy(state: AppUpdateViewState) {
  if (state.phase === "checking") {
    return { title: "Checking for updates", detail: "Looking for the latest Dukan version…" };
  }
  if (state.phase === "available") {
    return { title: `Update ${state.version} found`, detail: "Preparing the secure download…" };
  }
  if (state.phase === "downloading") {
    const percent = state.total
      ? Math.min(100, Math.round((state.downloaded / state.total) * 100))
      : undefined;
    return {
      title: percent === undefined ? "Downloading update" : `Downloading update · ${percent}%`,
      detail: "You can continue working while the update downloads.",
      percent,
    };
  }
  if (state.phase === "installing") {
    return { title: `Installing ${state.version}`, detail: "Dukan will restart automatically." };
  }
  if (state.phase === "current") {
    return { title: "Dukan is up to date", detail: "You already have the latest version." };
  }
  return { title: "Update could not be installed", detail: state.message };
}

export function AppUpdateStatus({ state }: { state: AppUpdateViewState | null }) {
  if (!state) return null;
  const copy = updateCopy(state);
  const active = state.phase !== "current" && state.phase !== "error";

  return (
    <aside
      className="fixed right-5 top-5 z-[100] w-[min(360px,calc(100vw-40px))] overflow-hidden rounded-2xl border border-line bg-paper shadow-2xl"
      role="status"
      aria-live="polite"
      aria-label={copy.title}
    >
      <div className="flex items-start gap-3 p-4">
        <span
          className={`mt-0.5 grid h-9 w-9 shrink-0 place-items-center rounded-xl text-[17px] ${state.phase === "error" ? "bg-danger/10 text-danger" : state.phase === "current" ? "bg-sale-bg text-sale" : "bg-accent-bg text-accent"}`}
          aria-hidden="true"
        >
          {state.phase === "error" ? "!" : state.phase === "current" ? "✓" : "↻"}
        </span>
        <span className="min-w-0">
          <strong className="block text-[13px] font-extrabold text-ink">{copy.title}</strong>
          <small className="mt-1 block text-[11px] leading-relaxed text-muted">{copy.detail}</small>
        </span>
      </div>
      {active ? (
        <div className="h-1.5 overflow-hidden bg-bg">
          <div
            className={`h-full rounded-r-full bg-accent transition-[width] duration-300 ${copy.percent === undefined ? "w-1/2 animate-pulse" : ""}`}
            style={copy.percent === undefined ? undefined : { width: `${copy.percent}%` }}
          />
        </div>
      ) : null}
    </aside>
  );
}
