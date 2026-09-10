import { API_BASE_URL, API_ERRORS, API_HEADERS } from "@/shared/constants/api";
import { getToken } from "@/services/authToken";

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

export function queryString(values: object) {
  const params = new URLSearchParams();
  Object.entries(values as Record<string, QueryValue>).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== "") params.set(key, String(value));
  });
  const encoded = params.toString();
  return encoded ? `?${encoded}` : "";
}

export async function apiRequest<T>(
  path: string,
  options: RequestInit = {},
): Promise<T> {
  const token = getToken();
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
  } catch {
    throw new Error(API_ERRORS.backendUnavailable);
  }

  if (!response.ok) {
    const payload = await response.json().catch(() => null) as (ApiErrorBody & { message?: string }) | null;
    throw new Error(payload?.error?.message ?? payload?.message ?? API_ERRORS.requestFailed);
  }

  if (response.status === 204) return undefined as T;
  const text = await response.text();
  if (!text) return undefined as T;
  return JSON.parse(text) as T;
}
