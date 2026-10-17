import { isAbortError } from "@/utils/async";

/**
 * Side-query helper for product hub loads: keep AbortError canceling the hub
 * refresh, but return `fallback` for real failures so the catalog still paints.
 */
export async function hubSideQuery<T>(promise: Promise<T>, fallback: T): Promise<T> {
  try {
    return await promise;
  } catch (error) {
    if (isAbortError(error)) throw error;
    return fallback;
  }
}
