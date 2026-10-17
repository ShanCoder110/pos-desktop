import { ApiError } from "@/utils/apiError";
import { isAbortError } from "@/utils/async";

/**
 * Side-query helper for product hub loads.
 * Soft-fails only on 403 Forbidden (role edges cashiers must skip quietly).
 * AbortError still cancels the hub refresh. Other errors rethrow so real
 * INTERNAL_ERROR is not hidden behind an empty catalog.
 */
export async function hubSideQuery<T>(promise: Promise<T>, fallback: T): Promise<T> {
  try {
    return await promise;
  } catch (error) {
    if (isAbortError(error)) throw error;
    if (error instanceof ApiError && (error.status === 403 || error.code === "FORBIDDEN")) {
      return fallback;
    }
    throw error;
  }
}
