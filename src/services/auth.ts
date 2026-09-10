import { API_ROUTES, SEED_AUTH } from "@/shared/constants/api";
import { apiRequest } from "@/services/api";
import { clearToken, getToken, setToken } from "@/services/authToken";

export interface AuthUser {
  id: string;
  name: string;
  username: string;
  phone?: string | null;
  email?: string | null;
  role: string;
  defaultBranchId?: string | null;
  isActive: boolean;
  lastLoginAt?: string | null;
  permissions?: { id: string; permissionKey: string; isAllowed: boolean }[];
  createdAt?: string;
  updatedAt?: string;
}

export interface LoginPayload {
  username: string;
  password: string;
  deviceId: string;
}

export interface LoginResponse {
  token: string;
  expiresAt: string;
  user: AuthUser;
  branchId: string;
  deviceId: string;
  cashSessionId?: string | null;
}

export interface MeResponse {
  user: AuthUser;
  sessionId: string;
  branchId: string;
  deviceId: string;
  deviceName?: string | null;
  cashSessionId?: string | null;
}

let ensurePromise: Promise<MeResponse | null> | null = null;

export function login(payload: LoginPayload) {
  return apiRequest<LoginResponse>(API_ROUTES.authLogin, {
    method: "POST",
    body: JSON.stringify(payload),
  }).then((response) => {
    setToken(response.token);
    return response;
  });
}

export function me(signal?: AbortSignal) {
  return apiRequest<MeResponse>(API_ROUTES.authMe, { signal });
}

export async function logout() {
  try {
    if (getToken()) {
      await apiRequest<{ revoked: boolean }>(API_ROUTES.authLogout, { method: "POST" });
    }
  } catch {
    // Token may already be invalid; clear locally anyway.
  } finally {
    clearToken();
  }
}

/** Logs in with seed credentials when no token exists or /auth/me fails. */
export function ensureSession(signal?: AbortSignal): Promise<MeResponse | null> {
  if (!ensurePromise) {
    ensurePromise = (async () => {
      const token = getToken();
      if (token) {
        try {
          return await me(signal);
        } catch {
          clearToken();
        }
      }
      try {
        await login({
          username: SEED_AUTH.username,
          password: SEED_AUTH.password,
          deviceId: SEED_AUTH.deviceId,
        });
        return await me(signal);
      } catch {
        return null;
      }
    })().finally(() => {
      ensurePromise = null;
    });
  }
  return ensurePromise;
}
