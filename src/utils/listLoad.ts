import { errorToastMessage } from "@/utils/toastErrors";

/** Outcome of a list fetch after abort / error / empty / data classification. */
export type ListFetchOutcome<T> =
  | { kind: "aborted" }
  | { kind: "error"; message: string }
  | { kind: "empty" }
  | { kind: "data"; rows: T[] };

/**
 * Classify a list-fetch result for UI state.
 * - AbortError → silent (`aborted`) — intentional navigation/unmount only.
 * - Network / 5xx / other failures → `error` with a toastable message.
 * - Successful empty array → `empty` (never treat failures as empty).
 * - Successful non-empty → `data`.
 */
export function classifyListFetch<T>(
  result: { ok: true; rows: T[] } | { ok: false; error: unknown },
  fallback: string,
): ListFetchOutcome<T> {
  if (!result.ok) {
    const message = errorToastMessage(result.error, fallback);
    if (message == null) return { kind: "aborted" };
    return { kind: "error", message };
  }
  if (result.rows.length === 0) return { kind: "empty" };
  return { kind: "data", rows: result.rows };
}
