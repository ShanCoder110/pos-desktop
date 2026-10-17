import { isAbortError } from "@/utils/async";

/**
 * Message for error toasts. Returns `null` for AbortError so callers skip toasting
 * cancelled fetches (Strict Mode remount, route change) without hiding real errors.
 */
export function errorToastMessage(error: unknown, fallback: string): string | null {
  if (isAbortError(error)) return null;
  if (error instanceof Error && error.message.trim()) return error.message;
  return fallback;
}
