import type {
  AuthStatusResponse,
  LoginRequest,
  LoginResponse,
  MeResponse,
} from "@/types/generated";
import { API_ROUTES } from "@/shared/constants/api";
import { AUTH_ENABLED } from "@/shared/auth/session";
import { apiRequest } from "@/services/api";
import { clearTokens, getAccessToken, setTokens } from "@/services/authToken";
import { getDeviceId } from "@/utils/device";
import { isAbortError } from "@/utils/async";

export type AuthUser = LoginResponse["user"];
export type LoginPayload = LoginRequest;
export type { LoginResponse, AuthStatusResponse, MeResponse };

export interface SetupPayload {
  shopName: string;
  address: string;
  ownerName: string;
  username: string;
  password: string;
  phone?: string;
  email?: string;
  deviceId: string;
  deviceName?: string;
  tagline?: string;
  contactLine?: string;
  showLogo?: boolean;
}

export type SetupFormPayload = Omit<SetupPayload, "deviceId" | "deviceName"> & {
  deviceName?: string;
};

export interface CashSessionResponse {
  id: string;
  branchId: string;
  deviceId: string;
  cashierId: string;
  status: string;
  openingFloat: number;
  expectedCash?: number | null;
  countedCash?: number | null;
  variance?: number | null;
  notes?: string | null;
  openedAt: string;
  closedAt?: string | null;
  createdAt: string;
  updatedAt: string;
}

let ensurePromise: Promise<MeResponse | null> | null = null;
let cachedSession: { token: string; value: MeResponse } | null = null;

function storeLoginResponse(response: LoginResponse) {
  cachedSession = null;
  setTokens(response.token, response.refreshToken);
}

export function authStatus(signal?: AbortSignal) {
  return apiRequest<AuthStatusResponse>(API_ROUTES.authStatus, { signal });
}

/**
 * A packaged first launch can spend a few seconds creating and migrating its
 * local database. Keep onboarding in its loading state until the embedded API
 * is ready instead of incorrectly falling back to the login screen.
 */
export async function authStatusWhenReady(signal?: AbortSignal) {
  const attempts = 20;
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      return await authStatus(signal);
    } catch (error) {
      if (isAbortError(error) || attempt === attempts) throw error;
      await new Promise<void>((resolve, reject) => {
        const onAbort = () => {
          window.clearTimeout(timer);
          reject(new DOMException("Aborted", "AbortError"));
        };
        const timer = window.setTimeout(() => {
          signal?.removeEventListener("abort", onAbort);
          resolve();
        }, 500);
        signal?.addEventListener("abort", onAbort, { once: true });
      });
    }
  }
  throw new Error("The local backend is unavailable.");
}

export function setupShop(payload: SetupPayload) {
  return apiRequest<LoginResponse>(API_ROUTES.authSetup, {
    method: "POST",
    body: JSON.stringify(payload),
  }).then((response) => {
    storeLoginResponse(response);
    return response;
  });
}

export function login(payload: LoginPayload) {
  return apiRequest<LoginResponse>(API_ROUTES.authLogin, {
    method: "POST",
    body: JSON.stringify(payload),
  }).then((response) => {
    storeLoginResponse(response);
    return response;
  });
}

export function me(signal?: AbortSignal) {
  return apiRequest<MeResponse>(API_ROUTES.authMe, { signal });
}

export function currentCashSession(signal?: AbortSignal) {
  return apiRequest<CashSessionResponse | null>(API_ROUTES.cashSessionsCurrent, { signal });
}

export function openCashSession(openingFloat = 0) {
  return apiRequest<CashSessionResponse>(API_ROUTES.cashSessionsOpen, {
    method: "POST",
    body: JSON.stringify({ openingFloat }),
  });
}

export async function ensureCashSession(signal?: AbortSignal) {
  const current = await currentCashSession(signal);
  return current ?? openCashSession(0);
}

export async function logout() {
  try {
    if (getAccessToken()) {
      await apiRequest<{ revoked: boolean }>(API_ROUTES.authLogout, { method: "POST" });
    }
  } catch {
    // Token may already be invalid; clear locally anyway.
  } finally {
    cachedSession = null;
    clearTokens();
  }
}

/**
 * Validates the current session. Do not pass a page AbortSignal into `me()` —
 * React Strict Mode aborts the first mount, and a shared aborted promise
 * would make the second mount look logged-out / empty until a hard refresh.
 */
export function ensureSession(signal?: AbortSignal): Promise<MeResponse | null> {
  if (signal?.aborted) {
    return Promise.reject(new DOMException("Aborted", "AbortError"));
  }
  if (!AUTH_ENABLED) {
    return ensureDevSession();
  }
  const token = getAccessToken();
  if (cachedSession?.token === token) return Promise.resolve(cachedSession.value);
  if (!ensurePromise) {
    ensurePromise = (async () => {
      if (!token) return null;
      try {
        const session = await me();
        if (getAccessToken() === token) cachedSession = { token, value: session };
        return session;
      } catch (error) {
        if (isAbortError(error)) throw error;
        cachedSession = null;
        clearTokens();
        return null;
      }
    })().finally(() => {
      ensurePromise = null;
    });
  }
  return ensurePromise;
}

/** When auth screens are disabled, only reuse an existing token — no seed login. */
function ensureDevSession(): Promise<MeResponse | null> {
  const token = getAccessToken();
  if (cachedSession?.token === token) return Promise.resolve(cachedSession.value);
  if (!ensurePromise) {
    ensurePromise = (async () => {
      if (!token) return null;
      try {
        const session = await me();
        if (getAccessToken() === token) cachedSession = { token, value: session };
        return session;
      } catch (error) {
        if (isAbortError(error)) throw error;
        cachedSession = null;
        clearTokens();
        return null;
      }
    })().finally(() => {
      ensurePromise = null;
    });
  }
  return ensurePromise;
}

export function loginWithDevice(email: string, password: string) {
  return login({
    email: email.trim(),
    password,
    deviceId: getDeviceId(),
  });
}
