import { API_ERROR_COPY } from "@/shared/constants/errors";
import { logger } from "@/utils/logger";

export class ApiError extends Error {
  readonly code: string;
  readonly details?: unknown;
  readonly status?: number;

  constructor(opts: { code: string; message: string; details?: unknown; status?: number }) {
    super(opts.message);
    this.name = "ApiError";
    this.code = opts.code;
    this.details = opts.details;
    this.status = opts.status;
  }
}

/** Map API/network errors to a short user-facing string (for toasts). */
export function mapApiError(error: unknown, fallback: string): string {
  if (error instanceof ApiError) {
    const override = API_ERROR_COPY[error.code];
    if (override) return override;
    if (error.message.trim()) return error.message.trim();
  }
  if (error instanceof Error && error.message.trim()) return error.message.trim();
  return fallback;
}

/** Log + return toast text. Use at catch sites instead of ad-hoc message guessing. */
export function handleApiError(error: unknown, fallback: string): string {
  if (error instanceof ApiError) {
    logger.warn("api.error", { code: error.code, status: error.status, message: error.message });
  } else {
    logger.warn("api.error.unknown", { error: String(error) });
  }
  return mapApiError(error, fallback);
}
