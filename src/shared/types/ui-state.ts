/**
 * Shared UI state shapes — prefer one discriminated object over N booleans.
 * If TanStack Query (or similar) already owns async status for a fetch, use that;
 * do not wrap it in a second parallel LoadingState.
 */

export type LoadingState =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "success" }
  | { status: "error"; message: string };

/** Drawer open/mode as one state — avoids stale selectedId when opening create. */
export type DrawerState<TId extends string = string> =
  { mode: "closed" } | { mode: "create" } | { mode: "edit"; id: TId } | { mode: "view"; id: TId };

export type ButtonState = "default" | "loading" | "disabled";
