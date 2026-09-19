import { API_BASE_URL, API_ERRORS, API_HEADERS, API_ROUTES } from "@/shared/constants/api";
import { clearTokens, getAccessToken, getRefreshToken, setTokens } from "@/services/authToken";
import { ApiError } from "@/utils/apiError";
import { getDeviceId } from "@/utils/device";
import { isAbortError } from "@/utils/async";

export interface PaginationMeta {
  totalItems: number;
  totalPages: number;
  currentPage: number;
  perPage: number;
  hasNextPage: boolean;
  hasPreviousPage: boolean;
}

export interface PaginatedResponse<T> {
  data: T[];
  meta: PaginationMeta;
}

export interface ApiErrorBody {
  error: {
    code: string;
    message: string;
    details?: unknown;
  };
}

export type QueryValue = string | number | boolean | null | undefined;

const PUBLIC_AUTH_PATHS = new Set<string>([
  API_ROUTES.authStatus,
  API_ROUTES.authSetup,
  API_ROUTES.authRefresh,
  API_ROUTES.authLogin,
  API_ROUTES.health,
]);

let refreshPromise: Promise<void> | null = null;

export function queryString(values: object) {
  const params = new URLSearchParams();
  Object.entries(values as Record<string, QueryValue>).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== "") params.set(key, String(value));
  });
  const encoded = params.toString();
  return encoded ? `?${encoded}` : "";
}

async function refreshAccessToken(): Promise<void> {
  if (!refreshPromise) {
    refreshPromise = (async () => {
      const refreshToken = getRefreshToken();
      if (!refreshToken) {
        clearTokens();
        throw new ApiError({ code: "UNAUTHORIZED", message: API_ERRORS.sessionExpired });
      }
      let response: Response;
      try {
        response = await fetch(`${API_BASE_URL}${API_ROUTES.authRefresh}`, {
          method: "POST",
          headers: {
            Accept: API_HEADERS.accept,
            "Content-Type": API_HEADERS.contentType,
          },
          body: JSON.stringify({
            refreshToken,
            deviceId: getDeviceId(),
          }),
        });
      } catch (error) {
        if (isAbortError(error)) throw error;
        throw new ApiError({ code: "INTERNAL_ERROR", message: API_ERRORS.backendUnavailable });
      }
      if (!response.ok) {
        clearTokens();
        const payload = (await response.json().catch(() => null)) as ApiErrorBody | null;
        throw new ApiError({
          code: payload?.error?.code ?? "UNAUTHORIZED",
          message: payload?.error?.message ?? API_ERRORS.sessionExpired,
          details: payload?.error?.details,
          status: response.status,
        });
      }
      const data = (await response.json()) as {
        token: string;
        refreshToken: string;
      };
      setTokens(data.token, data.refreshToken);
    })().finally(() => {
      refreshPromise = null;
    });
  }
  return refreshPromise;
}

export async function apiRequest<T>(
  path: string,
  options: RequestInit = {},
  allowRefresh = true,
): Promise<T> {
  const token = getAccessToken();
  let response: Response;
  try {
    response = await fetch(`${API_BASE_URL}${path}`, {
      ...options,
      headers: {
        Accept: API_HEADERS.accept,
        ...(options.body ? { "Content-Type": API_HEADERS.contentType } : {}),
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...options.headers,
      },
    });
  } catch (error) {
    if (isAbortError(error)) throw error;
    throw new ApiError({ code: "INTERNAL_ERROR", message: API_ERRORS.backendUnavailable });
  }

  if (
    response.status === 401 &&
    allowRefresh &&
    !PUBLIC_AUTH_PATHS.has(path) &&
    getRefreshToken()
  ) {
    await refreshAccessToken();
    return apiRequest<T>(path, options, false);
  }

  if (!response.ok) {
    const payload = (await response.json().catch(() => null)) as
      (ApiErrorBody & { message?: string }) | null;
    throw new ApiError({
      code: payload?.error?.code ?? "INTERNAL_ERROR",
      message: payload?.error?.message ?? payload?.message ?? API_ERRORS.requestFailed,
      details: payload?.error?.details,
      status: response.status,
    });
  }

  if (response.status === 204) return undefined as T;
  const text = await response.text();
  if (!text) return undefined as T;
  return JSON.parse(text) as T;
}
